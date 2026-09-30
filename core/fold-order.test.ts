// The read order of the log (fold-order.ts) and the fold over OLD log
// shapes: loads written before ADR 058 dated a card's `imported` event at
// its « Début », sometimes in the future. The card's birth is read first
// whatever its date, so the hand moves written after it apply now; the age
// never goes negative; restores (ADR 042) and reorders (ADR 019) are read
// as before; an `imported` written after other events of the card is not
// a birth and keeps its timestamp place.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { creationFirst, foldOrder, oldestFirst } from "./fold-order.ts";
import { foldEvents } from "./state.ts";
import { daysInColumn } from "./aging.ts";
import { flowTimes } from "./flow.ts";
import { stageDwell } from "./stage-dwell.ts";
import { testCard, testConfig } from "./test-helpers.ts";

const NOW = new Date("2026-09-30T09:00:00.000Z");
const FUTURE = "2026-11-02T00:00:00.000Z"; // a « Début » still to come

function event(partial: Partial<CardEvent> & Pick<CardEvent, "id" | "ts" | "type">): CardEvent {
  return { actor: "pmo", cardId: "S001", fromColumn: null, toColumn: null, payload: {}, ...partial };
}

const imported = (id: string, ts: string, cardId = "S001"): CardEvent =>
  event({ id, ts, type: "imported", cardId, actor: "import-csv", toColumn: "col1", payload: { laneId: "laneA" } });
const moved = (id: string, ts: string, from: string, to: string, cardId = "S001"): CardEvent =>
  event({ id, ts, type: "moved", cardId, fromColumn: from, toColumn: to, payload: { fromLaneId: "laneA", laneId: "laneA" } });

const ids = (events: CardEvent[]): string[] => events.map((e) => e.id);

test("foldOrder: timestamp order, each card's birth first whatever its date", () => {
  const cases: Array<{ name: string; events: CardEvent[]; order: string[] }> = [
    { name: "no birth in the future: plain timestamp order", order: ["evt-1", "evt-2", "evt-3"],
      events: [moved("evt-2", "2026-09-10T00:00:00.000Z", "col1", "col2"), imported("evt-1", "2026-09-01T00:00:00.000Z"),
        moved("evt-3", "2026-09-20T00:00:00.000Z", "col2", "col3")] },
    { name: "a future birth is hoisted before the card's first other event", order: ["evt-1", "evt-2", "evt-3"],
      events: [imported("evt-1", FUTURE), moved("evt-2", "2026-09-10T00:00:00.000Z", "col1", "col2"),
        event({ id: "evt-3", ts: "2026-09-20T00:00:00.000Z", type: "blocked" })] },
    { name: "another card's events keep their place", order: ["evt-3", "evt-1", "evt-2"],
      events: [imported("evt-1", FUTURE), moved("evt-2", "2026-09-10T00:00:00.000Z", "col1", "col2"),
        imported("evt-3", "2026-08-01T00:00:00.000Z", "S002")] },
    { name: "an imported written after the card's first event is no birth: timestamp order", order: ["evt-1", "evt-2"],
      events: [event({ id: "evt-1", ts: "2026-09-01T00:00:00.000Z", type: "unlisted" }), imported("evt-2", "2026-09-08T00:00:00.000Z")] },
    { name: "same instant: the log sequence decides (evt-10 after evt-9)", order: ["evt-9", "evt-10"],
      events: [moved("evt-10", "2026-09-10T00:00:00.000Z", "col2", "col3"), moved("evt-9", "2026-09-10T00:00:00.000Z", "col1", "col2")] },
  ];
  for (const c of cases) {
    assert.deepEqual(ids(foldOrder(c.events)), c.order, c.name);
    assert.deepEqual(ids(foldOrder(foldOrder(c.events))), c.order, `${c.name} (idempotent)`);
  }
});

test("creationFirst keeps a caller's own timestamp order and only moves the birth", () => {
  const sorted = [moved("evt-2", "2026-09-10T00:00:00.000Z", "col1", "col2"), imported("evt-1", FUTURE)].sort(oldestFirst);
  assert.deepEqual(ids(sorted), ["evt-2", "evt-1"]);
  assert.deepEqual(ids(creationFirst(sorted)), ["evt-1", "evt-2"]);
  assert.deepEqual(creationFirst([]), []);
});

test("old log: a future-dated import no longer hides the later hand moves", () => {
  const [state] = foldEvents([testCard({ createdAt: FUTURE })], [
    imported("evt-1", FUTURE), moved("evt-2", "2026-09-10T00:00:00.000Z", "col1", "col2"),
  ]);
  assert.deepEqual([state?.columnId, state?.enteredColumnAt], ["col2", "2026-09-10T00:00:00.000Z"]);
  assert.equal(daysInColumn(state!, NOW), 20);
});

test("old log without hand move: the card waits in its entry column, aged 0 (never negative)", () => {
  const [state] = foldEvents([testCard({ createdAt: FUTURE })], [imported("evt-1", FUTURE)]);
  assert.deepEqual([state?.columnId, state?.enteredColumnAt], ["col1", FUTURE]);
  assert.equal(daysInColumn(state!, NOW), 0);
});

test("old log: an absence recorded after the future-dated import is no longer cleared by it", () => {
  const [state] = foldEvents([testCard()], [
    imported("evt-1", FUTURE), event({ id: "evt-2", ts: "2026-09-15T00:00:00.000Z", type: "unlisted" }),
  ]);
  assert.equal(state?.absentFromLastImport, "2026-09-15T00:00:00.000Z");
});

test("old log + a restore (ADR 042): the undone move is not read, the birth still is", () => {
  const [state] = foldEvents([testCard()], [
    imported("evt-1", FUTURE), moved("evt-2", "2026-09-10T00:00:00.000Z", "col1", "col2"),
    event({ id: "evt-3", ts: "2026-09-12T00:00:00.000Z", type: "restored", cardId: "*", payload: { toSeq: 1 } }),
  ]);
  assert.deepEqual([state?.columnId, state?.enteredColumnAt], ["col1", FUTURE]);
});

test("old log + a reorder (ADR 019): the rank changes, the clock stays the move's", () => {
  const cards = [testCard({ id: "S002", columnId: "col2" }), testCard({ id: "S001" })];
  const reorder = event({
    id: "evt-4", ts: "2026-09-12T00:00:00.000Z", type: "moved", fromColumn: "col2", toColumn: "col2",
    payload: { fromLaneId: "laneA", laneId: "laneA", beforeId: "S002" },
  });
  const states = foldEvents(cards, [
    imported("evt-1", FUTURE), imported("evt-2", "2026-08-01T00:00:00.000Z", "S002"),
    moved("evt-3", "2026-09-10T00:00:00.000Z", "col1", "col2"), reorder,
  ]);
  assert.deepEqual(states.map((s) => s.id), ["S001", "S002"], "S001 dropped before S002");
  assert.deepEqual([states[0]?.columnId, states[0]?.enteredColumnAt], ["col2", "2026-09-10T00:00:00.000Z"]);
});

test("old log: Délais and the time per stage read the birth first too", () => {
  const config = testConfig();
  const log = [imported("evt-1", FUTURE), moved("evt-2", "2026-09-10T00:00:00.000Z", "col1", "col2")];
  const flow = flowTimes(log, "S001", config, NOW);
  assert.equal(flow.ageEntry, 0, "the entry is in the future: clamped, never negative");
  const board = foldEvents([testCard()], log);
  const dwell = stageDwell(board, log, config, NOW);
  assert.deepEqual(dwell.map((row) => [row.id, row.current, row.pastStays]), [["col1", 0, 0], ["col2", 1, 0], ["col3", 0, 0]]);
});
