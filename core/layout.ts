// Board layout arithmetic — the CSS grid templates (focus / collapse) and
// the one-screen acceptance criterion as code. The UI reads these values
// (single source of truth for the grid styles), and the acceptance test
// checks the fixture portfolio fits a 1920x1080 viewport with zero
// scrolling.

import type { BoardConfig, CardState, Column, Lane } from "./types.ts";
import { cellCards } from "./board.ts";

/** Pixel constants shared between the CSS and the acceptance test. */
export const LAYOUT = {
  /** App header bar. */
  headerHeight: 44,
  /** Bottom margin kept free (former hints footer; now a safety margin). */
  footerHeight: 22,
  /** Column header row of the grid. */
  columnHeadHeight: 38,
  /** One mini card bar (the static --card-h of the design). */
  radiatorBarHeight: 16,
  /** Vertical gap between mini card bars. */
  radiatorGap: 2,
  /** Cell padding (top + bottom) plus the per-cell count strip. */
  cellOverhead: 18,
  /** 1px grid lines between rows. */
  gridGap: 1,
} as const;

/**
 * CSS grid-template-columns for the board: the lane-label gutter followed
 * by one weight per column. A collapsed column is a fixed 30px strip; the
 * focused column takes 2.6fr while the other expanded columns shrink to
 * 0.62fr; with no focus every expanded column gets 1fr. Collapse wins
 * over focus.
 * Inputs: columns in board order, the focused column id (or null), the
 * set of collapsed column ids.
 * Output: the grid-template-columns string. Failure: none.
 */
export function columnTemplate(
  columns: Column[],
  focusedColumnId: string | null,
  collapsedColumnIds: ReadonlySet<string>,
): string {
  const weights = columns.map((column) =>
    collapsedColumnIds.has(column.id)
      ? "30px"
      : column.id === focusedColumnId
        ? "2.6fr"
        : focusedColumnId !== null
          ? "0.62fr"
          : "1fr",
  );
  return `var(--lane-w) ${weights.join(" ")}`;
}

/**
 * CSS grid-template-rows for the board: "auto" for the column-header row,
 * then one weight per lane — a fixed 26px strip for a collapsed lane,
 * an equal 1fr share otherwise.
 * Inputs: lanes in board order, the set of collapsed lane ids.
 * Output: the grid-template-rows string. Failure: none.
 */
export function rowTemplate(lanes: Lane[], collapsedLaneIds: ReadonlySet<string>): string {
  const weights = lanes.map((lane) => (collapsedLaneIds.has(lane.id) ? "26px" : "1fr"));
  return ["auto", ...weights].join(" ");
}

/**
 * Height in pixels one lane needs to stack its mini cards: its fullest
 * cell decides, since cells of a lane share the row.
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
 * Total pixel height the whole board needs with every lane expanded. The
 * CSS grid gives every expanded lane an EQUAL share (1fr rows), so the
 * binding constraint is laneCount x the tallest lane — not the sum of
 * lanes.
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
 * portfolio is visible with zero scrolling.
 * Inputs: all card states, the board config, viewport height (default 1080).
 * Output: true when everything fits. Failure: none.
 */
export function fitsOneScreen(cards: CardState[], config: BoardConfig, viewportHeight = 1080): boolean {
  return boardRequiredHeight(cards, config) <= viewportHeight;
}
