// Fold-order semantics of the manual reordering (ADR 019), split from
// state.test.ts to respect the 300-line file cap.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { foldEvents } from "./state.ts";
import { testCard } from "./test-helpers.ts";

function event(partial: Partial<CardEvent> & Pick<CardEvent, "id" | "ts" | "type" | "cardId">): CardEvent {
  return { actor: "test", fromColumn: null, toColumn: null, payload: {}, ...partial };
}

test("a same-cell reorder changes the fold order but never the aging clock (ADR 019)", () => {
  const cards = [testCard({ id: "S001" }), testCard({ id: "S002" }), testCard({ id: "S003" })];
  // S003 dropped onto S001: inserted before it; same cell — clock untouched.
  const reorder = event({
    id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "moved", cardId: "S003",
    fromColumn: "col1", toColumn: "col1",
    payload: { fromLaneId: "laneA", laneId: "laneA", beforeId: "S001" },
  });
  const states = foldEvents(cards, [reorder]);
  assert.deepEqual(states.map((s) => s.id), ["S003", "S001", "S002"]);
  assert.equal(states[0]?.enteredColumnAt, testCard().createdAt, "reorder must not reset the clock");
});

test("a cross-cell move with beforeId repositions AND resets the clock", () => {
  const cards = [testCard({ id: "S001" }), testCard({ id: "S002", columnId: "col2" })];
  const move = event({
    id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "moved", cardId: "S001",
    fromColumn: "col1", toColumn: "col2",
    payload: { fromLaneId: "laneA", laneId: "laneA", beforeId: "S002" },
  });
  const states = foldEvents(cards, [move]);
  assert.deepEqual(states.map((s) => s.id), ["S001", "S002"]);
  assert.equal(states[0]?.columnId, "col2");
  assert.equal(states[0]?.enteredColumnAt, "2026-03-01T00:00:00.000Z");
});

test("a raced log stays consistent: a recorded reorder never moves the card nor resets its clock", () => {
  // Two intents validated against the same stale fold (the pre-serialization
  // race): a real move col1→col2, then a reorder RECORDED as col1→col1.
  const cards = [testCard({ id: "S001" }), testCard({ id: "S002" })];
  const states = foldEvents(cards, [
    event({
      id: "evt-1", ts: "2026-03-01T00:00:00.040Z", type: "moved", cardId: "S001",
      fromColumn: "col1", toColumn: "col2", payload: { fromLaneId: "laneA", laneId: "laneA" },
    }),
    event({
      id: "evt-2", ts: "2026-03-01T00:00:00.042Z", type: "moved", cardId: "S001",
      fromColumn: "col1", toColumn: "col1",
      payload: { fromLaneId: "laneA", laneId: "laneA", beforeId: "S002" },
    }),
  ]);
  // The recorded reorder is classified by its RECORD (like history/metrics):
  // the card stays in col2 with the real move's clock — no split-brain.
  assert.equal(states[0]?.id, "S001"); // reordered before S002 in the global order
  assert.equal(states[0]?.columnId, "col2");
  assert.equal(states[0]?.enteredColumnAt, "2026-03-01T00:00:00.040Z");
});

test("a beforeId naming a deleted card is an unknown target: order unchanged, no ghost slot", () => {
  const cards = [testCard({ id: "S001" }), testCard({ id: "S002" }), testCard({ id: "S003" })];
  const states = foldEvents(cards, [
    event({ id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "deleted", cardId: "S001" }),
    event({
      id: "evt-2", ts: "2026-03-02T00:00:00.000Z", type: "moved", cardId: "S003",
      fromColumn: "col1", toColumn: "col1",
      payload: { fromLaneId: "laneA", laneId: "laneA", beforeId: "S001" },
    }),
  ]);
  assert.deepEqual(states.map((s) => s.id), ["S002", "S003"]);
});

test("an unknown or self beforeId leaves the fold order unchanged", () => {
  const cards = [testCard({ id: "S001" }), testCard({ id: "S002" })];
  const cases = [
    { beforeId: "GHOST" },
    { beforeId: "S002" }, // self
  ];
  for (const { beforeId } of cases) {
    const states = foldEvents(cards, [event({
      id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "moved", cardId: "S002",
      fromColumn: "col1", toColumn: "col1",
      payload: { fromLaneId: "laneA", laneId: "laneA", beforeId },
    })]);
    assert.deepEqual(states.map((s) => s.id), ["S001", "S002"], beforeId);
  }
});
