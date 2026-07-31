// Semantic checks of the single-source reader: every row is a card (the
// file is the perimeter), isProjetSIS is informational only, domain via
// « Domaine (Ptf) » with RDOM fallback, owner via Responsables 1→3 minus
// the RDOM surnames.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { CONSOLIDE_CONTRACT, identifyHeader } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseConsolide } from "./consolide.ts";
import type { ConsolideTable } from "./consolide.ts";
import type { RdomTable } from "./rdom.ts";
import type { ImportReport } from "./report.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const HEADER =
  "Nom;Domaine (Ptf);isProjetSIS;Id;Type;Complexité du projet;État du processus;Début;" +
  "Responsable 1;Responsable 2;Responsable 3;Responsable portefeuilles";

const RDOM: RdomTable = {
  entries: [
    { domainId: "infra", name: "CARPENTIER", normalizedName: "carpentier", ref: { file: "RDOM.csv", line: 2 } },
    { domainId: "cyber", name: "BLANCHARD", normalizedName: "blanchard", ref: { file: "RDOM.csv", line: 3 } },
  ],
  namesByDomain: new Map([["infra", ["CARPENTIER"]], ["cyber", ["BLANCHARD"]]]),
  domainsByName: new Map([["carpentier", ["infra"]], ["blanchard", ["cyber"]]]),
};

function run(dataLines: string[]): { table: ConsolideTable; report: ImportReport } {
  const parsed = parseCsv([HEADER, ...dataLines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== CONSOLIDE_CONTRACT.id) {
    throw new Error("test header must match consolide");
  }
  const report = createReport();
  const table = parseConsolide(parsed.rows.slice(1), identified, CONFIG, RDOM, report, "Consolide.csv");
  return { table, report };
}

test("a row maps name, domain, code, type, date and owner", () => {
  const { table, report } = run(["Alpha;Infra;VRAI;PE12345;Achat;Complexe;En cours;12/01/2025;Marc SOLE;;;"]);
  const entry = table.entries[0];
  assert.equal(entry?.domainId, "infra");
  assert.equal(entry?.codename, "PE12345");
  assert.equal(entry?.typeId, "achat");
  assert.equal(entry?.createdAt, "2025-01-12");
  assert.equal(entry?.owner, "Marc SOLE");
  assert.deepEqual(report.discarded, []);
});

test("isProjetSIS is informational: FAUX rows stay, counts are kept", () => {
  const { table } = run([
    "Alpha;Infra;VRAI;;;;;;;;;",
    "Beta;Infra;FAUX;;;;;;;;;",
    "Gamma;Infra;;;;;;;;;;",
  ]);
  assert.equal(table.entries.length, 3);
  assert.deepEqual(table.sisCounts, { yes: 1, no: 1, blank: 1 });
});

test("an unreadable flag keeps the row and signals it", () => {
  const { table, report } = run(["Alpha;Infra;peut-être;;;;;;;;;"]);
  assert.equal(table.entries.length, 1);
  assert.ok(report.warnings.some((w) => /« isProjetSIS » illisible/.test(w.message)));
});

test("domains resolve by name/short/id; unknowns become doubts", () => {
  const { table, report } = run([
    "A;Ingénierie;VRAI;;;;;;;;;",
    "B;A&D;VRAI;;;;;;;;;",
    "C;Portefeuille X;VRAI;;;;;;;;;",
  ]);
  assert.deepEqual(table.entries.map((e) => e.domainId), ["ingenierie", "archi_dev", null]);
  assert.match(report.doubtful[0]?.question ?? "", /« Domaine \(Ptf\) » inconnu du board : « Portefeuille X »/);
});

test("an empty domain falls back to the RDOM of the portfolio responsible", () => {
  const { table, report } = run(["Sans domaine;;VRAI;;;;;;;;;BLANCHARD"]);
  assert.equal(table.entries[0]?.domainId, "cyber");
  assert.ok(report.warnings.some((w) => /domaine résolu par RDOM/.test(w.message)));
});

test("the first non-RDOM responsable is the owner, exclusions counted", () => {
  const { table, report } = run([
    "A;Infra;VRAI;;;;;;CARPENTIER;Alice MERLE;;",
    "B;Infra;VRAI;;;;;;CARPENTIER;;;",
  ]);
  assert.equal(table.entries[0]?.owner, "Alice MERLE");
  assert.equal(table.entries[1]?.owner, null);
  assert.ok(report.warnings.some((w) => /« Responsable 1 » est un RDOM — exclu/.test(w.message)));
  assert.ok(report.warnings.some((w) => /aucun chef de projet \(responsables tous RDOM\)/.test(w.message)));
});

test("surveys: complexity, jalon en cours and process states", () => {
  const { report } = run([
    "A;Infra;VRAI;;;Complexe;En cours;;;;;",
    "B;Infra;VRAI;;;Complexe;Nouveau;;;;;",
  ]);
  assert.ok(report.warnings.some((w) => /« Complexité du projet » — valeurs vues : « Complexe » \(2\)/.test(w.message)));
  assert.ok(report.warnings.some((w) => /« État du processus » — valeurs vues : « En cours » \(1\) ; « Nouveau » \(1\)/.test(w.message)));
});

test("duplicates, empty names and total rows are gated like everywhere", () => {
  const { table, report } = run([
    "Alpha;Infra;VRAI;;;;;;;;;",
    "ALPHA;Infra;VRAI;;;;;;;;;",
    ";Infra;VRAI;;;;;;;;;",
    "Total général;Infra;VRAI;;;;;;;;;",
  ]);
  assert.equal(table.entries.length, 1);
  assert.equal(report.doubtful.length, 1);
  assert.deepEqual(report.discarded.map((d) => d.reason), [
    "nom vide",
    "ligne de total/sous-total — exclue (risque de double compte)",
  ]);
});

test("TMA CORRECTIVES, IT4IT and PROJETS VENDUS portfolios are excluded", () => {
  const { table, report } = run([
    "Vieille TMA;TMA CORRECTIVES;VRAI;;;;;;;;;",
    "Outillage;IT4IT;FAUX;;;;;;;;;",
    "Revendu;PROJETS VENDUS;VRAI;;;;;;;;;",
    "Gardé;Infra;VRAI;;;;;;;;;",
  ]);
  assert.equal(table.entries.length, 1);
  assert.equal(table.excluded, 3);
  assert.equal(report.discarded.filter((d) => /« Domaine \(Ptf\) » exclu/.test(d.reason)).length, 3);
});

test("a non-PE Id is not taken as a codename", () => {
  const { table } = run(["Alpha;Infra;VRAI;12345;;;;;;;;", "Beta;Infra;VRAI;PE 54321;;;;;;;;"]);
  assert.equal(table.entries[0]?.codename, null);
  assert.equal(table.entries[1]?.codename, "PE54321");
});
