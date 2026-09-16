// ADR 035: the exercise year a request names — body field or query string.

import { test } from "node:test";
import assert from "node:assert/strict";
import { testConfig } from "../core/test-helpers.ts";
import { BadRequest } from "./errors.ts";
import { parseDecisions, parseExercise } from "./import.ts";
import { exerciseOrCurrent } from "./validation.ts";

const config = testConfig();

test("exerciseOrCurrent: absent → the current exercise; a number or a 4-digit string → that year", () => {
  assert.equal(exerciseOrCurrent(undefined, config), config.exercise.year);
  assert.equal(exerciseOrCurrent("", config), config.exercise.year);
  assert.equal(exerciseOrCurrent(2027, config), 2027);
  assert.equal(exerciseOrCurrent("2027", config), 2027);
  for (const bad of ["27", "abcd", 2027.5, 1999, 2101, true]) {
    assert.throws(() => exerciseOrCurrent(bad, config), BadRequest, String(bad));
  }
});

test("parseExercise reads the body's exercise field, defaulting to the current one", () => {
  assert.equal(parseExercise({ files: [] }, config), config.exercise.year);
  assert.equal(parseExercise({ files: [], exercise: 2027 }, config), 2027);
  assert.equal(parseExercise("pas un objet", config), config.exercise.year);
  assert.throws(() => parseExercise({ exercise: "bientôt" }, config), /Exercice invalide/);
});

test("parseDecisions reads the body's decisions by card id (ADR 036): garder / remplacer only", () => {
  assert.deepEqual([...parseDecisions({ files: [] })], []);
  assert.deepEqual([...parseDecisions({ decisions: { "PE1@2026": "garder", "PE2@2026": "remplacer" } })],
    [["PE1@2026", "garder"], ["PE2@2026", "remplacer"]]);
  assert.throws(() => parseDecisions({ decisions: ["garder"] }), /Décisions de domaine invalides/);
  assert.throws(() => parseDecisions({ decisions: { "PE1@2026": "peut-être" } }), /Décision invalide pour « PE1@2026 »/);
});

