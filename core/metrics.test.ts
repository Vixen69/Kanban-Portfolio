import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, CardEvent, CardState } from "./types.ts";
import { computeFlowMetrics, stageDurations } from "./metrics.ts";
import { testCard, testConfig } from "./test-helpers.ts";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const CONFIG = testConfig(); // col1, col2, col3 — col2 and col3 are terminal
const DAY_MS = 86_400_000;

function state(overrides: Parameters<typeof testCard>[0] = {}, daysHere = 1): CardState {
  return {
    ...testCard(overrides),
    enteredColumnAt: new Date(NOW.getTime() - daysHere * DAY_MS).toISOString(),
    comments: [],
  };
}

let seq = 0;
function entry(
  cardId: string,
  toColumn: string,
  ts: string,
  type: CardEvent["type"] = "moved",
  id?: string,
): CardEvent {
  return { id: id ?? `evt-${++seq}`, ts, actor: "test", cardId, type, fromColumn: null, toColumn, payload: {} };
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

test("stageDurations orders same-instant events by numeric id suffix, not lexicographically", () => {
  const ts = "2026-03-01T00:00:00.000Z";
  const events: CardEvent[] = [
    entry("S010", "col2", ts, "moved", "evt-10"), // second: 6-day stay in col2
    entry("S010", "col1", ts, "imported", "evt-9"), // first: 0-day stay in col1
    entry("S010", "col3", "2026-03-07T00:00:00.000Z", "moved", "evt-11"),
  ];
  const averages = stageDurations(events, CONFIG);
  assert.equal(averages["col2"], 6);
  assert.equal(averages["col1"], 0);
});

test("stageDurations ignores non-entry events, unknown columns, absurd spans", () => {
  const events: CardEvent[] = [
    // A blocked event between two entries must not split the stay.
    entry("S001", "col1", "2026-01-01T00:00:00.000Z", "created"),
    { ...entry("S001", "col1", "2026-01-03T00:00:00.000Z"), type: "blocked", toColumn: null },
    entry("S001", "col2", "2026-01-11T00:00:00.000Z"), // 10 days in col1
    // A >= 1000-day span is discarded as absurd.
    entry("S002", "col1", "2020-01-01T00:00:00.000Z", "created"),
    entry("S002", "col2", "2023-06-01T00:00:00.000Z"),
    // A stay in a column unknown to the config is dropped silently.
    entry("S003", "ghost", "2026-02-01T00:00:00.000Z", "created"),
    entry("S003", "col1", "2026-02-04T00:00:00.000Z"),
  ];
  const averages = stageDurations(events, CONFIG);
  assert.equal(averages["col1"], 10);
  assert.equal("ghost" in averages, false);
});

test("computeFlowMetrics: per-column counts and age buckets, lane loads, totals", () => {
  const cards: CardState[] = [
    state({ id: "A", columnId: "col1", laneId: "laneA", effortEstimated: 10, effortConsumed: 4 }, 2), // fresh
    state({ id: "B", columnId: "col1", laneId: "laneA", effortEstimated: 5, blocked: true, blockedSince: NOW.toISOString() }, 30), // aging
    state({ id: "C", columnId: "col1", laneId: "laneA" }, 70), // stale
    state({ id: "D", columnId: "col1", laneId: "laneA" }, 10), // recent
    state({ id: "E", columnId: "col2", laneId: "laneB", effortEstimated: 20, effortConsumed: 8 }, 5), // terminal
    state({ id: "F", columnId: "col3", laneId: "laneB" }, 70), // terminal AND stale
    state({ id: "G", columnId: "ghost", laneId: "ghost" }, 5), // unknown refs
  ];
  const metrics = computeFlowMetrics(cards, [], CONFIG, NOW);
  const col1 = metrics.perColumn["col1"];
  assert.deepEqual(
    { count: col1?.count, blocked: col1?.blocked, fresh: col1?.fresh, recent: col1?.recent, aging: col1?.aging, stale: col1?.stale },
    { count: 4, blocked: 1, fresh: 1, recent: 1, aging: 1, stale: 1 },
  );
  assert.equal(col1?.wip, null);
  assert.equal(metrics.perColumn["col2"]?.wip, 3);
  assert.deepEqual(metrics.totals, { total: 7, delivered: 2, blocked: 1, stale: 2 });
  assert.deepEqual(metrics.order, ["col1", "col2", "col3"]);
  const laneA = metrics.laneLoads["laneA"];
  assert.deepEqual({ est: laneA?.est, cons: laneA?.cons, count: laneA?.count }, { est: 15, cons: 4, count: 4 });
  const laneB = metrics.laneLoads["laneB"];
  assert.deepEqual({ est: laneB?.est, cons: laneB?.cons, count: laneB?.count }, { est: 20, cons: 8, count: 2 });
});

// A 5-column board: c1..c3 are in-flow, c4/c5 (last two) are terminal.
function wideConfig(): BoardConfig {
  const config = testConfig();
  config.columns = ["c1", "c2", "c3", "c4", "c5"].map((id) => ({
    id,
    name: id.toUpperCase(),
    wip: null,
    gate: null,
    note: "",
  }));
  return config;
}

function wideEvents(): CardEvent[] {
  return [
    entry("X1", "c1", "2026-01-01T00:00:00.000Z", "created"),
    entry("X1", "c2", "2026-01-11T00:00:00.000Z"), // c1 avg 10
    entry("X2", "c2", "2026-01-01T00:00:00.000Z", "created"),
    entry("X2", "c3", "2026-01-31T00:00:00.000Z"), // c2 avg 30
    entry("X3", "c3", "2026-01-01T00:00:00.000Z", "created"),
    entry("X3", "c4", "2026-01-06T00:00:00.000Z"), // c3 avg 5
    entry("X4", "c4", "2026-01-01T00:00:00.000Z", "created"),
    entry("X4", "c5", "2027-05-16T00:00:00.000Z"), // c4 avg 500 — terminal
  ];
}

test("bottleneck: highest avgStage x max(1, count) among NON-terminal columns", () => {
  const config = wideConfig();
  const cards: CardState[] = [
    ...Array.from({ length: 2 }, (_, i) => state({ id: `P${i}`, columnId: "c1" })),
    ...Array.from({ length: 10 }, (_, i) => state({ id: `Q${i}`, columnId: "c3" })),
    ...Array.from({ length: 5 }, (_, i) => state({ id: `R${i}`, columnId: "c4" })),
  ];
  const metrics = computeFlowMetrics(cards, wideEvents(), config, NOW);
  // Scores: c1 = 10x2 = 20, c2 = 30x1 = 30, c3 = 5x10 = 50; c4 (500x5) is terminal.
  assert.equal(metrics.bottleneck, "c3");
  assert.equal(metrics.avgStageDays["c4"], 500);
});

test("bottleneck ties resolve to the earliest column in board order", () => {
  const config = wideConfig();
  // Scores: c1 = 10x3 = 30, c2 = 30x1 = 30, c3 = 5x1 = 5 — tie between c1 and c2.
  const cards = Array.from({ length: 3 }, (_, i) => state({ id: `P${i}`, columnId: "c1" }));
  const metrics = computeFlowMetrics(cards, wideEvents(), config, NOW);
  assert.equal(metrics.bottleneck, "c1");
});

test("empty portfolio yields zeroed metrics; the first in-flow column wins the zero-score tie", () => {
  const metrics = computeFlowMetrics([], [], CONFIG, NOW);
  assert.deepEqual(metrics.totals, { total: 0, delivered: 0, blocked: 0, stale: 0 });
  assert.equal(metrics.perColumn["col1"]?.count, 0);
  assert.equal(metrics.bottleneck, "col1"); // design behavior: max over zeros
});

test("a board of only two columns is all-terminal: no bottleneck", () => {
  const config = testConfig();
  config.columns = config.columns.slice(0, 2);
  const metrics = computeFlowMetrics([], [], config, NOW);
  assert.equal(metrics.bottleneck, null);
});
