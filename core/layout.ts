// Radiator layout arithmetic — the one-screen acceptance criterion as code.
// The UI reads these constants (single source of truth for the CSS custom
// properties), and the acceptance test checks the fixture portfolio fits
// a 1920x1080 viewport with zero scrolling in radiator mode.

import type { BoardConfig, CardState } from "./types.ts";
import { cellCards } from "./board.ts";

/** Pixel constants shared between the CSS and the acceptance test. */
export const LAYOUT = {
  /** App header bar. */
  headerHeight: 44,
  /** Keyboard hints footer. */
  footerHeight: 22,
  /** Column header row of the grid. */
  columnHeadHeight: 38,
  /** One radiator bar. */
  radiatorBarHeight: 16,
  /** Vertical gap between radiator bars. */
  radiatorGap: 2,
  /** Cell padding (top + bottom) plus the per-cell count strip. */
  cellOverhead: 18,
  /** 1px grid lines between rows. */
  gridGap: 1,
} as const;

/**
 * Height in pixels one lane needs in radiator mode: its fullest cell
 * decides, since cells of a lane share the row.
 * Inputs: all card states, the lane id, the board config.
 * Output: required pixel height of the lane row. Failure: none.
 */
export function laneRequiredHeight(cards: CardState[], laneId: string, config: BoardConfig): number {
  let maxCount = 0;
  for (const column of config.columns) {
    const count = cellCards(cards, laneId, column.id).length;
    if (count > maxCount) maxCount = count;
  }
  const stack = maxCount * (LAYOUT.radiatorBarHeight + LAYOUT.radiatorGap);
  return LAYOUT.cellOverhead + stack;
}

/**
 * Total pixel height the whole board needs in radiator mode. The CSS grid
 * gives every expanded lane an EQUAL share (1fr rows), so the binding
 * constraint is laneCount x the tallest lane — not the sum of lanes.
 * Inputs: all card states, the board config.
 * Output: required viewport height in pixels. Failure: none.
 */
export function boardRequiredHeight(cards: CardState[], config: BoardConfig): number {
  let tallest = 0;
  for (const lane of config.lanes) {
    tallest = Math.max(tallest, laneRequiredHeight(cards, lane.id, config));
  }
  const lanes = config.lanes.length * (tallest + LAYOUT.gridGap);
  return LAYOUT.headerHeight + LAYOUT.columnHeadHeight + lanes + LAYOUT.footerHeight;
}

/**
 * The hard acceptance criterion: at the given viewport height, the whole
 * portfolio is visible in radiator mode with zero scrolling.
 * Inputs: all card states, the board config, viewport height (default 1080).
 * Output: true when everything fits. Failure: none.
 */
export function fitsOneScreen(cards: CardState[], config: BoardConfig, viewportHeight = 1080): boolean {
  return boardRequiredHeight(cards, config) <= viewportHeight;
}
