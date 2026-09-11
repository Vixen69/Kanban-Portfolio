// The COUT PREV reader (ADR 030): unique projects from twelve-thousand-row
// exports, the perimeter rule (exercise year, no purchase nor TMA, neither
// cancelled nor postponed), the domain from the portfolio, unknown types
// kept without type, and the cross-check against the Projets onglet.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { identifyHeader } from "./contract.ts";
import type { HeaderMatch } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseCouts, checkPerimeters } from "./couts.ts";
import { parseProjets } from "./projets.ts";
import type { ImportReport } from "./report.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

function fixture(name: string, contractId: string): { match: HeaderMatch; rows: ReturnType<typeof parseCsv>["rows"] } {
  const parsed = parseCsv(readFileSync(new URL(`../../fixtures/import/${name}`, import.meta.url), "utf8"));
  const header = parsed.rows.findIndex((row) => identifyHeader(row.cells).status === "match");
  const identified = identifyHeader(parsed.rows[header]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== contractId) {
    throw new Error(`${name}: expected contract ${contractId}, got ${identified.status}`);
  }
  return { match: identified, rows: parsed.rows.slice(header + 1) };
}

function couts(): { table: ReturnType<typeof parseCouts>; report: ImportReport } {
  const { match, rows } = fixture("Couts.csv", "couts");
  const report = createReport();
  return { table: parseCouts(rows, match, CONFIG, report, "Couts.csv"), report };
}

test("the perimeter: unique projects on the exercise year, neither purchase, TMA, cancelled nor postponed", () => {
  const { table, report } = couts();
  assert.deepEqual(table.entries.map((e) => e.id), ["PE10001", "PE10002", "PE10003", "MEWTBN7Q", "PE10009", "PE10013"]);
  assert.deepEqual(table.stats, {
    rows: 12, otherYearRows: 1, projectsSeen: 11, retained: 6,
    excluded: { achat: 1, tma: 1, annule: 1, reporte: 1, noYear: 1 }, inactive: 1, domainResolved: 5, domainUnknown: 1,
  });
  assert.equal(table.shape, "portefeuille");
  assert.equal(table.fileName, "Couts.csv");
  assert.ok(report.warnings.some((w) => /12 ligne\(s\) lue\(s\) · 11 projet\(s\) distinct\(s\) · 1 ligne\(s\) hors 2026 · périmètre 6/.test(w.message)));
});

test("each retained project: title without its code, type through the aliases, domain and sub-domain from the portfolio", () => {
  const { table } = couts();
  const byId = new Map(table.entries.map((e) => [e.id, e]));
  assert.deepEqual(
    ["PE10001", "PE10002", "PE10003", "MEWTBN7Q", "PE10009", "PE10013"].map((id) => {
      const e = byId.get(id);
      return [e?.title, e?.typeId, e?.domainId, e?.subDomainId];
    }),
    [
      ["Modernisation atelier", "mise_en_oeuvre", "infra", null],
      ["Refonte portail interne", "etude", "ad", "developpements_rapides"],
      ["Montée de version calcul", "etude", "ing", null],
      ["Étude connectivité site B", "obsolescence", "corporate", "achats"],
      ["Pilotage PDSI", null, "erp", null],
      ["Projet vendu X", null, null, null],
    ],
  );
  assert.deepEqual([...table.typeCounts.entries()], [["mise_en_oeuvre", 1], ["etude", 2], ["obsolescence", 1], ["?", 2]]);
  assert.equal(byId.get("PE10001")?.owner, null, "Projet.Responsable 1 is never the chef de projet");
  assert.equal(byId.get("PE10001")?.budgetRdli, null, "amounts of this file are not read");
});

test("unknown types and portfolios are questioned, never dropped", () => {
  const { report } = couts();
  const questions = report.doubtful.map((d) => d.question);
  assert.ok(questions.some((q) => /type hors des types de la config : « Pilotage » \(1 projet\(s\)\) — gardé/.test(q)));
  assert.ok(questions.some((q) => /type hors des types de la config : « RUN » \(1 projet\(s\)\)/.test(q)));
  assert.ok(questions.some((q) => /portefeuille sans domaine : « PROJETS VENDUS » \(1 projet\(s\)\)/.test(q)));
});

test("checkPerimeters names the codes present on one side only", () => {
  const { table } = couts();
  const { match, rows } = fixture("Projets.csv", "projets");
  const projets = parseProjets(rows, match, CONFIG, null, createReport(), "Projets.csv");
  const check = checkPerimeters(table, projets);
  assert.deepEqual(check, {
    coutsFile: "Couts.csv", projetsFile: "Projets.csv", couts: 6, projets: 6, common: 4,
    onlyCouts: ["PE10009", "PE10013"], onlyProjets: ["PE10007", "PE10008"],
  });
});
