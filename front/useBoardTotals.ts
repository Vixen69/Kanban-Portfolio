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
import { useFrozenOrder } from "./useRafLens.ts";

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
  /** The reste à faire of the counted métiers, class by class. */
  split: RafSplit;
  /** Every métier with its engaged / non-engaged reste à faire (the lens list), in a stable order while the lens is on. */
  rows: LensRow[];
}

/**
 * The board's aggregates over the VISIBLE cards.
 * Inputs: the folded cards, the hidden ids (filters, ADR 031), the config,
 * the unified (canal-less) column ids, the counted métiers, whether the
 * lens is on (the métier rows then keep their order — held here, in the
 * always-mounted grid, so folding the gutter never loses it).
 * Output: the BoardTotals. Failure: none.
 */
export function useBoardTotals(
  cards: CardState[], hidden: Set<string>, config: BoardConfig, unified: Set<string>, counted: ReadonlySet<string>,
  frozen: boolean,
): BoardTotals {
  const classes = useMemo(() => columnClasses(config), [config]);
  const byColumn = useMemo(() => columnTotals(cards, hidden, config), [cards, hidden, config]);
  const lanes = useMemo(() => {
    const inCanal = cards.filter((card) => !unified.has(card.columnId));
    const counting = inCanal.filter((card) => classes[card.columnId] !== "excluded");
    return { money: laneTotals(inCanal, hidden, config), raf: laneTotals(counting, hidden, config) };
  }, [cards, hidden, config, unified, classes]);
  const board = useMemo(() => sumTotals(Object.values(byColumn)), [byColumn]);
  const split = useMemo(() => rafSplit(byColumn, classes, counted), [byColumn, classes, counted]);
  const rows = useFrozenOrder(useMemo(() => lensRows(byColumn, classes, config), [byColumn, classes, config]), frozen);
  return { byColumn, byLane: lanes.money, byLaneRaf: lanes.raf, board, classes, split, rows };
}
