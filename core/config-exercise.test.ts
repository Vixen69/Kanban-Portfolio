// The exercise block (year, retained states — ADR 024/030), the capacity
// thresholds (ADR 033) and the transverse flag of a board config: parsed,
// defaulted for older runtime overrides, refused when malformed. Split
// from config.test.ts to respect the 300-line file cap.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, DEFAULT_EXERCISE_YEAR, validateBoardConfig } from "./config.ts";
import { testConfig } from "./test-helpers.ts";

// JSON round-trip clone of the valid test config, loosely typed so each
// table entry can corrupt one field in place.
function rawConfig(): any {
  return JSON.parse(JSON.stringify(testConfig()));
}

test("exercise year, states, capacity thresholds and transverse domains: parsed, defaulted, refused when malformed", () => {
  const config = validateBoardConfig(rawConfig());
  assert.deepEqual(config.exercise, { year: 2026 });
  assert.deepEqual(config.capacity, { tension: 0.9 });
  assert.equal(config.domains[1]?.transverse, true);
  assert.equal("transverse" in (config.domains[0] as object), false);
  const legacy = rawConfig();
  delete legacy.exercise;
  delete legacy.capacity;
  assert.deepEqual(validateBoardConfig(legacy).exercise, { year: DEFAULT_EXERCISE_YEAR });
  assert.deepEqual(validateBoardConfig(legacy).capacity, { tension: 0.9 }, "ADR 033: default tension");
  const withStates = rawConfig();
  withStates.exercise.states = ["Budget validé", "Nouveau"];
  assert.deepEqual(validateBoardConfig(withStates).exercise, { year: 2026, states: ["Budget validé", "Nouveau"] }, "ADR 030");
  const cases: [string, (raw: any) => void][] = [
    ["year not an integer", (raw) => (raw.exercise.year = 2026.5)],
    ["year out of range", (raw) => (raw.exercise.year = 1999)],
    ["extra exercise key", (raw) => (raw.exercise.month = 1)],
    ["states not a list", (raw) => (raw.exercise.states = "Nouveau")],
    ["states empty", (raw) => (raw.exercise.states = [])],
    ["state empty", (raw) => (raw.exercise.states = [""])],
    ["tension zero", (raw) => (raw.capacity.tension = 0)],
    ["tension too high", (raw) => (raw.capacity.tension = 3)],
    ["extra capacity key", (raw) => (raw.capacity.seuil = 1)],
    ["transverse not a boolean", (raw) => (raw.domains[0].transverse = "oui")],
  ];
  for (const [name, mutate] of cases) {
    const raw = rawConfig();
    mutate(raw);
    assert.throws(() => validateBoardConfig(raw), ConfigError, name);
  }
});
