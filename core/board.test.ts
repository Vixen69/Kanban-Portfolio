import { test } from "node:test";
import assert from "node:assert/strict";
import { cellCards, cellSummary, portfolioStats, wipDisplay, wipState } from "./board.ts";
import type { WipState } from "./board.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import type { CardState } from "./types.ts";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const CONFIG = testConfig(); // age.agingMaxDays = 60

function state(overrides: Parameters<typeof testCard>[0] = {}, daysHere = 1): CardState {
  return {
    ...testCard(overrides),
    enteredColumnAt: new Date(NOW.getTime() - daysHere * 86_400_000).toISOString(),
    comments: [],
    archived: false,
  };
}

test("cellCards filters by lane and column, keeps order", () => {
  const cards = [
    state({ id: "S001", laneId: "laneA", columnId: "col1" }),
    state({ id: "S002", laneId: "laneB", columnId: "col1" }),
    state({ id: "S003", laneId: "laneA", columnId: "col1" }),
  ];
  assert.deepEqual(cellCards(cards, "laneA", "col1").map((c) => c.id), ["S001", "S003"]);
  assert.deepEqual(cellCards(cards, "laneA", "col2"), []);
});

test("wipState: na without limit, warn from 0.8, over strictly above 1 (table)", () => {
  const cases: [number, number | null, WipState][] = [
    [0, null, "na"],
    [12, null, "na"],
    [0, 6, "ok"],
    [79, 100, "ok"], // ratio 0.79
    [80, 100, "warn"], // ratio 0.80
    [100, 100, "warn"], // ratio 1.00 — full but not over
    [101, 100, "over"], // ratio 1.01
    [5, 6, "warn"], // ratio ~0.83
    [7, 6, "over"],
  ];
  for (const [count, wip, expected] of cases) {
    assert.equal(wipState(count, wip), expected, `${count}/${wip ?? "∅"}`);
  }
});

test("wipDisplay: 'n/limit' with a limit, plain 'n' without", () => {
  assert.equal(wipDisplay(3, 6), "3/6");
  assert.equal(wipDisplay(7, 6), "7/6");
  assert.equal(wipDisplay(4, null), "4");
  assert.equal(wipDisplay(0, null), "0");
});

test("cellSummary counts total, blocked and stale over a mixed cell", () => {
  const cards = [
    state({ id: "S001" }, 2), // fresh, unblocked
    state({ id: "S002", blocked: true, blockedSince: NOW.toISOString() }, 3), // blocked only
    state({ id: "S003" }, 120), // stale only (> 60d)
    state({ id: "S004", blocked: true, blockedSince: NOW.toISOString() }, 200), // blocked AND stale
    state({ id: "S005", laneId: "laneB" }, 300), // other cell — ignored
  ];
  const summary = cellSummary(cards, "laneA", "col1", CONFIG, NOW);
  assert.equal(summary.count, 4);
  assert.equal(summary.blockedCount, 2);
  assert.equal(summary.staleCount, 2);
});

test("cellSummary of an empty cell is all zeroes", () => {
  assert.deepEqual(cellSummary([], "laneA", "col1", CONFIG, NOW), {
    count: 0,
    blockedCount: 0,
    staleCount: 0,
  });
});

test("portfolioStats counts total and blocked", () => {
  const cards = [state(), state({ id: "S002", blocked: true })];
  assert.deepEqual(portfolioStats(cards), { total: 2, blocked: 1 });
});
