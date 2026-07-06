import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAYOUT,
  boardRequiredHeight,
  columnTemplate,
  fitsOneScreen,
  laneRequiredHeight,
  rowTemplate,
} from "./layout.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import type { BoardConfig, CardState, Column, Lane } from "./types.ts";

const CONFIG = testConfig();
const COLUMNS: Column[] = CONFIG.columns; // col1, col2, col3
const LANES: Lane[] = CONFIG.lanes; // laneA, laneB

function fill(laneId: string, columnId: string, count: number): CardState[] {
  return Array.from({ length: count }, (_, i) => ({
    ...testCard({ id: `${laneId}-${columnId}-${i}`, laneId, columnId }),
    enteredColumnAt: "2026-06-01T00:00:00.000Z",
    comments: [],
  }));
}

test("columnTemplate: no focus, no collapse — equal 1fr shares after the gutter", () => {
  assert.equal(columnTemplate(COLUMNS, null, new Set()), "var(--lane-w) 1fr 1fr 1fr");
});

test("columnTemplate: focus widens one column and shrinks the others", () => {
  assert.equal(columnTemplate(COLUMNS, "col2", new Set()), "var(--lane-w) 0.62fr 2.6fr 0.62fr");
});

test("columnTemplate: a collapsed column is a fixed 30px strip", () => {
  assert.equal(columnTemplate(COLUMNS, null, new Set(["col1"])), "var(--lane-w) 30px 1fr 1fr");
});

test("columnTemplate: collapse + focus combine; collapse wins on the focused column", () => {
  assert.equal(
    columnTemplate(COLUMNS, "col2", new Set(["col1"])),
    "var(--lane-w) 30px 2.6fr 0.62fr",
  );
  assert.equal(
    columnTemplate(COLUMNS, "col2", new Set(["col2"])),
    "var(--lane-w) 0.62fr 30px 0.62fr",
  );
});

test("rowTemplate: header row auto, expanded lanes 1fr, collapsed lanes 26px", () => {
  assert.equal(rowTemplate(LANES, new Set()), "auto 1fr 1fr");
  assert.equal(rowTemplate(LANES, new Set(["laneA"])), "auto 26px 1fr");
  assert.equal(rowTemplate(LANES, new Set(["laneA", "laneB"])), "auto 26px 26px");
});

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

// Board-shaped topology (3 lanes x 8 columns, like the v2 default config).
function boardShapedConfig(): BoardConfig {
  const config = testConfig();
  config.lanes = Array.from({ length: 3 }, (_, i) => ({
    id: `lane${i}`,
    name: `Lane ${i}`,
    nature: "",
    detail: "",
  }));
  config.columns = Array.from({ length: 8 }, (_, i) => ({
    id: `col${i}`,
    name: `Colonne ${i}`,
    wip: null,
    gate: null,
    note: "",
  }));
  return config;
}

test("150 cards at density 16 / gap 2 fit a 1080p viewport when spread over the board", () => {
  const config = boardShapedConfig();
  const cards: CardState[] = [];
  for (let i = 0; i < 150; i++) {
    // Round-robin over the 24 cells: fullest cell holds 7 cards.
    const laneId = `lane${i % 3}`;
    const columnId = `col${Math.floor(i / 3) % 8}`;
    cards.push(...fill(laneId, columnId, 1).map((card) => ({ ...card, id: `S${i}` })));
  }
  assert.equal(cards.length, 150);
  assert.equal(fitsOneScreen(cards, config), true);
});
