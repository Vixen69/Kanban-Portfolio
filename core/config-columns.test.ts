// Column vocabulary of the board config: the referential's reviews at the
// columns' entries (ADR 045), where each quality gate opens and where it is
// validated (ADR 047), and the versioned model's stages as the PMO reads them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateBoardConfig } from "./config.ts";
import { testConfig } from "./test-helpers.ts";

// JSON round-trip clone of the valid test config, loosely typed to edit in place.
function rawConfig(): any {
  return JSON.parse(JSON.stringify(testConfig()));
}
test("column review (ADR 045): a trimmed short text, or null — an empty text reads as null", () => {
  const raw = rawConfig();
  raw.columns[0].review = "  RDO ";
  raw.columns[1].review = "   ";
  delete raw.columns[2].review;
  const config = validateBoardConfig(raw);
  assert.deepEqual(config.columns.map((c) => c.review), ["RDO", null, null]);
});

test("the versioned model's stages (ADR 045/047): names, reviews, where each gate opens and where it is validated", () => {
  const config = validateBoardConfig(JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8")));
  assert.deepEqual(config.columns.map((c) => [c.id, c.name, c.review, c.gateStart, c.gate]), [
    ["demandes", "Demandes", null, null, null],
    ["qualification", "Qualification", "RDO", "DoR", null],
    ["etudes", "Études/Cadrage", null, null, null],
    ["prets", "Prêts", "RDLI", "DoD", "DoR"],
    ["pause", "Pause", null, null, null],
    ["actifs", "Actifs", "Kick-off", null, null],
    ["done", "Terminé", "RDR", null, "DoD"],
    ["exploitation", "Exploitation", null, null, null],
  ]);
});

test("column gateStart (ADR 047): a gate code or null, absent = null", () => {
  const raw = rawConfig();
  raw.columns[0].gateStart = "DoR";
  delete raw.columns[1].gateStart;
  const config = validateBoardConfig(raw);
  assert.deepEqual(config.columns.map((c) => c.gateStart), ["DoR", null, null]);
});
