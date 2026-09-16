// Exercises (ADR 035): a card's exercise defaults to the current one, a
// year's status follows from the comparison, the clock is frozen while a
// year is in preparation, and a board shows one exercise at a time.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardState } from "./types.ts";
import {
  cardCountsByYear, cardsOfExercise, exerciseOf, exerciseStatus, exerciseYears, hasExerciseSuffix, instanceId, isClockFrozen,
  selectableYears,
} from "./exercise.ts";
import { testCard } from "./test-helpers.ts";

function state(overrides: Parameters<typeof testCard>[0] = {}): CardState {
  return {
    ...testCard(overrides), enteredColumnAt: "2026-01-01T00:00:00.000Z", comments: [], archived: false,
    decisions: [], absentFromLastImport: null,
  };
}

test("a card without exercise belongs to the current one; a year's status follows from the comparison", () => {
  assert.equal(exerciseOf(testCard(), 2026), 2026);
  assert.equal(exerciseOf(testCard({ exercise: 2027 }), 2026), 2027);
  assert.deepEqual([2025, 2026, 2027].map((year) => exerciseStatus(year, 2026)), ["closed", "current", "preparing"]);
});

test("the aging clock is frozen only while the card's exercise is in preparation", () => {
  assert.equal(isClockFrozen(testCard({ exercise: 2027 }), 2026), true);
  assert.equal(isClockFrozen(testCard({ exercise: 2026 }), 2026), false);
  assert.equal(isClockFrozen(testCard({ exercise: 2025 }), 2026), false);
  assert.equal(isClockFrozen(testCard(), 2026), false, "a legacy card follows the current exercise");
});

test("the known years and the cards of one exercise", () => {
  const cards = [
    state({ id: "A" }), state({ id: "B", exercise: 2027 }), state({ id: "C", exercise: 2025 }), state({ id: "D", exercise: 2026 }),
  ];
  assert.deepEqual(exerciseYears(cards, 2026), [2025, 2026, 2027]);
  assert.deepEqual(exerciseYears([], 2026), [2026]);
  assert.deepEqual(cardsOfExercise(cards, 2026, 2026).map((c) => c.id), ["A", "D"]);
  assert.deepEqual(cardsOfExercise(cards, 2027, 2026).map((c) => c.id), ["B"]);
  // Once 2027 is the current exercise, the legacy card A follows it — the
  // activation pins every unstamped card to the closing year first (ADR 035).
  assert.deepEqual(cardsOfExercise(cards, 2027, 2027).map((c) => c.id), ["A", "B"]);
});

test("instance ids carry their exercise; ids stored before ADR 035 do not", () => {
  assert.equal(instanceId("PE10001", 2027), "PE10001@2027");
  assert.equal(hasExerciseSuffix("PE10001@2027"), true);
  assert.equal(hasExerciseSuffix("PE10001"), false);
  assert.equal(hasExerciseSuffix("IMP-etude-b"), false);
});


test("the selector offers the years around the current one plus every year holding cards, and counts them", () => {
  const cards = [testCard({ id: "A" }), testCard({ id: "B", exercise: 2027 }), testCard({ id: "C", exercise: 2019 })];
  assert.deepEqual(selectableYears(cards, 2026, 2, 2), [2019, 2024, 2025, 2026, 2027, 2028]);
  assert.deepEqual(selectableYears([], 2026), [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031]);
  assert.deepEqual([...cardCountsByYear(cards, 2026)], [[2026, 1], [2027, 1], [2019, 1]]);
});
