// The year switch: unstamped cards pinned first, the closing year archived,
// the new year activated — and the fold agrees afterwards.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent, CardState } from "./types.ts";
import { switchPlan } from "./exercise-switch.ts";
import { foldEvents } from "./state.ts";
import { cardsOfExercise, isClockFrozen } from "./exercise.ts";
import { testCard } from "./test-helpers.ts";

function state(overrides: Parameters<typeof testCard>[0] = {}, archived = false): CardState {
  return {
    ...testCard(overrides), enteredColumnAt: "2026-03-01T00:00:00.000Z", comments: [], archived, decisions: [], absentFromLastImport: null,
  };
}

const TS = "2027-01-04T08:00:00.000Z";

test("switchPlan: pins the unstamped, archives the closing year's active cards, activates the new year's", () => {
  const cards = [
    state({ id: "legacy" }),                          // no exercise: pinned on 2026, then archived
    state({ id: "old", exercise: 2026 }),             // archived
    state({ id: "gone", exercise: 2026 }, true),      // already archived: left alone
    state({ id: "next", exercise: 2027 }),            // activated
    state({ id: "far", exercise: 2028 }),             // untouched
    state({ id: "past", exercise: 2025 }, true),      // untouched
  ];
  const plan = switchPlan(cards, 2026, 2027, "anonymous", TS);
  assert.deepEqual([plan.pinned, plan.archived, plan.activated], [1, 2, 1]);
  assert.deepEqual(plan.events.map((e) => [e.type, e.cardId]), [
    ["edited", "legacy"], ["archived", "legacy"], ["archived", "old"], ["activated", "next"],
  ]);
  assert.deepEqual(plan.events[0]?.payload, { patch: { exercise: 2026 }, reason: "bascule" });
  assert.ok(plan.events.every((e) => e.ts === TS && e.actor === "anonymous"));
});

test("after the switch, the fold shows 2026 closed and archived, 2027 current with its clock started", () => {
  const cards = [state({ id: "legacy" }), state({ id: "next", exercise: 2027 })];
  const plan = switchPlan(cards, 2026, 2027, "anonymous", TS);
  const events: CardEvent[] = plan.events.map((e, i) => ({ ...e, id: `evt-${i + 1}` }));
  const folded = foldEvents(cards, events);
  const legacy = folded.find((c) => c.id === "legacy");
  const next = folded.find((c) => c.id === "next");
  assert.deepEqual([legacy?.exercise, legacy?.archived], [2026, true], "pinned on the closing year and archived");
  assert.deepEqual([next?.exercise, next?.archived, next?.enteredColumnAt], [2027, false, TS], "the clock starts at the switch");
  assert.deepEqual(cardsOfExercise(folded, 2027, 2027).map((c) => c.id), ["next"], "the legacy card no longer follows the current year");
  assert.equal(isClockFrozen(next!, 2027), false);
});
