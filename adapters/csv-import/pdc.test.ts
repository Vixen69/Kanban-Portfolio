// Semantic checks of the plan-de-charge reader: two-level header pairing,
// Métier -> profile with prefix stripping, row aggregation, nominative
// consolidation, réel > prévisionnel tolerance.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { identifyHeader, PDC_CONTRACT } from "./contract.ts";
import { createReport } from "./report.ts";
import { parsePdc } from "./pdc.ts";
import type { PdcTable } from "./pdc.ts";
import type { ImportReport } from "./report.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const HEADER =
  "Matricule;Ressource;Organisation;Métier;Id Projet;Nom Projet;Type projet;Portefeuille;" +
  "2023;;2024;;2025;;2026;;2027;;2028;;2029;;2030;;Total Prév.;Total Réel;" +
  "Etat du processus;Date de publication;Projet.Actif;Date export";
const SUB = ";;;;;;;;Prév.;Réel;Prév.;Réel;Prév.;Réel;Prév.;Réel;Prév.;Réel;Prév.;Réel;Prév.;Réel;Prév.;Réel;;;;;;";

function row(matricule: string, ressource: string, metier: string, id: string, nom: string, p26: string, r26: string): string {
  return `${matricule};${ressource};DSI;${metier};${id};${nom};T;P;;;;;;;${p26};${r26};;;;;;;;;;;;;;`;
}

function run(dataLines: string[]): { table: PdcTable; report: ImportReport } {
  const parsed = parseCsv([HEADER, SUB, ...dataLines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== PDC_CONTRACT.id) {
    throw new Error("test header must match ressources_pdc");
  }
  const report = createReport();
  const table = parsePdc(parsed.rows.slice(1), identified, CONFIG, report, "PdC.csv");
  return { table, report };
}

test("the 2026 pair is read, rows are summed per project and profile", () => {
  const { table } = run([
    row("M1", "Jean ROCA", "PMO", "PE11111", "Alpha", "40", "25"),
    row("M2", "Aya SEL", "PMO", "PE11111", "Alpha", "10", "5"),
    row("", "Générique", "Expert", "PE11111", "Alpha", "20", "0"),
  ]);
  const alpha = table.projects.get("alpha");
  assert.deepEqual(alpha?.charges.get("pmo"), { jh: 50, done: 30 });
  assert.deepEqual(alpha?.charges.get("expert"), { jh: 20, done: 0 });
  assert.equal(alpha?.codename, "PE11111");
  assert.deepEqual(table.totals, { jh: 70, done: 30 });
});

test("a dotted prefix is stripped to match the profile, and surveyed", () => {
  const { table, report } = run([
    row("M1", "Jean", "Externe.Concept.Dév.", "", "Alpha", "10", "0"),
    row("M2", "Lise", "Nexter.PMO", "", "Alpha", "5", "0"),
  ]);
  const alpha = table.projects.get("alpha");
  assert.ok(alpha?.charges.has("concept_dev"));
  assert.ok(alpha?.charges.has("pmo"));
  const survey = report.warnings.find((w) => /préfixes métier décollés/.test(w.message));
  assert.match(survey?.message ?? "", /« Externe » \(1\) ; « Nexter » \(1\)/);
});

test("unknown and empty métiers land in the unassigned bucket, reported", () => {
  const { table, report } = run([
    row("M1", "Jean", "Métier XYZ", "", "Alpha", "15", "0"),
    row("M2", "Lise", "", "", "Alpha", "5", "0"),
  ]);
  assert.deepEqual(table.projects.get("alpha")?.charges.get(""), { jh: 20, done: 0 });
  assert.match(report.doubtful[0]?.question ?? "", /métier inconnu « Métier XYZ »/);
  assert.ok(report.warnings.some((w) => /« Métier » vide/.test(w.message)));
});

test("réel > prévisionnel is kept and signaled; persons are consolidated", () => {
  const { table, report } = run([
    row("M1", "Jean ROCA", "PMO", "", "Alpha", "15", "18"),
    row("M1", "Jean ROCA", "PMO", "", "Beta", "30", "10"),
    row("", "Générique", "PMO", "", "Beta", "99", "0"),
  ]);
  assert.ok(report.warnings.some((w) => /réel 2026 > prévisionnel 2026/.test(w.message)));
  assert.deepEqual(table.persons, [{ name: "Jean ROCA", jh: 45, done: 28 }]);
});

test("a missing sub-header row keeps positional pairing and says so", () => {
  const parsed = parseCsv([HEADER, row("M1", "Jean", "PMO", "", "Alpha", "40", "25")].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match") throw new Error("header must match");
  const report = createReport();
  const table = parsePdc(parsed.rows.slice(1), identified, CONFIG, report, "PdC.csv");
  assert.deepEqual(table.projects.get("alpha")?.charges.get("pmo"), { jh: 40, done: 25 });
  assert.ok(report.warnings.some((w) => /sous-en-têtes Prév.\/Réel non trouvés/.test(w.message)));
});

test("empty names and total rows are gated", () => {
  const { report } = run([
    row("M1", "Jean", "PMO", "", "", "10", "0"),
    row("M1", "Jean", "PMO", "", "Total général", "10", "0"),
  ]);
  assert.deepEqual(report.discarded.map((d) => d.reason), [
    "nom de projet vide",
    "ligne de total/sous-total — exclue (risque de double compte)",
  ]);
});
