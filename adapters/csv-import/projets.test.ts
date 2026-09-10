// Semantic checks of the perimeter reader: types against the four retained
// (suffix ignored, unknown kept + questioned), direct Orga domain and
// sub-domain (folded outside detailed domains), the raw-export path
// translated through PARAM, lead exclusion from the chef de projet.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { identifyHeader, PARAM_CONTRACT, PROJETS_CONTRACT } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseParam } from "./param.ts";
import type { ParamTable } from "./param.ts";
import { parseProjets } from "./projets.ts";
import type { ProjetsTable } from "./projets.ts";
import type { ImportReport } from "./report.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const ORGA_HEADER =
  "Id;Nom;Domaine (Orga);Ss-Daine (Orga);Type;État du processus;Responsable 1;Responsable 2;Responsable 3;" +
  "Début;Fin;Budget RDLI Total Coût (Res+Trans);Charge finale ME (Res) (J);Charge réelle ME (Res) (J);Coût final ME (Res.+Trans)";
const RAW_HEADER =
  "Fichier;Id;Nom;Domaine;Portefeuille;Type;État du processus;Responsable 1;Responsable 2;Responsable 3;Responsable portefeuilles";

function param(): ParamTable {
  const text = [
    "Domaine;Responsable;;;Domaine (Orga);Sous-domaine (Orga);Responsable",
    "CORPORATE;BARBIER Anne;;DSI NEXTER.CORPORATE.ACHATS;CORPORATE;ACHATS;BARBIER Anne",
    "INFRA OPE;LAMBERT Luc;;DSI NEXTER.INFRA;INFRA;INFRA BUILD;LAMBERT Luc",
  ].join("\n");
  const parsed = parseCsv(text);
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== PARAM_CONTRACT.id) throw new Error("param header");
  return parseParam(parsed.rows.slice(1), identified, parsed.rows[0]?.cells ?? [], CONFIG, createReport(), "PARAM.csv");
}

function run(header: string, dataLines: string[], withParam: ParamTable | null): { table: ProjetsTable; report: ImportReport } {
  const parsed = parseCsv([header, ...dataLines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== PROJETS_CONTRACT.id) {
    throw new Error(`test header must match projets (${identified.status})`);
  }
  const report = createReport();
  const table = parseProjets(parsed.rows.slice(1), identified, CONFIG, withParam, report, "Projets.csv");
  return { table, report };
}

test("types: the four retained resolve whatever their suffix; others are kept and questioned", () => {
  const { table, report } = run(ORGA_HEADER, [
    "PE1;Un;INFRA;;Etude (Opportunité);Nouveau;;;;;;;;;",
    "PE2;Deux;INFRA;;Projet de gestion d'obscolescence (Projet);Nouveau;;;;;;;;;",
    "PE3;Trois;INFRA;;Projet de mise en oeuvre (Projet);Nouveau;;;;;;;;;",
    "PE4;Quatre;INFRA;;Projet IA (Projet);Nouveau;;;;;;;;;",
    "PE5;Cinq;INFRA;;TMA Corrective (Run);Nouveau;;;;;;;;;",
    "PE6;Six;INFRA;;;Nouveau;;;;;;;;;",
  ], null);
  assert.deepEqual(table.entries.map((e) => e.typeId), ["etude", "obsolescence", "mise_en_oeuvre", "ia", null, null]);
  assert.deepEqual([...table.typeCounts.entries()], [["etude", 1], ["obsolescence", 1], ["mise_en_oeuvre", 1], ["ia", 1], ["?", 2]]);
  assert.equal(table.entries.length, 6, "no row is excluded on type");
  assert.ok(report.doubtful.some((d) => /type hors des quatre retenus : « TMA Corrective \(Run\) »/.test(d.question)));
  assert.ok(report.warnings.some((w) => /« Type » vide/.test(w.message)));
});

test("direct Orga columns: domain + sub-domain, folded outside detailed domains", () => {
  const { table, report } = run(ORGA_HEADER, [
    "PE1;Un;CORPORATE;ACHATS;Etude;Nouveau;;;;;;;;;",
    "PE2;Deux;INFRA;INFRA BUILD;Etude;Nouveau;;;;;;;;;",
    "PE3;Trois;CORPORATE;INEXISTANT;Etude;Nouveau;;;;;;;;;",
    "PE4;Quatre;CYBER;;Etude;Nouveau;;;;;;;;;",
    "PE5;Cinq;;;Etude;Nouveau;;;;;;;;;",
  ], null);
  assert.equal(table.shape, "orga");
  assert.deepEqual(table.entries.map((e) => [e.domainId, e.subDomainId, e.domainSource]), [
    ["corporate", "achats", "orga"], ["infra", null, "orga"], ["corporate", null, "orga"], [null, null, null], [null, null, null],
  ]);
  assert.deepEqual(
    [table.counts.domainDirect, table.counts.domainMissing, table.counts.subDetailed, table.counts.subFolded],
    [3, 2, 1, 1],
  );
  assert.ok(report.doubtful.some((d) => /« Domaine \(Orga\) » inconnu du board : « CYBER »/.test(d.question)));
  assert.ok(report.doubtful.some((d) => /sous-domaine inconnu de la config : « corporate \/ INEXISTANT »/.test(d.question)));
});

test("raw export: the organisation path is translated through PARAM", () => {
  const { table, report } = run(RAW_HEADER, [
    "x;PE1;Un;DSI NEXTER.CORPORATE.ACHATS;P;Etude;Nouveau;;;;",
    "x;PE2;Deux;DSI NEXTER.INFRA;P;Etude;Nouveau;;;;",
    "x;PE3;Trois;DSI NEXTER.AILLEURS;P;Etude;Nouveau;;;;",
  ], param());
  assert.equal(table.shape, "path");
  assert.deepEqual(table.entries.map((e) => [e.domainId, e.subDomainId, e.domainSource]), [
    ["corporate", "achats", "param"], ["infra", null, "param"], [null, null, null],
  ]);
  assert.equal(table.counts.domainViaParam, 2);
  assert.ok(report.doubtful.some((d) => /chemin d'organisation absent de PARAM : « DSI NEXTER.AILLEURS »/.test(d.question)));
});

test("raw export without PARAM: no translation, said once", () => {
  const { table, report } = run(RAW_HEADER, ["x;PE1;Un;DSI NEXTER.INFRA;P;Etude;Nouveau;;;;"], null);
  assert.equal(table.entries[0]?.domainId, null);
  assert.ok(report.warnings.some((w) => /export brut sans PARAM/.test(w.message)));
  assert.ok(report.warnings.some((w) => /PARAM absent — responsables de domaine non exclus/.test(w.message)));
});

test("chef de projet: first Responsable that is not a domain lead; identity, dates, RDLI, efforts", () => {
  const { table, report } = run(ORGA_HEADER, [
    "PE1;Un;INFRA;;Etude;En cours;LAMBERT Luc;Alice MERLE;;12/01/2025;15/09/2026;150;110;70;999",
    "PE2;Deux;INFRA;;Etude;En cours;Luc LAMBERT 9100002;;;;;120 000 €;;;",
    ";Trois PE10003;INFRA;;Etude;Nouveau;;;;;;;;;",
  ], param());
  const [un, deux, trois] = table.entries;
  assert.equal(un?.owner, "Alice MERLE");
  assert.equal(un?.codename, "PE1");
  assert.equal(un?.createdAt, "2025-01-12");
  assert.equal(un?.dateRdr, "2026-09-15");
  assert.deepEqual([un?.budgetRdli, un?.effortEstimated, un?.effortConsumed], [150, 110, 70]);
  assert.equal(deux?.owner, null, "the only responsable is a lead");
  assert.equal(deux?.budgetRdli, 120, "euros converted to k€");
  assert.equal(trois?.codename, "PE10003", "no Id: the PE code embedded in the name");
  assert.equal(trois?.id, "");
  assert.deepEqual([table.counts.withOwner, table.counts.leadsExcluded], [1, 2]);
  assert.ok(report.warnings.some((w) => /« Id » vide/.test(w.message)));
  assert.ok(report.warnings.some((w) => /en euros — converti en k€/.test(w.message)));
});

test("structural gates: empty, nameless and total rows are discarded; duplicate ids questioned", () => {
  const { table, report } = run(ORGA_HEADER, [
    ";;;;;;;;;;;;;;",
    "PE1;;INFRA;;Etude;Nouveau;;;;;;;;;",
    "PE2;Total général;INFRA;;Etude;Nouveau;;;;;;;;;",
    "PE3;Trois;INFRA;;Etude;Nouveau;;;;;;;;;",
    "PE3;Trois bis;INFRA;;Etude;Nouveau;;;;;;;;;",
  ], null);
  assert.deepEqual(table.entries.map((e) => e.name), ["Trois"]);
  assert.deepEqual(report.discarded.map((d) => d.reason), [
    "ligne vide", "nom vide", "ligne de total/sous-total — exclue (risque de double compte)",
  ]);
  assert.ok(report.doubtful.some((d) => /Id « PE3» porté par/.test(d.question)));
});

test("the card title drops the leading project code the name repeats (author, 2026-09-09)", () => {
  const { table } = run(ORGA_HEADER, [
    "PX4520155;PX4520155 - Modernisation atelier;INFRA;;Etude;Nouveau;;;;;;;;;",
    "PX4520156;[PX4520156] Étude connectivité;INFRA;;Etude;Nouveau;;;;;;;;;",
    "PX4520157;Portail fournisseurs;INFRA;;Etude;Nouveau;;;;;;;;;",
    "PX4520158;PX4520158;INFRA;;Etude;Nouveau;;;;;;;;;",
  ], null);
  assert.deepEqual(table.entries.map((e) => e.title),
    ["Modernisation atelier", "Étude connectivité", "Portail fournisseurs", "PX4520158"]);
  assert.equal(table.entries[0]?.name, "PX4520155 - Modernisation atelier", "the raw name stays for the joins by name");
});

test("types: a keyword alias is found inside any spelling of the label, as a whole word (author, 2026-09-10)", () => {
  const { table } = run(ORGA_HEADER, [
    "PE1;Un;INFRA;;Projet de gestion de l'obsolescence (Projet);Nouveau;;;;;;;;;",
    "PE2;Deux;INFRA;;Gestion obsolescence (Run);Nouveau;;;;;;;;;",
    "PE3;Trois;INFRA;;Projet de gestion d'obscolescence (Projet);Nouveau;;;;;;;;;",
    "PE4;Quatre;INFRA;;Projet IA (Projet);Nouveau;;;;;;;;;",
    "PE5;Cinq;INFRA;;Obsolescences applicatives;Nouveau;;;;;;;;;",
    "PE6;Six;INFRA;;Evolution - TMA (Run);Nouveau;;;;;;;;;",
  ], null);
  assert.deepEqual(table.entries.map((e) => e.typeId), ["obsolescence", "obsolescence", "obsolescence", "ia", null, null]);
});
