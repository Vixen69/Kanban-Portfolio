// Reader for the plan de charge (Ressources_PdC): one row = one resource ×
// project assignment, years as two-level headers (« 2026 » over a
// Prév./Réel pair — reconstructed here). Only 2026 is read (annual window,
// 200 j.h = 1 ETP). Rows are SUMMED per project × profile, never assumed
// unique; the per-person 2026 totals feed the nominative consolidation in
// the report (names never leave the machine). docs/IMPORT-MAPPING.md.

import type { BoardConfig } from "../../core/types.ts";
import { createTolerantLookup, normalizeLabel } from "./normalize.ts";
import type { TolerantHit } from "./normalize.ts";
import { splitSubjectName } from "./subject-name.ts";
import { amountCell } from "./cells.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** Aggregated 2026 charge of one project (by profile; "" = unassigned). */
export interface PdcProject {
  name: string;
  normalizedName: string;
  normalizedTitle: string;
  codename: string | null;
  charges: Map<string, { jh: number; done: number }>;
  ref: RowRef;
}

/** The parsed plan de charge. */
export interface PdcTable {
  projects: Map<string, PdcProject>;
  /** Per-person 2026 totals, matricule-keyed rows only, jh descending. */
  persons: Array<{ name: string; jh: number; done: number }>;
  totals: { jh: number; done: number };
}

interface PdcContext {
  report: ImportReport;
  fileName: string;
  prevIdx: number;
  reelIdx: number;
  nameIdx: number;
  profileLookup: (cell: string) => TolerantHit | null;
  projects: Map<string, PdcProject>;
  persons: Map<string, { name: string; jh: number; done: number }>;
  totals: { jh: number; done: number };
  unknownMetiers: Map<string, Tally>;
  prefixes: Map<string, number>;
  tallies: Map<string, Tally>;
}

/**
 * Parses the plan de charge data rows (header excluded).
 * Inputs: the data rows (the Prév./Réel sub-header row is detected and
 * consumed), the header match, the board config (the 19 profils DSI), the
 * report and the file name.
 * Outputs: the PdcTable; side effects: écarté (empty names), douteux
 * (unknown métiers), aggregated signalements (réel > prévisionnel,
 * unreadable cells, prefixes seen, projects without any 2026 charge).
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parsePdc(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig,
  report: ImportReport, fileName: string,
): PdcTable {
  const prevIdx = match.columnIndex.get("2026") ?? -1;
  const ctx: PdcContext = {
    report, fileName,
    prevIdx, reelIdx: prevIdx + 1,
    nameIdx: match.columnIndex.get("Nom Projet") ?? 0,
    profileLookup: createTolerantLookup(
      config.profiles.flatMap((p): Array<[string, string]> => [[p.id, p.id], [p.name, p.id]]),
    ),
    projects: new Map(), persons: new Map(),
    totals: { jh: 0, done: 0 },
    unknownMetiers: new Map(), prefixes: new Map(), tallies: new Map(),
  };
  const dataRows = consumeSubHeader(ctx, rows);
  for (const row of dataRows) readPdcRow(ctx, match, row);
  finalize(ctx);
  return {
    projects: ctx.projects,
    persons: [...ctx.persons.values()].sort((a, b) => b.jh - a.jh || a.name.localeCompare(b.name, "fr")),
    totals: ctx.totals,
  };
}

// The first non-empty row should be the Prév./Réel sub-header; when it is
// not, pairing stays positional and the deviation is said.
function consumeSubHeader(ctx: PdcContext, rows: CsvRow[]): CsvRow[] {
  const first = rows.find((row) => row.cells.some((c) => c.trim() !== ""));
  if (first === undefined) return rows;
  const prev = normalizeLabel(first.cells[ctx.prevIdx] ?? "");
  const reel = normalizeLabel(first.cells[ctx.reelIdx] ?? "");
  if (prev.startsWith("prev") && reel.startsWith("reel")) {
    return rows.filter((row) => row !== first);
  }
  warn(ctx.report,
    "sous-en-têtes Prév./Réel non trouvés sous « 2026 » — appariement par position (Prév. = colonne de l'année, Réel = suivante)",
    ctx.fileName);
  return rows;
}

// One assignment row: project × profile × person, 2026 pair summed in.
function readPdcRow(ctx: PdcContext, match: HeaderMatch, row: CsvRow): void {
  if (row.cells.every((c) => c.trim() === "")) return;
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  const nameCell = (row.cells[ctx.nameIdx] ?? "").trim();
  if (nameCell === "") {
    discard(ctx.report, ctx.fileName, "nom de projet vide", { ref });
    return;
  }
  if (/^(sous[\s-])?total\b/.test(normalizeLabel(nameCell))) {
    discard(ctx.report, ctx.fileName,
      "ligne de total/sous-total — exclue (risque de double compte)", { ref, value: nameCell });
    return;
  }
  const jh = amountCell(row.cells[ctx.prevIdx] ?? "", "2026 Prév.", row.line, ctx.tallies) ?? 0;
  const done = amountCell(row.cells[ctx.reelIdx] ?? "", "2026 Réel", row.line, ctx.tallies) ?? 0;
  if (done > jh) tallyInto(ctx.tallies, "réel 2026 > prévisionnel 2026 (cas réel, conservé)", row.line);
  const profileId = resolveMetier(ctx, match, row);
  addToProject(ctx, match, row, ref, nameCell, profileId, jh, done);
  addToPerson(ctx, match, row, jh, done);
  ctx.totals.jh += jh;
  ctx.totals.done += done;
}

// Métier -> profile: direct tolerant match, else with the first
// dot-prefix stripped (« Externe. », company names) — prefixes surveyed.
function resolveMetier(ctx: PdcContext, match: HeaderMatch, row: CsvRow): string | null {
  const raw = (row.cells[match.columnIndex.get("Métier") ?? -1] ?? "").trim();
  if (raw === "") {
    tallyInto(ctx.tallies, "« Métier » vide — charge comptée « non attribué »", row.line);
    return null;
  }
  const direct = ctx.profileLookup(raw);
  if (direct !== null) return direct.id;
  const dot = raw.indexOf(".");
  if (dot > 0) {
    const stripped = raw.slice(dot + 1).trim();
    const hit = ctx.profileLookup(stripped);
    if (hit !== null) {
      const prefix = raw.slice(0, dot).trim();
      ctx.prefixes.set(prefix, (ctx.prefixes.get(prefix) ?? 0) + 1);
      return hit.id;
    }
  }
  tallyInto(ctx.unknownMetiers, raw, row.line);
  return null;
}

function addToProject(
  ctx: PdcContext, match: HeaderMatch, row: CsvRow, ref: RowRef,
  nameCell: string, profileId: string | null, jh: number, done: number,
): void {
  const normalizedName = normalizeLabel(nameCell);
  let project = ctx.projects.get(normalizedName);
  if (project === undefined) {
    const idCell = (row.cells[match.columnIndex.get("Id Projet") ?? -1] ?? "").trim();
    const code = idCell.match(/^PE[\s-]?(\d{4,6})$/i);
    project = {
      name: nameCell, normalizedName,
      normalizedTitle: normalizeLabel(splitSubjectName(nameCell).title),
      codename: code === null ? null : `PE${code[1]}`,
      charges: new Map(), ref,
    };
    ctx.projects.set(normalizedName, project);
  }
  const key = profileId ?? "";
  const bucket = project.charges.get(key) ?? { jh: 0, done: 0 };
  bucket.jh += jh;
  bucket.done += done;
  project.charges.set(key, bucket);
}

// Nominative consolidation: matricule-keyed rows only (generic lines have
// no matricule); every 2026 assignment counts, in or out of perimeter.
function addToPerson(ctx: PdcContext, match: HeaderMatch, row: CsvRow, jh: number, done: number): void {
  const matricule = (row.cells[match.columnIndex.get("Matricule") ?? -1] ?? "").trim();
  if (matricule === "") return;
  const name = (row.cells[match.columnIndex.get("Ressource") ?? -1] ?? "").trim() || matricule;
  const person = ctx.persons.get(matricule) ?? { name, jh: 0, done: 0 };
  person.jh += jh;
  person.done += done;
  ctx.persons.set(matricule, person);
}

// Aggregated signalements, unknown-métier questions, prefix survey and the
// zero-charge projects count.
function finalize(ctx: PdcContext): void {
  for (const [message, t] of ctx.tallies) {
    warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  }
  for (const [label, t] of ctx.unknownMetiers) {
    doubt(ctx.report, ctx.fileName,
      `métier inconnu « ${label} » (${t.count} ligne(s), ligne(s) ${t.lines.join(", ")}` +
        `${t.count > t.lines.length ? ", …" : ""}) — à rapprocher d'un profil DSI ? (charge comptée « non attribué »)`);
  }
  if (ctx.prefixes.size > 0) {
    const seen = [...ctx.prefixes.entries()].map(([p, n]) => `« ${p} » (${n})`).join(" ; ");
    warn(ctx.report, `préfixes métier décollés avant rapprochement : ${seen} (signification à confirmer — Q9)`, ctx.fileName);
  }
  const zero = [...ctx.projects.values()]
    .filter((p) => [...p.charges.values()].every((c) => c.jh === 0 && c.done === 0)).length;
  if (zero > 0) {
    warn(ctx.report, `${zero} projet(s) du plan de charge sans aucune charge 2026`, ctx.fileName);
  }
}
