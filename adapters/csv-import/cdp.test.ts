// The ProjetsCdP reader: the chef de projet of an Id (or a name) comes
// from the same row whatever the row order of the export (ADR 056,
// duplicate-rows.ts); the duplicate is still said.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./csv.ts";
import { CDP_CONTRACT, identifyHeader } from "./contract.ts";
import { createReport } from "./report.ts";
import { parseCdp } from "./cdp.ts";

const HEADER = "Id;Nom;Responsable 1;Responsable 2;Responsable 3";

function read(lines: readonly string[]): { byId: unknown; byName: unknown; warnings: string[] } {
  const parsed = parseCsv([HEADER, ...lines].join("\n"));
  const identified = identifyHeader(parsed.rows[0]?.cells ?? []);
  if (identified.status !== "match" || identified.contract.id !== CDP_CONTRACT.id) throw new Error("cdp header");
  const report = createReport();
  const table = parseCdp(parsed.rows.slice(1), identified, null, report, "ProjetsCdP.csv");
  return { byId: [...table.byId].sort(), byName: [...table.byName].sort(), warnings: report.warnings.map((w) => w.message) };
}

test("a repeated Id keeps the same chef de projet in any row order, and the duplicate is said", () => {
  const a = "PE20050;Projet A;Alice MERLE;;";
  const b = "PE20050;Projet A;Bruno DIAZ;Farid KOVAC;";
  const forward = read([a, b]);
  assert.deepEqual(read([b, a]).byId, forward.byId);
  assert.deepEqual(forward.byId, [["pe20050", "Bruno DIAZ"]], "the most complete row");
  assert.deepEqual(forward.byName, [["projet a", "Bruno DIAZ"]], "the name fallback follows the same rule");
  assert.ok(forward.warnings.some((w) => w.startsWith("Id en double — ligne gardée : la plus fréquente")));
  assert.deepEqual(read([a, b, a]).byId, [["pe20050", "Alice MERLE"]], "the content two rows repeat wins");
});
