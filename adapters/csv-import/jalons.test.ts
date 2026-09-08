// Semantic checks of the milestone reader: « franchi » cell formats
// (booleans, flags, dates), the ordered stage rule, the incoherence
// signalements, the Q21 survey and the config-anchored columns.

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

function run(dataLines: string[]): { table: JalonsTable; report: ImportReport } {
  const parsed = parseCsv([HEADER, ...dataLines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== JALONS_CONTRACT.id) {
    throw new Error("test header must match projets_jalons");
  }
  const report = createReport();
  const table = parseJalons(parsed.rows.slice(1), identified, CONFIG, report, "ProjetsJalons.csv", NOW);
  return { table, report };
}

test("the ordered rule maps the last milestone passed onto the config's stages", () => {
  const { table } = run([
    "A;Un;;VRAI;;VRAI;;VRAI;;",
    "B;Deux;;VRAI;;VRAI;;FAUX;;",
    "C;Trois;;OUI;;FAUX;;FAUX;;",
    "D;Quatre;;FAUX;;;;;;",
    "E;Cinq;;;;;;;;",
  ]);
  assert.deepEqual(table.entries.map((e) => [e.stage, e.columnId]), [
    ["exploitation", "exploitation"], ["actifs", "actifs"], ["etudes", "etudes"], ["entree", "demandes"], ["entree", "demandes"],
  ]);
  assert.deepEqual([...table.stageCounts.entries()], [["exploitation", 1], ["actifs", 1], ["etudes", 1], ["entree", 2]]);
});

test("dates and flags count as passed; future dates, incoherences and unreadable cells are signaled", () => {
  const { table, report } = run([
    "A;Un;;x;;01/06/2026;;31/12/2026;;",
    "B;Deux;;1;;peut-être;;0;;",
  ]);
  assert.deepEqual(table.entries.map((e) => [e.rdo, e.rdli, e.rdr, e.stage]), [
    [true, true, true, "exploitation"], [true, false, false, "etudes"],
  ]);
  assert.ok(report.warnings.some((w) => /« RDR franchi » daté dans le futur — compté franchi/.test(w.message)));
  assert.ok(report.warnings.some((w) => /« RDLI franchi » illisible — compté non franchi/.test(w.message)));
  const survey = report.warnings.find((w) => /cellules « franchi » — valeurs vues/.test(w.message));
  assert.ok(survey && /« x » \(1\)/.test(survey.message) && /« 01\/06\/2026 » \(1\)/.test(survey.message));
});

test("RDR without RDLI applies the ordered rule and is signaled", () => {
  const { table, report } = run(["A;Un;;FAUX;;FAUX;;VRAI;;"]);
  assert.equal(table.entries[0]?.stage, "exploitation");
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
  assert.deepEqual(table.entries.map((e) => e.stage), ["exploitation", "actifs", "etudes", "entree"]);
  assert.ok(!report.warnings.some((w) => /illisible/.test(w.message)));
});
