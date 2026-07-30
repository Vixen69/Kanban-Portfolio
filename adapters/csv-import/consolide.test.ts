// Semantic checks of the perimeter master reader: isProjetSIS gate,
// domain/type resolution, Id -> codename, surveys and duplicates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { CONSOLIDE_CONTRACT, identifyHeader } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseConsolide } from "./consolide.ts";
import type { ConsolideTable } from "./consolide.ts";
import type { ImportReport } from "./report.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const HEADER = "Nom;Domaine (Ptf);isProjetSIS;Id;Type;Complexité du projet;État du processus;Début";

function run(dataLines: string[]): { table: ConsolideTable; report: ImportReport } {
  const parsed = parseCsv([HEADER, ...dataLines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== CONSOLIDE_CONTRACT.id) {
    throw new Error("test header must match consolide");
  }
  const report = createReport();
  const table = parseConsolide(parsed.rows.slice(1), identified, CONFIG, report, "Consolide.csv");
  return { table, report };
}

test("a retained row maps name, domain, code, type and date", () => {
  const { table, report } = run(["Alpha;Infra;VRAI;PE12345;Achat;Complexe;En cours;12/01/2025"]);
  const entry = table.entries[0];
  assert.equal(entry?.domainId, "infra");
  assert.equal(entry?.codename, "PE12345");
  assert.equal(entry?.typeId, "achat");
  assert.equal(entry?.createdAt, "2025-01-12");
  assert.equal(table.excludedCount, 0);
  assert.deepEqual(report.discarded, []);
});

test("isProjetSIS faux excludes the row with the perimeter reason", () => {
  const { table, report } = run(["Alpha;Infra;VRAI;;;;;", "Vieux;ERP;FAUX;;;;;"]);
  assert.equal(table.entries.length, 1);
  assert.equal(table.excludedCount, 1);
  assert.match(report.discarded[0]?.reason ?? "", /hors périmètre \(isProjetSIS faux\)/);
});

test("an unreadable flag keeps the row and signals it", () => {
  const { table, report } = run(["Alpha;Infra;peut-être;;;;;"]);
  assert.equal(table.entries.length, 1);
  assert.ok(report.warnings.some((w) => /« isProjetSIS » illisible/.test(w.message)));
});

test("domains resolve by name, short or id; unknown ones become doubts", () => {
  const { table, report } = run([
    "A;Ingénierie;VRAI;;;;;",
    "B;A&D;VRAI;;;;;",
    "C;cyber;VRAI;;;;;",
    "D;Portefeuille X;VRAI;;;;;",
  ]);
  assert.deepEqual(table.entries.map((e) => e.domainId), ["ingenierie", "archi_dev", "cyber", null]);
  assert.equal(report.doubtful.length, 1);
  assert.match(report.doubtful[0]?.question ?? "", /« Domaine \(Ptf\) » inconnu du board : « Portefeuille X »/);
});

test("complexity values are surveyed (canal/nature material)", () => {
  const { report } = run([
    "A;Infra;VRAI;;;Complexe;;",
    "B;Infra;VRAI;;;Complexe;;",
    "C;Infra;VRAI;;;Simple;;",
  ]);
  const survey = report.warnings.find((w) => /Complexité du projet/.test(w.message));
  assert.match(survey?.message ?? "", /« Complexe » \(2\) ; « Simple » \(1\)/);
});

test("duplicates, empty names and total rows are gated like everywhere", () => {
  const { table, report } = run([
    "Alpha;Infra;VRAI;;;;;",
    "ALPHA;Infra;VRAI;;;;;",
    ";Infra;VRAI;;;;;",
    "Total général;Infra;VRAI;;;;;",
  ]);
  assert.equal(table.entries.length, 1);
  assert.equal(report.doubtful.length, 1);
  assert.deepEqual(report.discarded.map((d) => d.reason), [
    "nom vide",
    "ligne de total/sous-total — exclue (risque de double compte)",
  ]);
});

test("a non-PE Id is not taken as a codename", () => {
  const { table } = run(["Alpha;Infra;VRAI;12345;;;;", "Beta;Infra;VRAI;PE 54321;;;;"]);
  assert.equal(table.entries[0]?.codename, null);
  assert.equal(table.entries[1]?.codename, "PE54321");
});
