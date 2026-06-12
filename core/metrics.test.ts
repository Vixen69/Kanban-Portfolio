import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent, CardState } from "./types.ts";
import { computeFlowMetrics, stageDurations } from "./metrics.ts";
import { testCard, testConfig } from "./test-helpers.ts";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const CONFIG = testConfig(); // col1, col2, col3 — col2 and col3 are terminal

function state(overrides: Parameters<typeof testCard>[0] = {}, daysHere = 1): CardState {
  return {
    ...testCard(overrides),
    enteredColumnAt: new Date(NOW.getTime() - daysHere * 86_400_000).toISOString(),
  };
}

function entry(cardId: string, toColumn: string, ts: string, type: CardEvent["type"] = "moved"): CardEvent {
  return { id: `evt-${cardId}-${ts}`, ts, actor: "test", cardId, type, fromColumn: null, toColumn, payload: {} };
}

test("stageDurations averages completed stays per column", () => {
  const events: CardEvent[] = [
    entry("S001", "col1", "2026-01-01T00:00:00.000Z", "created"),
    entry("S001", "col2", "2026-01-11T00:00:00.000Z"), // 10 days in col1
    entry("S001", "col3", "2026-01-15T00:00:00.000Z"), // 4 days in col2
    entry("S002", "col1", "2026-02-01T00:00:00.000Z", "created"),
    entry("S002", "col2", "2026-02-21T00:00:00.000Z"), // 20 days in col1
  ];
  const averages = stageDurations(events, CONFIG);
  assert.equal(averages["col1"], 15); // (10 + 20) / 2
  assert.equal(averages["col2"], 4);
  assert.equal(averages["col3"], 0); // open stay, never closed
});

test("stageDurations ignores blocked events, unknown columns, absurd spans", () => {
  const events: CardEvent[] = [
    entry("S001", "col1", "2026-01-01T00:00:00.000Z", "created"),
    { ...entry("S001", "col1", "2026-01-02T00:00:00.000Z"), type: "blocked", toColumn: null },
    entry("S001", "col2", "2030-01-01T00:00:00.000Z"), // > 1000 days, discarded
  ];
  const averages = stageDurations(events, CONFIG);
  assert.equal(averages["col1"], 0);
});

test("computeFlowMetrics: counts, buckets, totals, bottleneck", () => {
  const cards = [
    state({ id: "S001", columnId: "col1" }, 2), // step 0
    state({ id: "S002", columnId: "col1", blocked: true, blockedSince: NOW.toISOString() }, 30), // step 2
    state({ id: "S003", columnId: "col2" }, 120), // stale, terminal
    state({ id: "S004", columnId: "col3" }, 5),
  ];
  const events: CardEvent[] = [
    entry("S001", "col1", "2026-05-01T00:00:00.000Z", "created"),
    entry("S001", "col2", "2026-05-21T00:00:00.000Z"), // 20 days in col1
  ];
  const metrics = computeFlowMetrics(cards, events, CONFIG, NOW);
  const col1 = metrics.perColumn[0];
  assert.equal(col1?.count, 2);
  assert.equal(col1?.blocked, 1);
  assert.deepEqual(col1?.ageBuckets, [1, 0, 1, 0, 0]);
  assert.deepEqual(metrics.totals, { total: 4, delivered: 2, blocked: 1, stale: 1 });
  // col1 is the only non-terminal column with a positive score.
  assert.equal(metrics.bottleneckColumnId, "col1");
  assert.equal(metrics.laneLoads.length, 2);
});

test("empty portfolio yields zeroed metrics and no bottleneck", () => {
  const metrics = computeFlowMetrics([], [], CONFIG, NOW);
  assert.deepEqual(metrics.totals, { total: 0, delivered: 0, blocked: 0, stale: 0 });
  assert.equal(metrics.bottleneckColumnId, null);
  assert.equal(metrics.perColumn.length, 3);
});
