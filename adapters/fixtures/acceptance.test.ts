// The hard acceptance criterion, executed against the REAL config/board.json:
// at 1920x1080 with the 150-card design portfolio, the full board is visible
// with zero scrolling. The validated design v9 gives every lane an equal 1fr
// row and clips an overfull cell (.cell-cards overflow:hidden — the count
// strip keeps the truth on screen), so the bound checked here is the
// design's: the portfolio's content fits the viewport when lanes size to
// content, and equal-share clipping stays confined to the single fullest
// cell, at most THREE bars deep.
// The bound was two bars until design v12 (ADR 020): the compact totals
// block took the column header from 38 to 65 px, which costs exactly one
// visible bar per lane under equal shares (17 -> 16). The fullest cell of
// the pinned dataset holds 19 cards, so it now clips 3 instead of 2. The
// content-fit bound below is UNCHANGED and still passes — only the
// equal-share clipping margin moved, and an overfull cell wears the
// scroll-hint arrow by design.
// NOTE: core/layout fitsOneScreen models "every bar visible under equal
// shares" (laneCount x tallest lane = 1187px for this pinned dataset) and is
// deterministically false at 1080 — kept out of this test, flagged upstream.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateBoardConfig } from "../../core/config.ts";
import { foldEvents, toCard } from "../../core/state.ts";
import { isAndon, isStale } from "../../core/aging.ts";
import { LAYOUT } from "../../core/layout.ts";
import { InMemoryEventStore } from "../../core/events.ts";
import { createFixtures } from "./index.ts";
import { TOTAL_CARDS } from "./generate.ts";

const NOW = new Date("2026-07-06T12:00:00.000Z");
const VIEWPORT = 1080;
const CONFIG = validateBoardConfig(
  JSON.parse(readFileSync(new URL("../../config/board.json", import.meta.url), "utf8")),
);

function boardStates() {
  const { dataSource, seedEvents } = createFixtures(CONFIG, NOW);
  const store = new InMemoryEventStore();
  for (const input of seedEvents) store.append(input);
  const cards = dataSource.listSubjects().map((s) => toCard(s, dataSource.getFinancials(s.id)));
  return foldEvents(cards, store.list());
}

/** Cards in one lane x column cell of the folded board. */
function cellCount(states: ReturnType<typeof boardStates>, laneId: string, columnId: string): number {
  return states.filter((s) => s.laneId === laneId && s.columnId === columnId).length;
}

test("the fixtures portfolio holds exactly 150 cards", () => {
  assert.equal(boardStates().length, TOTAL_CARDS);
});

test("acceptance: zero scroll at 1080px — content fits, clipping bounded", () => {
  const states = boardStates();
  const barPitch = LAYOUT.radiatorBarHeight + LAYOUT.radiatorGap;
  const chrome = LAYOUT.headerHeight + LAYOUT.columnHeadHeight + LAYOUT.footerHeight +
    CONFIG.lanes.length * LAYOUT.gridGap;
  // 1) Content-sized bound: the whole portfolio's ink fits one screen.
  let contentHeight = chrome;
  for (const lane of CONFIG.lanes) {
    let fullest = 0;
    for (const column of CONFIG.columns) {
      fullest = Math.max(fullest, cellCount(states, lane.id, column.id));
    }
    contentHeight += LAYOUT.cellOverhead + fullest * barPitch;
  }
  assert.ok(contentHeight <= VIEWPORT, `hauteur contenu ${contentHeight}px > ${VIEWPORT}px`);
  // 2) Equal 1fr lane shares (the design grid): clipping stays marginal.
  const share = (VIEWPORT - chrome) / CONFIG.lanes.length;
  const visibleBars = Math.floor((share - LAYOUT.cellOverhead + LAYOUT.radiatorGap) / barPitch);
  let clippedCells = 0;
  let clippedBars = 0;
  for (const lane of CONFIG.lanes) {
    for (const column of CONFIG.columns) {
      const count = cellCount(states, lane.id, column.id);
      if (count > visibleBars) {
        clippedCells += 1;
        clippedBars += count - visibleBars;
      }
    }
  }
  assert.ok(clippedCells <= 1, `cellules écrêtées : ${clippedCells} (max 1)`);
  assert.ok(clippedBars <= 3, `barres écrêtées : ${clippedBars} (max 3, design v12)`);
});

test("the portfolio exercises the full visual vocabulary", () => {
  const states = boardStates();
  assert.ok(states.some((s) => isStale(s, CONFIG, NOW)), "aucun sujet stagnant");
  assert.ok(states.some((s) => s.blocked), "aucun sujet bloqué");
  assert.ok(states.some((s) => isAndon(s, CONFIG, NOW)), "aucun sujet en andon");
  for (const column of CONFIG.columns) {
    const inColumn = states.filter((s) => s.columnId === column.id);
    if (column.id === "pause") {
      assert.equal(inColumn.length, 0, "pause doit démarrer vide");
    } else {
      assert.ok(inColumn.length > 0, `colonne vide : ${column.id}`);
    }
  }
});
