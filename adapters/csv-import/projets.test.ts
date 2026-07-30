// Semantic checks of the `projet` reader: owner derivation with RDOM
// exclusion, domain via portfolio-responsible surname, word-boundary
// matching, Projet.Actif counts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./csv.ts";
import { identifyHeader, PROJETS_CONTRACT } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseProjets } from "./projets.ts";
import type { ProjetsTable } from "./projets.ts";
import type { RdomTable } from "./rdom.ts";
import type { ImportReport } from "./report.ts";

const HEADER =
  "Nom;Responsable 1;Responsable 2;Responsable 3;Responsable portefeuilles;Projet.Actif;État du processus;Id";

const RDOM: RdomTable = {
  entries: [
    { domainId: "infra", name: "CARPENTIER", normalizedName: "carpentier", ref: { file: "RDOM.csv", line: 2 } },
    { domainId: "infra", name: "MASSON", normalizedName: "masson", ref: { file: "RDOM.csv", line: 3 } },
    { domainId: "ingenierie", name: "DURAND", normalizedName: "durand", ref: { file: "RDOM.csv", line: 4 } },
    { domainId: "cyber", name: "MARTIN", normalizedName: "martin", ref: { file: "RDOM.csv", line: 5 } },
  ],
  namesByDomain: new Map([["infra", ["CARPENTIER", "MASSON"]], ["ingenierie", ["DURAND"]], ["cyber", ["MARTIN"]]]),
  domainsByName: new Map([["carpentier", ["infra"]], ["masson", ["infra"]], ["durand", ["ingenierie"]], ["martin", ["cyber"]]]),
};

function run(dataLines: string[], rdom: RdomTable | null = RDOM): { table: ProjetsTable; report: ImportReport } {
  const parsed = parseCsv([HEADER, ...dataLines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== PROJETS_CONTRACT.id) {
    throw new Error("test header must match projets");
  }
  const report = createReport();
  const table = parseProjets(parsed.rows.slice(1), identified, rdom, report, "Projets.csv");
  return { table, report };
}

test("the first non-RDOM responsable becomes the owner, exclusions counted", () => {
  const { table, report } = run([
    "Alpha;CARPENTIER;Alice MERLE;;CARPENTIER;VRAI;;",
    "Beta;Bob NOEL;;;DURAND;VRAI;;",
    "Gamma;;;Chloé PETIT;MASSON;VRAI;;",
  ]);
  assert.deepEqual(table.entries.map((e) => e.owner), ["Alice MERLE", "Bob NOEL", "Chloé PETIT"]);
  const excluded = report.warnings.find((w) => /« Responsable 1 » est un RDOM — exclu/.test(w.message));
  assert.match(excluded?.message ?? "", /1 cellule\(s\), ligne\(s\) 2/);
});

test("no usable responsable -> null owner, counted", () => {
  const { table, report } = run(["Seul;DURAND;;;DURAND;VRAI;;"]);
  assert.equal(table.entries[0]?.owner, null);
  assert.ok(report.warnings.some((w) => /aucun chef de projet/.test(w.message)));
});

test("the portfolio responsible resolves the domain by whole-word surname", () => {
  const { table, report } = run([
    "A;;;;Jean CARPENTIER;VRAI;;",
    "B;;;;MARTINEZ;VRAI;;",
    "C;;;;CARPENTIER DURAND;VRAI;;",
    "D;;;;CARPENTIER MASSON;VRAI;;",
  ]);
  assert.deepEqual(table.entries.map((e) => e.domainId), ["infra", null, null, "infra"]);
  assert.ok(report.warnings.some((w) => /sans RDOM reconnu/.test(w.message)));
  assert.ok(report.warnings.some((w) => /plusieurs RDOM de domaines différents/.test(w.message)));
});

test("without an RDOM table, domains stay null and the report says why", () => {
  const { table, report } = run(["Alpha;;;;CARPENTIER;VRAI;;"], null);
  assert.equal(table.entries[0]?.domainId, null);
  assert.ok(report.warnings.some((w) => /table RDOM absente/.test(w.message)));
});

test("Projet.Actif counts land in the stats", () => {
  const { table } = run([
    "A;;;;CARPENTIER;VRAI;;",
    "B;;;;CARPENTIER;FAUX;;",
    "C;;;;CARPENTIER;;;",
  ]);
  assert.deepEqual(table.activeCounts, { yes: 1, no: 1, unknown: 1 });
});

test("a coded name exposes its title as the fallback join key", () => {
  const { table } = run(["PE10007 Sécurisation accès;Emma FAVRE;;;MASSON;VRAI;;PE10007"]);
  assert.equal(table.entries[0]?.normalizedTitle, "securisation acces");
});
