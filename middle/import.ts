// Import from the tool (ADR 027): the audit and the load of a PMO export
// set over HTTP. Unauthenticated like the rest of the write API until RP3
// (author's decision, 2026-09-08: network access to the VM is the barrier;
// a shared secret was too technical for the handover). The files travel
// base64-encoded in JSON; the middle runs the same audit and load as
// sync/import.ts (adapters/csv-import), so the report the PMO reads in the
// tool is the report the CLI writes. Logs carry counts only.

import { basename } from "node:path";
import type { BoardStorage } from "../core/ports.ts";
import type { BoardConfig } from "../core/types.ts";
import type { ImportAuditResult, ImportLoadResult, ImportSummary } from "../core/import-types.ts";
import { planLoad, renderReport, runImportAudit } from "../adapters/csv-import/index.ts";
import type { AuditResult, InputFile } from "../adapters/csv-import/index.ts";
import { BadRequest } from "./errors.ts";

const MAX_FILES = 12;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_NAME = 200;

// One file entry of the body: a safe name (no path) and decoded bytes.
function parseFile(raw: unknown, index: number): InputFile {
  if (typeof raw !== "object" || raw === null) throw new BadRequest(`Fichier ${index + 1} invalide.`);
  const { name, base64 } = raw as { name?: unknown; base64?: unknown };
  if (typeof name !== "string" || name.trim() === "" || name.length > MAX_NAME) {
    throw new BadRequest(`Fichier ${index + 1} : nom manquant ou trop long.`);
  }
  if (typeof base64 !== "string") throw new BadRequest(`Fichier ${index + 1} : contenu manquant.`);
  if (base64.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 4) {
    throw new BadRequest(`Fichier « ${basename(name)} » trop volumineux (20 Mo max).`);
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) throw new BadRequest(`Fichier « ${basename(name)} » vide ou illisible.`);
  return { name: basename(name.trim()), bytes: new Uint8Array(bytes) };
}

/**
 * Parses the request body into the audit's input files.
 * Input: the JSON body ({ files: [{ name, base64 }] }). Output: the files.
 * Failure: BadRequest (French) on a missing list, too many files, a bad
 * entry, an oversized or empty file.
 */
export function parseFiles(body: unknown): InputFile[] {
  const files = typeof body === "object" && body !== null ? (body as { files?: unknown }).files : undefined;
  if (!Array.isArray(files) || files.length === 0) throw new BadRequest("Aucun fichier reçu.");
  if (files.length > MAX_FILES) throw new BadRequest(`Trop de fichiers (${MAX_FILES} max).`);
  return files.map(parseFile);
}

function summarize(audit: AuditResult): ImportSummary {
  const { report } = audit;
  return {
    received: report.inventory.length,
    recognized: report.inventory.filter((f) => f.status === "recognized" || f.status === "recognized-with-deviations").length,
    taken: report.taken.length,
    discarded: report.discarded.length,
    doubtful: report.doubtful.length,
    warnings: report.warnings.length,
    missing: report.missingExpected.map((m) => m.name),
  };
}

/**
 * Runs the audit over the received files — nothing is written.
 * Inputs: the runtime config, the files, now. Output: the rendered report
 * (Markdown, French), its counts, and whether a load would write cards.
 * Failure: none — every anomaly lands in the report.
 */
export function auditImport(config: BoardConfig, files: InputFile[], now: Date): ImportAuditResult {
  const audit = runImportAudit(files, config, now);
  return { report: renderReport(audit.report, now), summary: summarize(audit), loadable: audit.cards !== null };
}

/**
 * Re-runs the audit and loads the assembled deck: cards and events in one
 * batch, then the capacity snapshot when the files carried one.
 * Inputs: the storage, the runtime config, the files, now.
 * Output: the audit result plus what the load wrote.
 * Failure: BadRequest when no card assembled (no `projets` file);
 * storage errors propagate (→ 500), nothing partially written for cards.
 */
export async function loadImport(
  storage: BoardStorage, config: BoardConfig, files: InputFile[], now: Date,
): Promise<ImportLoadResult> {
  const audit = runImportAudit(files, config, now);
  if (audit.cards === null) {
    throw new BadRequest("Chargement refusé : aucune carte assemblée (le fichier « projets » manque ?).");
  }
  const [events, baseCards] = await Promise.all([storage.listEvents(), storage.listBaseCards()]);
  const plan = planLoad(audit.cards.cards, config, baseCards, events, now);
  await storage.importCards(plan.cards, plan.events);
  if (audit.capacity !== null) await storage.importCapacity(audit.capacity.snapshot);
  console.log(
    `${now.toISOString()} import (outil) : ${plan.created} créée(s), ${plan.updated} mise(s) à jour, ` +
      `${plan.moved} déplacée(s), ${plan.unlisted} absente(s), ${plan.relisted} de retour`,
  );
  return {
    report: renderReport(audit.report, now),
    summary: summarize(audit),
    loadable: true,
    load: {
      created: plan.created, updated: plan.updated, moved: plan.moved,
      unlisted: plan.unlisted, relisted: plan.relisted,
      divergences: plan.divergences.length, chargesWithoutProfile: plan.chargesWithoutProfile,
      capacity: audit.capacity === null ? null
        : { persons: audit.capacity.snapshot.persons.length, assignments: audit.capacity.snapshot.assignments.length },
    },
  };
}
