// Semantic checks of the SP_total reader against the real header layout
// (survey of 2026-07-29): name splitting, milestone -> position, budgets,
// duplicates, unknown types, aggregated signalements.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { identifyHeader, SP_TOTAL_CONTRACT } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseSpTotal } from "./sp-total.ts";
import type { SpTotalTable } from "./sp-total.ts";
import type { ImportReport } from "./report.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const NOW = new Date("2026-07-29T12:00:00.000Z");

// The real header line, minus the ignored columns (kept in HEADER_FULL).
const HEADER =
  "Nom;Type;Début;Jalon RDLI validé;Jalon RDR validé (Réf.8);Jalon RDR prévisionnel;" +
  "* Budget validé RDLI;Coût prév (ME);Coût réel;Engagé Achats;État suivant autorisé";

function run(dataLines: string[]): { table: SpTotalTable; report: ImportReport } {
  const parsed = parseCsv([HEADER, ...dataLines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== SP_TOTAL_CONTRACT.id) {
    throw new Error("test header must match sp_total");
  }
  const report = createReport();
  const table = parseSpTotal(parsed.rows.slice(1), identified, CONFIG, report, "SP_total.csv", NOW);
  return { table, report };
}

test("a full row maps every field: code split, type, dates, budgets", () => {
  const { table, report } = run([
    "PE12345 - Refonte SI;Achat;01/02/2025;15/03/2025;;10/11/2026;150;120,5;80;30,25;Etude",
  ]);
  const draft = table.drafts[0];
  assert.equal(draft?.codename, "PE12345");
  assert.equal(draft?.title, "Refonte SI");
  assert.equal(draft?.typeId, "achat");
  assert.equal(draft?.createdAt, "2025-02-01");
  assert.equal(draft?.dateRdr, "2026-11-10");
  assert.equal(draft?.budgetRdli, 150);
  assert.equal(draft?.budgetEstimated, 120.5);
  assert.equal(draft?.budgetConsumed, 80);
  assert.equal(draft?.budgetEngaged, 30.25);
  assert.equal(draft?.columnId, "actifs");
  assert.equal(report.taken.length, 1);
  assert.equal(report.taken[0]?.note, "PE12345");
});

test("milestones position the card: RDR validé > RDLI > amont", () => {
  const { table } = run([
    "A;;;;01/01/2026;;;;;;",
    "B;;;01/01/2026;;;;;;;",
    "C;;;;;;;;;;",
  ]);
  assert.deepEqual(table.drafts.map((d) => d.columnId), ["exploitation", "actifs", "demandes"]);
  assert.equal(table.distribution.get("exploitation"), 1);
  assert.equal(table.distribution.get("actifs"), 1);
  assert.equal(table.distribution.get("demandes"), 1);
});

test("a future milestone does not count and is signaled (Q15)", () => {
  const { table, report } = run(["Futur;;;01/01/2027;;;;;;;"]);
  assert.equal(table.drafts[0]?.columnId, "demandes");
  assert.ok(report.warnings.some((w) => /daté dans le futur — non compté \(Q15\)/.test(w.message)));
});

test("a oui/x milestone counts as passed but is signaled", () => {
  const { table, report } = run(["Coche;;;x;;;;;;;"]);
  assert.equal(table.drafts[0]?.columnId, "actifs");
  assert.ok(report.warnings.some((w) => /sans date .*compté passé/.test(w.message)));
});

test("a name without code keeps its full title, no codename", () => {
  const { table } = run(["Refonte réseau usine;;;;;;;;;;"]);
  assert.equal(table.drafts[0]?.codename, null);
  assert.equal(table.drafts[0]?.title, "Refonte réseau usine");
});

test("4- and 6-digit codes are read and counted unusual", () => {
  const { table, report } = run(["PE1234 Alpha;;;;;;;;;;", "PE123456 Beta;;;;;;;;;;"]);
  assert.deepEqual(table.drafts.map((d) => d.codename), ["PE1234", "PE123456"]);
  const unusual = report.warnings.find((w) => /longueur inhabituelle/.test(w.message));
  assert.match(unusual?.message ?? "", /2 cellule\(s\)/);
});

test("duplicate names (case/accents apart) keep the first row, one doubt", () => {
  const { table, report } = run(["Même sujet;;;;;;;;;;", "MÊME  SUJET;;;;;;;;;;"]);
  assert.equal(table.drafts.length, 1);
  assert.equal(report.doubtful.length, 1);
  assert.match(
    report.doubtful[0]?.question ?? "",
    /« Même sujet » \(ligne 2\) et « MÊME {2}SUJET » \(ligne 3\) en double/,
  );
});

test("the same PE code under two names raises a renaming doubt, both kept", () => {
  const { table, report } = run(["PE12345 Alpha;;;;;;;;;;", "PE12345 Alpha v2;;;;;;;;;;"]);
  assert.equal(table.drafts.length, 2);
  assert.equal(report.doubtful.length, 1);
  assert.match(report.doubtful[0]?.question ?? "", /code PE12345 porté par deux noms .*renommage \?/);
});

test("total and sub-total rows are excluded with the double-count reason", () => {
  const { table, report } = run([
    "Total portefeuille;;;;;;2450;1980;1200;900;",
    "Sous-total ERP;;;;;;100;80;60;40;",
    "PE10001 Vrai sujet;;;;;;10;8;6;4;",
  ]);
  assert.equal(table.drafts.length, 1);
  assert.equal(report.discarded.length, 2);
  assert.match(report.discarded[0]?.reason ?? "", /total\/sous-total.*double compte/);
});

test("RDR validé without RDLI is positioned by the rule and signaled", () => {
  const { table, report } = run(["Incohérent;;;;01/01/2026;;;;;;"]);
  assert.equal(table.drafts[0]?.columnId, "exploitation");
  assert.ok(report.warnings.some((w) => /jalons incohérents : RDR validé sans RDLI/.test(w.message)));
});

test("an Excel FAUX milestone is an explicit no: not passed, not noisy", () => {
  const { table, report } = run(["Booléen;;;FAUX;;;;;;;"]);
  assert.equal(table.drafts[0]?.columnId, "demandes");
  assert.equal(report.warnings.filter((w) => /illisible/.test(w.message)).length, 0);
});

test("truncated rows are read (missing cells empty) and signaled", () => {
  const { table, report } = run(["Court;Achat;01/02/2025"]);
  assert.equal(table.drafts[0]?.columnId, "demandes");
  assert.ok(report.warnings.some((w) => /cellules manquantes par rapport aux en-têtes/.test(w.message)));
});

test("lowercase and spaced PE codes are read and signaled", () => {
  const { table, report } = run(["pe12345 Alpha;;;;;;;;;;", "PE 22222 Beta;;;;;;;;;;"]);
  assert.deepEqual(table.drafts.map((d) => d.codename), ["PE12345", "PE22222"]);
  assert.ok(report.warnings.some((w) => /code projet en minuscules/.test(w.message)));
  assert.ok(report.warnings.some((w) => /code projet avec espace ou tiret/.test(w.message)));
});

test("empty Début cells are counted (cards without a creation date)", () => {
  const { report } = run(["Sans début;;;;;;;;;;"]);
  const empty = report.warnings.find((w) => /« Début » vide/.test(w.message));
  assert.match(empty?.message ?? "", /1 cellule\(s\), ligne\(s\) 2/);
});

test("unknown types become one doubt per distinct label, with lines", () => {
  const { table, report } = run([
    "A;Forfait;;;;;;;;;",
    "B;Forfait;;;;;;;;;",
    "C;TMA Corrective;;;;;;;;;",
  ]);
  assert.equal(table.drafts[2]?.typeId, "tma_corrective");
  assert.equal(report.doubtful.length, 1);
  assert.match(report.doubtful[0]?.question ?? "", /type inconnu « Forfait » \(2 sujet\(s\), ligne\(s\) 2, 3\)/);
});

test("unreadable amounts and dates are aggregated with their lines", () => {
  const { table, report } = run([
    "A;;#REF!;;;;N/A;-;12;5;",
    "B;;31/02/2026;;;;?;;;;",
  ]);
  assert.equal(table.drafts[0]?.budgetRdli, null);
  assert.equal(table.drafts[0]?.budgetConsumed, 12);
  const rdli = report.warnings.find((w) => /« \* Budget validé RDLI » illisible/.test(w.message));
  assert.match(rdli?.message ?? "", /2 cellule\(s\), ligne\(s\) 2, 3/);
  const debut = report.warnings.find((w) => /« Début » illisible/.test(w.message));
  assert.match(debut?.message ?? "", /2 cellule\(s\)/);
});

test("next-state values are collected for Q1", () => {
  const { table, report } = run(["A;;;;;;;;;;RDLI", "B;;;;;;;;;;RDLI", "C;;;;;;;;;;RDO"]);
  assert.equal(table.nextStates.get("RDLI"), 2);
  assert.equal(table.nextStates.get("RDO"), 1);
  const seen = report.warnings.find((w) => /État suivant autorisé/.test(w.message));
  assert.match(seen?.message ?? "", /« RDLI » \(2\) ; « RDO » \(1\)/);
});

test("empty rows and empty names are discarded with reasons", () => {
  const { report } = run(["", ";Achat;;;;;;;;;"]);
  assert.deepEqual(report.discarded.map((d) => d.reason), ["ligne vide", "nom vide"]);
});
