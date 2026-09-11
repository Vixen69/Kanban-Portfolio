// The COUT PREV reader (ADR 030): unique projects from twelve-thousand-row
// exports, the perimeter rule (exercise year, retained states, config
// types, no arbitrage line, some ME figure), the domain from the
// portfolio, the non-PE watch, and the cross-check against the Projets
// onglet.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { identifyHeader } from "./contract.ts";
import type { HeaderMatch } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseCouts, checkPerimeters, excludedSummary } from "./couts.ts";
import { parseProjets } from "./projets.ts";
import type { ImportReport } from "./report.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const RETAINED = ["PE10001", "PE10002", "PE10003", "MEWTBN7Q", "PE10017"];

function fixture(name: string, contractId: string): { match: HeaderMatch; rows: ReturnType<typeof parseCsv>["rows"] } {
  const parsed = parseCsv(readFileSync(new URL(`../../fixtures/import/${name}`, import.meta.url), "utf8"));
  const header = parsed.rows.findIndex((row) => identifyHeader(row.cells).status === "match");
  const identified = identifyHeader(parsed.rows[header]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== contractId) {
    throw new Error(`${name}: expected contract ${contractId}, got ${identified.status}`);
  }
  return { match: identified, rows: parsed.rows.slice(header + 1) };
}

function couts(config: BoardConfig = CONFIG): { table: ReturnType<typeof parseCouts>; report: ImportReport } {
  const { match, rows } = fixture("Couts.csv", "couts");
  const report = createReport();
  return { table: parseCouts(rows, match, config, report, "Couts.csv"), report };
}

test("the perimeter: unique projects on the exercise year, retained state, config type, no arbitrage line, some ME", () => {
  const { table, report } = couts();
  assert.deepEqual(table.entries.map((e) => e.id), RETAINED);
  assert.deepEqual(table.stats, {
    rows: 18, otherYearRows: 1, projectsSeen: 16, retained: 5,
    excluded: {
      noYear: 1,
      etat: new Map([["Annulé", 1], ["Budget présenté", 1], ["Reporté", 1], ["Fusionné", 1], ["Nouveau", 1]]),
      type: new Map([["Achat", 1], ["Evolution - TMA", 1], ["RUN", 1]]),
      arbitrage: 1, noMe: 1,
    },
    inactive: 1, nonPe: 1, domainResolved: 4, domainUnknown: 1,
  });
  assert.equal(excludedSummary(table.stats.excluded, 2026),
    "hors 2026 1 · état hors liste 5 (Annulé 1, Budget présenté 1, Reporté 1, Fusionné 1, Nouveau 1)" +
    " · type hors config 3 (Achat 1, Evolution - TMA 1, RUN 1) · arbitrage 1 · sans ME 1");
  assert.equal(table.shape, "portefeuille");
  assert.equal(table.fileName, "Couts.csv");
  assert.ok(report.warnings.some((w) => /18 ligne\(s\) lue\(s\) · 16 projet\(s\) distinct\(s\) · 1 ligne\(s\) hors 2026 · périmètre 5 : écartés hors 2026 1/.test(w.message)));
});

test("each retained project: title without its code, type through the aliases, domain and sub-domain from the portfolio", () => {
  const { table } = couts();
  const byId = new Map(table.entries.map((e) => [e.id, e]));
  assert.deepEqual(
    RETAINED.map((id) => {
      const e = byId.get(id);
      return [e?.title, e?.typeId, e?.domainId, e?.subDomainId];
    }),
    [
      ["Modernisation atelier", "mise_en_oeuvre", "infra", null],
      ["Refonte portail interne", "etude", "ad", "developpements_rapides"],
      ["Montée de version calcul", "atlas", "ing", null],
      ["Étude connectivité site B", "obsolescence", "corporate", "achats"],
      ["Outil vendu Y", "etude", null, null],
    ],
  );
  assert.deepEqual([...table.typeCounts.entries()], [["mise_en_oeuvre", 1], ["etude", 2], ["atlas", 1], ["obsolescence", 1]]);
  assert.equal(byId.get("PE10001")?.owner, null, "Projet.Responsable 1 is never the chef de projet");
  assert.equal(byId.get("PE10001")?.budgetRdli, null, "amounts of this file are not read into the card");
});

test("the ME test: a project whose four ME cells are empty or zero on every row is cancelled in fact", () => {
  const { table } = couts();
  assert.equal(table.byId.has("PE10015"), false, "0 / 0 / 0,00 € then all empty");
  assert.equal(table.byId.has("PE10001"), true, "a later row with a figure keeps the project");
});

test("unknown portfolios and non-PE codes are questioned, never dropped; no state list = every state kept, said", () => {
  const { report } = couts();
  const questions = report.doubtful.map((d) => d.question);
  assert.ok(questions.some((q) => /portefeuille sans domaine : « PROJETS VENDUS » \(1 projet\(s\)\)/.test(q)));
  assert.ok(questions.some((q) => /codes retenus hors PE : 1 \(MEWTBN7Q\)/.test(q)));
  assert.ok(!questions.some((q) => /type hors/.test(q)), "types outside the config are excluded, not questioned");
  const { table, report: noList } = couts({ ...CONFIG, exercise: { year: 2026 } });
  assert.deepEqual([...table.stats.excluded.etat.entries()], []);
  assert.deepEqual(table.entries.map((e) => e.id),
    ["PE10001", "PE10002", "PE10003", "MEWTBN7Q", "PE10007", "PE10012", "PE10016", "PE10017", "PE10018"]);
  assert.ok(noList.warnings.some((w) => /aucune liste d'états dans la config/.test(w.message)));
});

test("checkPerimeters names the codes present on one side only", () => {
  const { table } = couts();
  const { match, rows } = fixture("Projets.csv", "projets");
  const projets = parseProjets(rows, match, CONFIG, null, createReport(), "Projets.csv");
  const check = checkPerimeters(table, projets);
  assert.deepEqual(check, {
    coutsFile: "Couts.csv", projetsFile: "Projets.csv", couts: 5, projets: 6, common: 4,
    onlyCouts: ["PE10017"], onlyProjets: ["PE10007", "PE10008"],
  });
});
