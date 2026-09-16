// Time per stage: current occupants and their average age, completed stays
// and their average length, from the position events alone.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent, CardState } from "./types.ts";
import { stageDwell } from "./stage-dwell.ts";
import { testCard, testConfig } from "./test-helpers.ts";

const CONFIG = testConfig();
const [C1, C2, C3] = CONFIG.columns.map((c) => c.id) as [string, string, string];
const NOW = new Date("2026-03-01T00:00:00.000Z");

function state(id: string, columnId: string, enteredColumnAt: string): CardState {
  return {
    ...testCard({ id, columnId }), enteredColumnAt, comments: [], archived: false, decisions: [], absentFromLastImport: null,
  };
}

function ev(id: string, cardId: string, ts: string, type: CardEvent["type"], toColumn: string, extra: Partial<CardEvent> = {}): CardEvent {
  return { id, ts, actor: "t", cardId, type, fromColumn: null, toColumn, payload: { laneId: "l1" }, ...extra };
}

test("stageDwell: current occupants average their age; completed stays average their length; reorders and lane changes do not end a stay", () => {
  const cards = [state("A", C2, "2026-02-20T00:00:00.000Z"), state("B", C2, "2026-02-10T00:00:00.000Z"), state("C", C3, "2026-02-25T00:00:00.000Z")];
  const events: CardEvent[] = [
    ev("evt-1", "A", "2026-01-01T00:00:00.000Z", "created", C1),
    ev("evt-2", "A", "2026-01-11T00:00:00.000Z", "moved", C2, { fromColumn: C1 }), // 10 days in C1
    ev("evt-3", "B", "2026-01-01T00:00:00.000Z", "imported", C1),
    ev("evt-4", "B", "2026-01-05T00:00:00.000Z", "moved", C1, { fromColumn: C1, payload: { laneId: "l1", fromLaneId: "l1", beforeId: "A" } }), // reorder: ignored
    ev("evt-5", "B", "2026-01-08T00:00:00.000Z", "moved", C1, { fromColumn: C1, payload: { laneId: "l2", fromLaneId: "l1" } }), // lane change: the stay goes on
    ev("evt-6", "B", "2026-01-21T00:00:00.000Z", "moved", C2, { fromColumn: C1 }), // 20 days in C1
    ev("evt-7", "C", "2026-02-01T00:00:00.000Z", "created", C1),
    ev("evt-8", "C", "2026-02-04T00:00:00.000Z", "moved", C2, { fromColumn: C1 }), // 3 days in C1
    ev("evt-9", "C", "2026-02-25T00:00:00.000Z", "moved", C3, { fromColumn: C2 }), // 21 days in C2
    ev("evt-x", "ZZ", "2026-01-01T00:00:00.000Z", "created", C1), // another board's card: ignored
  ];
  const rows = stageDwell(cards, events, CONFIG, NOW);
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.deepEqual([byId.get(C1)?.current, byId.get(C1)?.currentAvgDays, byId.get(C1)?.pastStays, byId.get(C1)?.pastAvgDays], [0, null, 3, 11]);
  assert.deepEqual([byId.get(C2)?.current, byId.get(C2)?.currentAvgDays, byId.get(C2)?.pastStays, byId.get(C2)?.pastAvgDays], [2, 14, 1, 21]);

  assert.deepEqual([byId.get(C3)?.current, byId.get(C3)?.currentAvgDays, byId.get(C3)?.pastStays, byId.get(C3)?.pastAvgDays], [1, 4, 0, null]);
  assert.equal(rows.length, CONFIG.columns.length, "one row per configured column, in board order");
});

test("stageDwell: an empty board reads zeros and null averages", () => {
  for (const row of stageDwell([], [], CONFIG, NOW)) {
    assert.deepEqual([row.current, row.currentAvgDays, row.pastStays, row.pastAvgDays], [0, null, 0, null]);
  }
});
