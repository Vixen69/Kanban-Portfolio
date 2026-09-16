// Board layout arithmetic — the CSS grid templates (focus / collapse) and
// the one-screen acceptance criterion as code. The UI reads these values
// (single source of truth for the grid styles), and the acceptance test
// checks the fixture portfolio fits a 1920x1080 viewport with zero
// scrolling.

import type { BoardConfig, CardState, Column, Lane } from "./types.ts";
import { cellCards } from "./board.ts";
import { resolveFlowAnchors } from "./flow.ts";

/**
 * The lane marker of a drop into a unified cell (ADR 039): the card keeps
 * its own canal — before the RDO a project has none to show.
 */
export const UNIFIED_LANE = "*";

/**
 * The columns shown WITHOUT canals (ADR 039, author 2026-09-16): before the
 * RDO a project is neither small nor complex, so the intake columns up to
 * and including the qualification stage are one cell tall as the board;
 * the canals start right after. Derived from the flow anchors (the RDO
 * column), never hardcoded — an admin may rename or move the stage.
 * Inputs: the board config. Output: the unified column ids, in board order
 * (empty when no qualification stage resolves, or when it is the last
 * column — nothing would be left for the canals). Failure: none.
 */
export function unifiedColumnIds(config: BoardConfig): Set<string> {
  const anchors = resolveFlowAnchors(config);
  const qualification = anchors?.qualification ?? null;
  if (qualification === null) return new Set();
  const index = config.columns.findIndex((column) => column.id === qualification.id);
  if (index < 0 || index >= config.columns.length - 1) return new Set();
  return new Set(config.columns.slice(0, index + 1).map((column) => column.id));
}

/** Pixel constants shared between the CSS and the acceptance test. */
export const LAYOUT = {
  /** App header bar. */
  headerHeight: 44,
  /** Bottom margin kept free (former hints footer; now a safety margin). */
  footerHeight: 22,
  /**
   * Column header row of the grid, measured in the COMPACT default state
   * (title + gate + the two-figure totals block of design v12). Unfolding
   * the totals takes it to ~230px — a deliberate zoom that may scroll, and
   * NOT the state the one-screen criterion is measured in (ADR 020).
   */
  columnHeadHeight: 65,
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
 * The two widths of the lane-label gutter (design v12). Compact is the
 * vertical strip; expanded turns the label horizontal to hold the per-canal
 * totals. The one-screen acceptance criterion is measured in the COMPACT
 * default state — unfolding the totals is a deliberate zoom-in that may
 * scroll (author's decision, ADR 020).
 */
export const LANE_GUTTER = {
  compact: "var(--lane-w)",
  expanded: "176px",
} as const;

/**
 * CSS grid-template-columns for the board. Without unified columns: the
 * lane-label gutter followed by one weight per column. With them (ADR
 * 039): the board-totals gutter, the unified columns, then the lane
 * gutter and the canal columns. A collapsed column is a fixed 30px strip;
 * the focused column takes 2.6fr while the other expanded columns shrink
 * to 0.62fr; with no focus every expanded column gets 1fr. Collapse wins
 * over focus.
 * Inputs: columns in board order, the focused column id (or null), the
 * set of collapsed column ids, the lane gutter width (the default
 * `var(--lane-w)` narrow strip, widened when the per-canal totals are
 * unfolded — design v12), the unified column ids and the board gutter
 * width (widened when the per-column totals are unfolded).
 * Output: the grid-template-columns string. Failure: none.
 */
export function columnTemplate(
  columns: Column[],
  focusedColumnId: string | null,
  collapsedColumnIds: ReadonlySet<string>,
  laneWidth: string = LANE_GUTTER.compact,
  unified: ReadonlySet<string> = new Set(),
  boardWidth: string = LANE_GUTTER.compact,
): string {
  const weight = (column: Column): string =>
    collapsedColumnIds.has(column.id)
      ? "30px"
      : column.id === focusedColumnId
        ? "2.6fr"
        : focusedColumnId !== null
          ? "0.62fr"
          : "1fr";
  if (unified.size === 0) return `${laneWidth} ${columns.map(weight).join(" ")}`;
  const head = columns.filter((column) => unified.has(column.id)).map(weight);
  const tail = columns.filter((column) => !unified.has(column.id)).map(weight);
  return `${boardWidth} ${head.join(" ")} ${laneWidth} ${tail.join(" ")}`;
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
