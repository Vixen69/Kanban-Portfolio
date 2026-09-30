// The archive row's « domaine · canal · colonne » line: spaced separators,
// « Sans domaine » for a card without domain, raw ids for what the config
// does not declare.

import { test } from "node:test";
import assert from "node:assert/strict";
import { testConfig } from "../core/test-helpers.ts";
import { archiveMeta } from "./lookup.ts";

const CONFIG = testConfig();

test("archiveMeta: « domaine · canal · colonne », every separator spaced (table)", () => {
  const domain = CONFIG.domains[0];
  const lane = CONFIG.lanes[0];
  const column = CONFIG.columns[0];
  assert.ok(domain !== undefined && lane !== undefined && column !== undefined);
  const cases: Array<[string, { domain: string; laneId: string; columnId: string }, string]> = [
    ["declared", { domain: domain.id, laneId: lane.id, columnId: column.id }, `${domain.short} · ${lane.name} · ${column.name}`],
    ["without domain", { domain: "", laneId: lane.id, columnId: column.id }, `Sans domaine · ${lane.name} · ${column.name}`],
    ["undeclared refs", { domain: domain.id, laneId: "gone", columnId: "old" }, `${domain.short} · gone · old`],
  ];
  for (const [name, card, expected] of cases) assert.equal(archiveMeta(CONFIG, card), expected, name);
});
