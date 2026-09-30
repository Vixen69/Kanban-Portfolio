// ADR 056: a rename in ⚙ › Catégories never changes the perimeter nor the
// domains — the importer matches on the versioned model's vocabulary, the
// renamed name answering only when nothing else did (and said).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { runImportAudit } from "./orchestrate.ts";
import type { AuditResult, InputFile } from "./orchestrate.ts";
import { importConfig, matchLabels } from "./vocabulary.ts";
import { createPortfolioResolver } from "./portfolio.ts";
import { createTypeLookup } from "./domains.ts";

const CONFIG = JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")) as BoardConfig;
const NOW = new Date("2026-09-30T12:00:00.000Z");
const COUTS = readFileSync(new URL("../../fixtures/import/Couts.csv", import.meta.url), "utf8");

// The fixture plus a project under a bare « ERP » portfolio (the domain
// matches only through its name) and a « Projet IA » (the type matches
// only through its name).
function files(): InputFile[] {
  const lines = COUTS.split(/\r?\n/).filter((l) => l !== "");
  const model = (lines[1] ?? "").split(";");
  const extra = (id: string, name: string, portfolio: string, type: string): string =>
    model.map((c, i) => (i === 8 ? id : i === 9 ? name : i === 10 ? portfolio : i === 13 ? type : c)).join(";");
  const text = [...lines, extra("PE20015", "Paie", "DSI NEXTER.ERP", "Etude (Projet)"), extra("PE20016", "Assistant", "DSI NEXTER.INFRASTRUCTURE OPE", "Projet IA (Projet)")].join("\n");
  return ["PARAM.csv", "Projets.csv"].map((name) => ({ name, bytes: readFileSync(new URL(`../../fixtures/import/${name}`, import.meta.url)) }))
    .concat([{ name: "Couts.csv", bytes: Buffer.from(text, "utf8") }]);
}

// What ⚙ › Catégories allows: names and shorts, nothing else.
function renamed(): BoardConfig {
  const rename = <T extends { id: string; name: string; short: string }>(list: T[], id: string, name: string, short: string): T[] =>
    list.map((e) => (e.id === id ? { ...e, name, short } : e));
  let types = rename(CONFIG.types, "mise_en_oeuvre", "Mise en œuvre", "MOE");
  types = rename(types, "ia", "Intelligence artificielle", "IAR");
  let domains = rename(CONFIG.domains, "erp", "Progiciels", "PGI");
  domains = rename(domains, "corporate", "Corporate & support", "CSU");
  return { ...CONFIG, types, domains };
}

function perimeter(audit: AuditResult): string[] {
  return (audit.couts?.entries ?? []).map((e) => `${e.id}|${e.typeId}|${e.domainId}|${e.subDomainId}`);
}

test("identical files give the same perimeter and domains after a rename in ⚙, through importConfig", () => {
  const before = runImportAudit(files(), importConfig(CONFIG, CONFIG), NOW);
  const after = runImportAudit(files(), importConfig(renamed(), CONFIG), NOW);
  assert.ok(perimeter(before).includes("PE20015|etude|erp|null"));
  assert.ok(perimeter(before).includes("PE20016|ia|infra|null"));
  assert.deepEqual(perimeter(after), perimeter(before));
  const raw = runImportAudit(files(), renamed(), NOW);
  assert.ok(!perimeter(raw).some((p) => p.startsWith("PE10001|")), "the defect ADR 056 closes: the runtime names alone lose PE10001");
});

test("importConfig keeps the runtime ids, display names and exercise; it carries the versioned labels", () => {
  const config = importConfig(renamed(), CONFIG);
  const erp = config.domains.find((d) => d.id === "erp");
  assert.equal(erp?.name, "Progiciels", "the report speaks the board's names");
  assert.deepEqual(erp === undefined ? null : matchLabels(erp), { versioned: ["ERP", "ERP"], renamed: ["Progiciels", "PGI"] });
  assert.deepEqual(config.exercise, CONFIG.exercise);
  assert.deepEqual(config.domains.map((d) => d.id), CONFIG.domains.map((d) => d.id));
  assert.deepEqual(config.domains.find((d) => d.id === "vendus")?.nameMarkers, ["BUSINESS"]);
});

test("a renamed name answers last, and says so", () => {
  const config = importConfig(renamed(), CONFIG);
  const hit = createPortfolioResolver(config)("DSI NEXTER.PROGICIELS");
  assert.deepEqual([hit?.domainId, hit?.renamed], ["erp", true]);
  assert.equal(createPortfolioResolver(config)("DSI NEXTER.ERP")?.renamed, undefined);
  const types = createTypeLookup(config);
  assert.deepEqual(types("Mise en œuvre (Projet)"), { id: "mise_en_oeuvre", repaired: false, renamed: true });
  assert.deepEqual(types("Projet de mise en oeuvre (Projet)"), { id: "mise_en_oeuvre", repaired: false });
  assert.equal(createTypeLookup(renamed())("Projet de mise en oeuvre (Projet)"), null, "a plain runtime config knows only the new name");
});
