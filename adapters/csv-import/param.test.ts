// Semantic checks of the PARAM reader: side-by-side tables located by
// header, the unlabeled organisation-path column, lead exclusion words,
// sub-domain resolution only inside detailed domains, vocabulary doubts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { identifyHeader, PARAM_CONTRACT } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseParam } from "./param.ts";
import type { ParamTable } from "./param.ts";
import type { ImportReport } from "./report.ts";
import { isDomainLead } from "./domains.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

const TITLES = "DOMAINES;;;CORRESPONDANCE ORGANISATION/DOMAINE/SOUS-DOMAINE;;;;;CORRESPONDANCE PORTEFEUILLE/DOMAINE/SOUS-DOMAINE;;";
const HEADER = "Domaine;Responsable;;;Domaine (Orga);Sous-domaine (Orga);Responsable;;Domaine (Ptf);Sous domaine (Ptf);Responsable";

function run(dataLines: string[]): { table: ParamTable; report: ImportReport } {
  const parsed = parseCsv([TITLES, HEADER, ...dataLines].join("\n"));
  const header = parsed.rows[1];
  const identified = identifyHeader(header?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== PARAM_CONTRACT.id) {
    throw new Error("test header must match param");
  }
  const report = createReport();
  const table = parseParam(parsed.rows.slice(2), identified, header?.cells ?? [], CONFIG, report, "PARAM.csv");
  return { table, report };
}

test("the four-table layout is recognized despite empty header cells and repeated Responsable", () => {
  const parsed = parseCsv([TITLES, HEADER].join("\n"));
  const first = identifyHeader(parsed.rows[0]?.cells ?? []);
  assert.equal(first.status, "unknown", "the title row is not a header");
  const second = identifyHeader(parsed.rows[1]?.cells ?? []);
  assert.equal(second.status, "match");
  if (second.status !== "match") return;
  assert.equal(second.contract.id, "param");
  assert.ok(second.deviations.some((d) => d.kind === "duplicate" && d.column === "Responsable"));
  assert.ok(second.deviations.some((d) => d.kind === "extra" && d.column === "(colonne vide)"));
});

test("leads, organisation paths and sub-domains are read from their own tables", () => {
  const { table, report } = run([
    "A&D;BERGER Paul;;DSI NEXTER.AAD.GROUPE : Architecture;A&D;ARCHITECTURE APPLICATIVE;BERGER Paul;;A&D;FORGE LOGICIELS;BERGER Paul",
    "CORPORATE;BARBIER Anne;;DSI NEXTER.CORPORATE.ACHATS;CORPORATE;ACHATS;BARBIER Anne;;;;",
    "INFRA OPE;LAMBERT Luc;;DSI NEXTER.INFRA;INFRA;INFRA BUILD;LAMBERT Luc;;;;",
    ";;;;CORPORATE;QUALITE;BARBIER Anne;;;;",
  ]);
  assert.deepEqual(table.leads.map((l) => [l.name, l.domainId]), [
    ["BERGER Paul", "ad"], ["BARBIER Anne", "corporate"], ["LAMBERT Luc", null],
  ]);
  assert.deepEqual(table.counts, { leads: 3, orgaRows: 4, withPath: 3 });
  const infra = table.byPath.get("dsi nexter.infra");
  assert.equal(infra?.domainId, "infra");
  assert.equal(infra?.subDomainId, null, "INFRA is not detailed: its sub-domain folds");
  assert.equal(table.byPath.get("dsi nexter.corporate.achats")?.subDomainId, "achats");
  assert.equal(table.byPath.get("dsi nexter.aad.groupe : architecture")?.subDomainId, "architecture_applicative");
  assert.ok(isDomainLead(table.leadWords, "Paul BERGER 9100001"));
  assert.ok(isDomainLead(table.leadWords, "BERGER, Paul"));
  assert.ok(!isDomainLead(table.leadWords, "BERGERON Paul"), "whole words only");
  assert.ok(!isDomainLead(table.leadWords, "Alice MERLE"));
  assert.ok(report.warnings.some((w) => /colonne sans en-tête n° 4/.test(w.message)));
  assert.ok(report.warnings.some((w) => /libellé hors vocabulaire Orga du board/.test(w.message)));
  assert.equal(report.doubtful.length, 0);
});

test("unknown Orga domains and sub-domains are questions; missing config sub-domains are said", () => {
  const { table, report } = run([
    "ERP;ROUSSEL Marc;;DSI NEXTER.CYBER;CYBER;CYBER;X;;;;",
    ";;;DSI NEXTER.CORPORATE.X;CORPORATE;INEXISTANT;BARBIER Anne;;;;",
    ";;;DSI NEXTER.CORPORATE.X;CORPORATE;QUALITE;BARBIER Anne;;;;",
  ]);
  assert.equal(table.orga.length, 3);
  assert.ok(report.doubtful.some((d) => /« Domaine \(Orga\) » inconnu du board : « CYBER »/.test(d.question)));
  assert.ok(report.doubtful.some((d) => /sous-domaine inconnu de la config : « CORPORATE \/ INEXISTANT »/.test(d.question)));
  assert.ok(report.doubtful.some((d) => /chemin d'organisation « DSI NEXTER.CORPORATE.X » associé à deux cibles/.test(d.question)));
  assert.ok(report.warnings.some((w) => /sous-domaines de la config absents de PARAM pour A&D/.test(w.message)));
});

test("an empty DOMAINES table is said out loud", () => {
  const { table, report } = run([";;;DSI NEXTER.INFRA;INFRA;INFRA OPE;LAMBERT Luc;;;;"]);
  assert.equal(table.leads.length, 0);
  assert.ok(report.warnings.some((w) => /aucun responsable de domaine lu/.test(w.message)));
});
