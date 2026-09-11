// The optional `aliases` of the vocabulary entries (config-vocab.ts): the
// export labels a type is read from (ADR 029) and the export labels or
// Sciforma portfolio words a domain is read from (ADR 030). Split from
// config.test.ts to respect the 300-line file cap.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, validateBoardConfig } from "./config.ts";
import { testConfig } from "./test-helpers.ts";

// JSON round-trip clone of the valid test config, loosely typed so each
// table entry can corrupt one field in place.
function rawConfig(): any {
  return JSON.parse(JSON.stringify(testConfig()));
}

test("types: aliases are kept when present, absent otherwise; a non-list or empty alias fails", () => {
  const raw = rawConfig();
  raw.types[0].aliases = ["Projet de gestion d’obsolescence", "Gestion obsolescence"];
  const config = validateBoardConfig(raw);
  assert.deepEqual(config.types[0]?.aliases, ["Projet de gestion d’obsolescence", "Gestion obsolescence"]);
  assert.equal("aliases" in (config.types[1] ?? {}), false);
  raw.types[0].aliases = "Projet";
  assert.throws(() => validateBoardConfig(raw), ConfigError);
  raw.types[0].aliases = [""];
  assert.throws(() => validateBoardConfig(raw), ConfigError);
});

test("domains: aliases are kept when present, absent otherwise; a non-list or empty alias fails (ADR 030)", () => {
  const raw = rawConfig();
  raw.domains[0].aliases = ["INFRASTRUCTURE", "INFRA OPE"];
  const config = validateBoardConfig(raw);
  assert.deepEqual(config.domains[0]?.aliases, ["INFRASTRUCTURE", "INFRA OPE"]);
  assert.equal("aliases" in (config.domains[1] ?? {}), false);
  raw.domains[0].aliases = "INFRASTRUCTURE";
  assert.throws(() => validateBoardConfig(raw), ConfigError);
  raw.domains[0].aliases = [""];
  assert.throws(() => validateBoardConfig(raw), ConfigError);
});
