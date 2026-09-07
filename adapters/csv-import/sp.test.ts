// Semantic checks of the SP reader: both shapes (SP_2026 with Id, SP_total
// without), k€ conversion of euro amounts, keys for the joins, duplicate
// and total-row gates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./csv.ts";
import { identifyHeader, SP_CONTRACT } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseSp } from "./sp.ts";
import type { SpTable } from "./sp.ts";
import type { ImportReport } from "./report.ts";

const HEADER_2026 = "Sous domaine;Id;Nom;État du processus;Type Gpe;* Budget validé RDLI;Coût prév (ME);Coût réel;ME Achats;Engagé Achats;Réel Achats";
const HEADER_TOTAL =
  "Notes;Menu;Nom;Type;Score criblage;Priorité;Top projet;Responsable 1;État suivant autorisé;Catégorie;Début;" +
  "Jalon RVSR ou Fin;Jalon RDLI validé;Jalon RDR validé (Réf.8);Jalon RDR prévisionnel;Budget présenté PDSI;" +
  "* Budget validé RDLI;* CAT global projet;Coût prév (ME);Coût réel;ME Achats;Engagé Achats;Réel Achats";

function run(header: string, dataLines: string[]): { table: SpTable; report: ImportReport } {
  const parsed = parseCsv([header, ...dataLines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== SP_CONTRACT.id) {
    throw new Error(`test header must match sp (${identified.status})`);
  }
  const report = createReport();
  const table = parseSp(parsed.rows.slice(1), identified, report, "SP.csv");
  return { table, report };
}

test("SP_2026 shape: Id key, euros converted to k€, RDLI kept, total row discarded", () => {
  const { table, report } = run(HEADER_2026, [
    "INFRA OPE;PE10001;Modernisation atelier;En cours;Projets MOE;150;120 500 €;80 000 €;;30 000 €;",
    "ACHATS;;Étude connectivité;Nouveau;Etudes;40;30;;;;",
    ";;Total;;;;500;200;;50;",
  ]);
  assert.equal(table.hasIds, true);
  const first = table.byId.get("PE10001");
  assert.deepEqual(
    [first?.budgetEstimated, first?.budgetConsumed, first?.budgetEngaged, first?.budgetRdli],
    [120.5, 80, 30, 150],
  );
  assert.equal(table.byName.get("etude connectivite")?.id, null);
  assert.equal(table.entries.length, 2);
  assert.ok(report.discarded.some((d) => /total\/sous-total/.test(d.reason)));
  assert.ok(report.warnings.some((w) => /« Coût prév \(ME\) » en euros — converti en k€ : 1 cellule/.test(w.message)));
});

test("SP_total shape: no Id, the PE code embedded in the name is a key", () => {
  const { table } = run(HEADER_TOTAL, [
    ";;PE10001 Modernisation atelier;Achat;;;;;;;;;;;;;150;;120,5;80;;30;",
    ";;Sujet sans code;Étude;;;;;;;;;;;;;;;20;;;;",
  ]);
  assert.equal(table.hasIds, false);
  assert.equal(table.byCode.get("PE10001")?.budgetEstimated, 120.5);
  assert.equal(table.byName.get("pe10001 modernisation atelier")?.codename, "PE10001");
  assert.equal(table.byName.get("sujet sans code")?.codename, null);
});

test("duplicates by id or name keep the first and are questioned", () => {
  const { table, report } = run(HEADER_2026, [
    ";A;Un;;;;10;;;;",
    ";A;Un bis;;;;20;;;;",
    ";B;Un;;;;30;;;;",
  ]);
  assert.equal(table.entries.length, 1);
  assert.equal(report.doubtful.length, 2);
});
