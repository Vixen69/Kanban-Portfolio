// The aggregates the board wears (design v12, ADR 039, ADR 048): per
// column, per canal, board-wide, and the reste à faire split by column
// class on the counted métiers. Every figure is the sum of per-card,
// per-métier values, so the gutter is exactly the sum of the headers.
// Recomputed when the cards, the filters or the lens change — never on
// the one-minute tick: the totals carry no time-dependent figure.

import { useMemo } from "react";
import type { BoardConfig, CardState } from "../core/types.ts";
import { columnClasses, type ColumnClass } from "../core/column-class.ts";
import { lensRows, rafSplit, type LensRow, type RafSplit } from "../core/raf.ts";
import { columnTotals, laneTotals, sumTotals, type GroupTotals } from "../core/totals.ts";
import { useFrozenOrder, type BoardLens } from "./useRafLens.ts";

/** Everything the grid, its headers and its gutters read. */
export interface BoardTotals {
  byColumn: Record<string, GroupTotals>;
  /** Canal totals, canal columns only (ADR 039) — the money. */
  byLane: Record<string, GroupTotals>;
  /** The same without the out-of-count columns (Terminé and after) — the canal's reste à faire. */
  byLaneRaf: Record<string, GroupTotals>;
  /** The whole board shown: the sum of the column aggregates. */
  board: GroupTotals;
  classes: Record<string, ColumnClass>;
  /** The reste à faire of the counted métiers, class by class (the « sans ventilation » counts without the lens's own filtering). */
  split: RafSplit;
  /** Every métier with its engaged / non-engaged reste à faire (the lens list), in a stable order while the lens is on. */
  rows: LensRow[];
}

/** The two hidden sets the totals read (ADR 048). */
export interface HiddenSets {
  /** What the board hides: the sidebar filters and the métier lens. */
  shown: Set<string>;
  /** What the sidebar filters alone hide: the lens list and its notes read the board this way. */
  lensBase: Set<string>;
}

/**
 * The board's aggregates over the VISIBLE cards. The métier list and the
 * split read the board as the sidebar filters leave it — the lens's own
 * filtering aside, so an unchecked métier still shows its whole reste à
 * faire and a card without plan is still counted in the note; the RAF of
 * the counted métiers is the same either way (the lens hides only cards
 * with none).
 * Inputs: the folded cards, the hidden sets, the config, the unified
 * (canal-less) column ids, the lens (its counted métiers; while it is on,
 * the métier rows keep their order — held here, in the always-mounted
 * grid, so folding the gutter never loses it).
 * Output: the BoardTotals. Failure: none.
 */
export function useBoardTotals(
  cards: CardState[], hidden: HiddenSets, config: BoardConfig, unified: Set<string>, lens: BoardLens,
): BoardTotals {
  const classes = useMemo(() => columnClasses(config), [config]);
  const byColumn = useColumnTotals(cards, hidden.shown, config);
  const base = useColumnTotals(cards, hidden.lensBase, config);
  const lanes = useMemo(() => {
    const inCanal = cards.filter((card) => !unified.has(card.columnId));
    const counting = inCanal.filter((card) => classes[card.columnId] !== "excluded");
    return { money: laneTotals(inCanal, hidden.shown, config), raf: laneTotals(counting, hidden.shown, config) };
  }, [cards, hidden.shown, config, unified, classes]);
  const board = useMemo(() => sumTotals(Object.values(byColumn)), [byColumn]);
  const split = useMemo(() => rafSplit(base, classes, lens.counted), [base, classes, lens.counted]);
  const rows = useFrozenOrder(useMemo(() => lensRows(base, classes, config), [base, classes, config]), lens.active);
  return { byColumn, byLane: lanes.money, byLaneRaf: lanes.raf, board, classes, split, rows };
}

// The per-column aggregates of the cards a hidden set leaves visible.
function useColumnTotals(cards: CardState[], hidden: Set<string>, config: BoardConfig): Record<string, GroupTotals> {
  return useMemo(() => columnTotals(cards, hidden, config), [cards, hidden, config]);
}
