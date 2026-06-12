import { test } from "node:test";
import assert from "node:assert/strict";
import { LAYOUT, boardRequiredHeight, fitsOneScreen, laneRequiredHeight } from "./layout.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import type { CardState } from "./types.ts";

const CONFIG = testConfig();

function fill(laneId: string, columnId: string, count: number): CardState[] {
  return Array.from({ length: count }, (_, i) => ({
    ...testCard({ id: `${laneId}-${columnId}-${i}`, laneId, columnId }),
    enteredColumnAt: "2026-06-01T00:00:00.000Z",
  }));
}

test("laneRequiredHeight is driven by the fullest cell of the lane", () => {
  const cards = [...fill("laneA", "col1", 2), ...fill("laneA", "col2", 7), ...fill("laneA", "col3", 1)];
  const expected = LAYOUT.cellOverhead + 7 * (LAYOUT.radiatorBarHeight + LAYOUT.radiatorGap);
  assert.equal(laneRequiredHeight(cards, "laneA", CONFIG), expected);
});

test("an empty lane still needs its overhead", () => {
  assert.equal(laneRequiredHeight([], "laneA", CONFIG), LAYOUT.cellOverhead);
});

test("boardRequiredHeight: equal 1fr rows make the tallest lane binding", () => {
  const cards = [...fill("laneA", "col1", 3), ...fill("laneB", "col2", 5)];
  const laneA = laneRequiredHeight(cards, "laneA", CONFIG);
  const laneB = laneRequiredHeight(cards, "laneB", CONFIG);
  const tallest = Math.max(laneA, laneB);
  const expected =
    LAYOUT.headerHeight +
    LAYOUT.columnHeadHeight +
    2 * (tallest + LAYOUT.gridGap) +
    LAYOUT.footerHeight;
  assert.equal(boardRequiredHeight(cards, CONFIG), expected);
  // The sum of unequal lanes UNDERSTATES what equal rows need; the formula
  // must charge every lane at the tallest lane's height.
  assert.ok(boardRequiredHeight(cards, CONFIG) >= laneA + laneB);
});

test("fitsOneScreen is a strict comparison against the viewport", () => {
  const cards = fill("laneA", "col1", 5);
  const required = boardRequiredHeight(cards, CONFIG);
  assert.equal(fitsOneScreen(cards, CONFIG, required), true);
  assert.equal(fitsOneScreen(cards, CONFIG, required - 1), false);
});
