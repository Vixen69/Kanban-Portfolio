// Semantic checks of the milestone reader: the « (Statut) » rule (author,
// 2026-09-11 — Approuvé = passed, RDR approuvé = Done), the date and
// « franchi » fallbacks (cell formats: booleans, flags, dates), the
// ordered stage rule, the disagreement signalements, the surveys and the
// config-anchored columns.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { identifyHeader, JALONS_CONTRACT } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseJalons } from "./jalons.ts";
import type { JalonsTable } from "./jalons.ts";
import type { ImportReport } from "./report.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;
const NOW = new Date("2026-09-04T12:00:00.000Z");

const HEADER = "Id;Nom du projet;Etat du processus;RDO franchi;RDO (Statut);RDLI franchi;RDLI (Statut);RDR franchi;RDR (Statut);Jalon en cours";
const DATED_HEADER = "Id;Nom du projet;RDO;RDLI;RDR;RDO franchi;RDLI franchi;RDR franchi";
const FULL_HEADER = DATED_HEADER + ";RDO (Statut);RDLI (Statut);RDR (Statut)";

function run(dataLines: string[], header = HEADER): { table: JalonsTable; report: ImportReport } {
  const parsed = parseCsv([header, ...dataLines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== JALONS_CONTRACT.id) {
    throw new Error("test header must match projets_jalons");
  }
  const report = createReport();
  const table = parseJalons(parsed.rows.slice(1), identified, CONFIG, report, "ProjetsJalons.csv", NOW);
  return { table, report };
}

test("the « (Statut) » cell decides: Approuvé = passed, anything else = not; « franchi » only confirms", () => {
  const { table, report } = run([
    "A;Un;;O;Approuvé;O;Approuvé;O;Approuvé;",
    "B;Deux;;O;Approuvé;O;Approuvé;;Planifié;",
    "C;Trois;;;Planifié;O;Approuvé;;Planifié;",
    "D;Quatre;;O;Planifié;;;;;",
    "E;Cinq;;;Refusé;;;;;",
  ]);
  assert.deepEqual(table.entries.map((e) => [e.stage, e.columnId]), [
    ["done", "done"], ["actifs", "actifs"], ["actifs", "actifs"], ["entree", "demandes"], ["entree", "demandes"],
  ]);
  assert.ok(report.warnings.some((w) => /« RDO franchi » dit oui mais statut « Planifié » — le statut fait foi : 1 cellule/.test(w.message)));
  assert.ok(report.warnings.some((w) => /RDLI franchi sans RDO franchi/.test(w.message)));
  const survey = report.warnings.find((w) => /cellules « \(Statut\) » — valeurs vues/.test(w.message));
  assert.ok(survey && /« approuve » \(6\)/.test(survey.message) && /« planifie » \(4\)/.test(survey.message) && /« refuse » \(1\)/.test(survey.message));
  assert.deepEqual(table.reading, { statut: 11, date: 0, franchi: 4 });
});

test("a date disagreeing with the statut is signaled; the statut wins", () => {
  const { table, report } = run(["A;Un;01/01/2020;;;o;;;Planifié;;"], FULL_HEADER);
  assert.equal(table.entries[0]?.stage, "entree");
  assert.ok(report.warnings.some((w) => /« RDO » passé mais statut « Planifié » — le statut fait foi : 1 cellule/.test(w.message)));
  assert.deepEqual(table.reading, { statut: 1, date: 0, franchi: 2 });
});

test("the ordered rule maps the last milestone passed onto the config's stages", () => {
  const { table } = run([
    "A;Un;;VRAI;;VRAI;;VRAI;;",
    "B;Deux;;VRAI;;VRAI;;FAUX;;",
    "C;Trois;;OUI;;FAUX;;FAUX;;",
    "D;Quatre;;FAUX;;;;;;",
    "E;Cinq;;;;;;;;",
  ]);
  assert.deepEqual(table.entries.map((e) => [e.stage, e.columnId]), [
    ["done", "done"], ["actifs", "actifs"], ["etudes", "etudes"], ["entree", "demandes"], ["entree", "demandes"],
  ]);
  assert.deepEqual([...table.stageCounts.entries()], [["done", 1], ["actifs", 1], ["etudes", 1], ["entree", 2]]);
});

test("dates and flags count as passed; future dates, incoherences and unreadable cells are signaled", () => {
  const { table, report } = run([
    "A;Un;;x;;01/06/2026;;31/12/2026;;",
    "B;Deux;;1;;peut-être;;0;;",
  ]);
  assert.deepEqual(table.entries.map((e) => [e.rdo, e.rdli, e.rdr, e.stage]), [
    [true, true, true, "done"], [true, false, false, "etudes"],
  ]);
  assert.ok(report.warnings.some((w) => /« RDR franchi » daté dans le futur — compté franchi/.test(w.message)));
  assert.ok(report.warnings.some((w) => /« RDLI franchi » illisible — compté non franchi/.test(w.message)));
  const survey = report.warnings.find((w) => /cellules « franchi » — valeurs vues/.test(w.message));
  assert.ok(survey && /« x » \(1\)/.test(survey.message) && /« 01\/06\/2026 » \(1\)/.test(survey.message));
});

test("RDR without RDLI applies the ordered rule and is signaled", () => {
  const { table, report } = run(["A;Un;;FAUX;;FAUX;;VRAI;;"]);
  assert.equal(table.entries[0]?.stage, "done");
  assert.ok(report.warnings.some((w) => /RDR franchi sans RDLI franchi/.test(w.message)));
});

test("rows without id nor name are discarded; duplicate ids keep the first; name join key kept", () => {
  const { table, report } = run([
    ";;;VRAI;;;;;;",
    "A;Un;;VRAI;;;;;;",
    "A;Un bis;;FAUX;;;;;;",
    ";Sans id;;VRAI;;VRAI;;;;",
  ]);
  assert.deepEqual(table.entries.map((e) => e.name), ["Un", "Sans id"]);
  assert.equal(table.byName.get("sans id")?.stage, "actifs");
  assert.equal(report.discarded[0]?.reason, "ligne sans Id ni nom");
  assert.ok(report.doubtful.some((d) => /Id « A » en double/.test(d.question)));
});

test("« o » / « n » cells (August export) count as passed / not passed", () => {
  const { table, report } = run([
    "A;Un;;o;;o;;o;;",
    "B;Deux;;o;;o;;n;;",
    "C;Trois;;o;;n;;n;;",
    "D;Quatre;;n;;;;;;",
  ]);
  assert.deepEqual(table.entries.map((e) => e.stage), ["done", "actifs", "etudes", "entree"]);
  assert.ok(!report.warnings.some((w) => /illisible/.test(w.message)));
});

test("the RDO / RDLI / RDR date columns decide (passed at the audit day); « franchi » is the fallback", () => {
  const { table, report } = run([
    "A;Un;01/01/2020;01/06/2021;01/03/2022;o;o;o",
    "B;Deux;01/01/2020;01/06/2021;31/12/2099;o;o;o",
    "C;Trois;01/01/2020;;;o;o;n",
    "D;Quatre;n/a;;;n;;",
  ], DATED_HEADER);
  assert.deepEqual(table.entries.map((e) => e.stage), ["done", "actifs", "actifs", "entree"]);
  assert.deepEqual(table.reading, { statut: 0, date: 7, franchi: 5 });
  assert.ok(report.warnings.some((w) => /« RDR » à venir mais « RDR franchi » dit oui — la date fait foi : 1 cellule/.test(w.message)));
  assert.ok(report.warnings.some((w) => /« RDO » illisible — « RDO franchi » fait foi : 1 cellule\(s\), ligne\(s\) 5 — ex. « n\/a »/.test(w.message)));
});
