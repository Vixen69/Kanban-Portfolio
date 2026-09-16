// ADR 035: the `activated` event restarts a card's aging clock in place
// (position untouched, no stage entry), and an `edited` patch may move a
// card to another exercise.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { foldEvents } from "./state.ts";
import { testCard } from "./test-helpers.ts";

function event(partial: Partial<CardEvent> & Pick<CardEvent, "id" | "ts" | "type" | "cardId">): CardEvent {
  return { actor: "test", fromColumn: null, toColumn: null, payload: {}, ...partial };
}

test("activated restarts the clock where the card stands, without a move", () => {
  const card = testCard({ id: "S1", columnId: "etudes", createdAt: "2026-11-02T00:00:00.000Z", exercise: 2027 });
  const [state] = foldEvents([card], [
    event({ id: "e1", ts: "2026-11-20T00:00:00.000Z", type: "moved", cardId: "S1", fromColumn: "etudes", toColumn: "prets" }),
    event({ id: "e2", ts: "2027-01-05T08:00:00.000Z", type: "activated", cardId: "S1" }),
  ]);
  assert.equal(state?.columnId, "prets");
  assert.equal(state?.enteredColumnAt, "2027-01-05T08:00:00.000Z");
  assert.equal(state?.exercise, 2027);
});

test("an edited patch may move the card to another exercise; a non-integer is ignored", () => {
  const card = testCard({ id: "S2", exercise: 2026 });
  const [moved] = foldEvents([card], [
    event({ id: "e1", ts: "2026-12-01T00:00:00.000Z", type: "edited", cardId: "S2", payload: { patch: { exercise: 2027 } } }),
  ]);
  assert.equal(moved?.exercise, 2027);
  const [kept] = foldEvents([card], [
    event({ id: "e2", ts: "2026-12-01T00:00:00.000Z", type: "edited", cardId: "S2", payload: { patch: { exercise: "2027" } } }),
  ]);
  assert.equal(kept?.exercise, 2026);
});
