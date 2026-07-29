// Semantic checks of the RDOM reader: tolerant domain resolution, duplicate
// merging, cross-domain ambiguities, coverage warnings — every anomaly must
// land in the report with its line.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Domain } from "../../core/types.ts";
import { parseCsv } from "./csv.ts";
import { identifyHeader } from "./contract.ts";
import { createReport } from "./report.ts";
import { createDomainResolver, parseRdom } from "./rdom.ts";
import type { RdomTable } from "./rdom.ts";
import type { ImportReport } from "./report.ts";

const DOMAINS: Domain[] = [
  { id: "ingenierie", name: "Ingénierie", short: "ING", color: "#888888" },
  { id: "infra", name: "Infra", short: "INF", color: "#888888" },
  { id: "erp", name: "ERP", short: "ERP", color: "#888888" },
  { id: "cyber", name: "Cyber", short: "CYB", color: "#888888" },
  { id: "archi_dev", name: "Archi & Dev", short: "A&D", color: "#888888" },
];

function run(text: string, domains: Domain[] = DOMAINS): { table: RdomTable; report: ImportReport } {
  const parsed = parseCsv(text);
  const header = parsed.rows[0];
  if (header === undefined) throw new Error("test input has no header");
  const identified = identifyHeader(header.cells);
  if (identified.status !== "match") throw new Error("test input header must match");
  const report = createReport();
  const table = parseRdom(parsed.rows.slice(1), identified, domains, report, "RDOM.csv");
  return { table, report };
}

test("id, name and short code all resolve, with the resolution in the note", () => {
  const { table, report } = run(
    "Domaine;Nom\nIngénierie;ALPHA\nerp;BRAVO\nINF;CHARLIE\nCYB;DELTA\narchi_dev;ECHO",
  );
  assert.equal(table.entries.length, 5);
  assert.deepEqual(
    table.entries.map((e) => e.domainId),
    ["ingenierie", "erp", "infra", "cyber", "archi_dev"],
  );
  assert.deepEqual(report.taken.map((t) => t.note), [
    "par nom", "par nom", "par code « INF »", "par code « CYB »", "par id",
  ]);
  assert.deepEqual(report.discarded, []);
  assert.deepEqual(report.doubtful, []);
  assert.deepEqual(report.warnings, []);
});

test("createDomainResolver is case- and accent-insensitive, unknown is empty", () => {
  const resolve = createDomainResolver(DOMAINS);
  assert.equal(resolve("INGENIERIE")[0]?.id, "ingenierie");
  assert.equal(resolve(" a&d ")[0]?.id, "archi_dev");
  assert.deepEqual(resolve("Marketing"), []);
});

test("an unknown domain is discarded with its line and value", () => {
  const { table, report } = run("Domaine;Nom\nMarketing;ALPHA\nInfra;BRAVO\nERP;X\nCyber;Y\nIngénierie;Z");
  assert.equal(table.entries.length, 4);
  assert.equal(report.discarded.length, 1);
  assert.match(report.discarded[0]?.reason ?? "", /domaine inconnu « Marketing »/);
  assert.equal(report.discarded[0]?.ref?.line, 2);
});

test("empty rows and empty cells are discarded with their reason", () => {
  const { report } = run("Domaine;Nom\n\n;ALPHA\nInfra;\nERP;X\nCyber;Y\nIngénierie;Z");
  const reasons = report.discarded.map((d) => d.reason);
  assert.deepEqual(reasons, ["ligne vide", "domaine vide", "nom vide"]);
});

test("a duplicate (domain, name) pair is merged with a warning", () => {
  const { table, report } = run("Domaine;Nom\nInfra;PICARD\nINF;picard\nERP;X\nCyber;Y\nIngénierie;Z");
  assert.equal(table.entries.filter((e) => e.domainId === "infra").length, 1);
  const merges = report.warnings.filter((w) => /fusionné/.test(w.message));
  assert.equal(merges.length, 1);
  assert.match(merges[0]?.message ?? "", /ligne 3.*ligne 2/);
});

test("the same name under two domains is doubtful, both entries kept", () => {
  const { table, report } = run("Domaine;Nom\nInfra;MARTIN\nCyber;MARTIN\nERP;X\nIngénierie;Z");
  assert.equal(table.entries.length, 4);
  assert.deepEqual(table.domainsByName.get("martin"), ["infra", "cyber"]);
  assert.equal(report.doubtful.length, 1);
  assert.match(report.doubtful[0]?.question ?? "", /plusieurs domaines/);
  assert.match(report.doubtful[0]?.question ?? "", /« infra » \(ligne 2\), « cyber » \(ligne 3\)/);
});

test("config domains without any RDOM name get coverage warnings, config order", () => {
  const { report } = run("Domaine;Nom\nInfra;ALPHA\nERP;BRAVO\nIngénierie;Z");
  const coverage = report.warnings.filter((w) => /domaine sans RDOM/.test(w.message));
  assert.equal(coverage.length, 2);
  assert.match(coverage[0]?.message ?? "", /« Cyber »/);
  assert.match(coverage[1]?.message ?? "", /« Archi & Dev »/);
});

test("extra cells beyond the declared columns are flagged, row still read", () => {
  const { table, report } = run("Domaine;Nom\nInfra;ALPHA;superflu\nERP;X\nCyber;Y\nIngénierie;Z");
  assert.equal(table.entries.length, 4);
  const extras = report.warnings.filter((w) => /au-delà des colonnes/.test(w.message));
  assert.equal(extras.length, 1);
});

test("a label colliding across domains is doubtful, never silently picked", () => {
  const tricky: Domain[] = [
    { id: "a", name: "Alpha", short: "S", color: "#888888" },
    { id: "b", name: "S", short: "T", color: "#888888" },
  ];
  const { table, report } = run("Domaine;Nom\nS;DUPONT\nAlpha;X\nT;Y", tricky);
  assert.equal(table.entries.length, 2);
  assert.equal(report.doubtful.length, 1);
  assert.match(report.doubtful[0]?.question ?? "", /correspond à plusieurs domaines/);
});

test("namesByDomain keeps original casing in insertion order", () => {
  const { table } = run("Domaine;Nom\nInfra;Zulu\nInfra;ALPHA\nERP;X\nCyber;Y\nIngénierie;Z");
  assert.deepEqual(table.namesByDomain.get("infra"), ["Zulu", "ALPHA"]);
});
