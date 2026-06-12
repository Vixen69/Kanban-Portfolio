import { test } from "node:test";
import assert from "node:assert/strict";
import { cellCards, cellSummary, neighbourCell, portfolioStats, wipStatus } from "./board.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import type { CardState } from "./types.ts";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const CONFIG = testConfig();

function state(overrides: Parameters<typeof testCard>[0] = {}, daysHere = 1): CardState {
  return { ...testCard(overrides), enteredColumnAt: new Date(NOW.getTime() - daysHere * 86_400_000).toISOString() };
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

test("wipStatus without limit reads 'non defini' and never warns", () => {
  const cards = [state({ columnId: "col1" }), state({ id: "S002", columnId: "col1" })];
  const status = wipStatus(cards, "col1", null);
  assert.equal(status.display, "2 / non defini");
  assert.equal(status.exceeded, false);
});

test("wipStatus with a limit shows count/limit and warns only above it", () => {
  const cards = (n: number) => Array.from({ length: n }, (_, i) => state({ id: `S${i}`, columnId: "col2" }));
  assert.equal(wipStatus(cards(3), "col2", 3).display, "3/3");
  assert.equal(wipStatus(cards(3), "col2", 3).exceeded, false);
  assert.equal(wipStatus(cards(4), "col2", 3).exceeded, true);
});

test("cellSummary counts total, blocked and stale", () => {
  const cards = [
    state({ id: "S001" }, 2),
    state({ id: "S002", blocked: true, blockedSince: NOW.toISOString() }, 3),
    state({ id: "S003" }, 120),
  ];
  const summary = cellSummary(cards, "laneA", "col1", CONFIG, NOW);
  assert.equal(summary.count, 3);
  assert.equal(summary.blockedCount, 1);
  assert.equal(summary.staleCount, 1);
});

test("portfolioStats counts total and blocked", () => {
  const cards = [state(), state({ id: "S002", blocked: true })];
  assert.deepEqual(portfolioStats(cards), { total: 2, blocked: 1 });
});

test("neighbourCell navigates the grid and stops at the edges (table)", () => {
  const cases: [string, string, "left" | "right" | "up" | "down", { laneId: string; columnId: string } | null][] = [
    ["laneA", "col1", "right", { laneId: "laneA", columnId: "col2" }],
    ["laneA", "col2", "left", { laneId: "laneA", columnId: "col1" }],
    ["laneA", "col1", "down", { laneId: "laneB", columnId: "col1" }],
    ["laneB", "col1", "up", { laneId: "laneA", columnId: "col1" }],
    ["laneA", "col1", "left", null],
    ["laneA", "col1", "up", null],
    ["laneB", "col3", "right", null],
    ["laneB", "col3", "down", null],
  ];
  for (const [laneId, columnId, direction, expected] of cases) {
    assert.deepEqual(neighbourCell(CONFIG, laneId, columnId, direction), expected, `${laneId}/${columnId} ${direction}`);
  }
  assert.equal(neighbourCell(CONFIG, "ghost", "col1", "right"), null);
  assert.equal(neighbourCell(CONFIG, "laneA", "ghost", "right"), null);
});
