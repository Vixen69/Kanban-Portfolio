// Board selectors: cells, WIP read-outs and lane summaries.
// Pure queries over CardState[] — the React layer only renders these.

import type { BoardConfig, CardState } from "./types.ts";
import { isStale } from "./aging.ts";

/** WIP read-out of one column: display string + warning state. */
export interface WipStatus {
  count: number;
  limit: number | null;
  /** "4 / non defini" when no limit, "4/6" when set. */
  display: string;
  /** True when a set limit is exceeded — warns, never blocks. */
  exceeded: boolean;
}

/** Glance summary of one lane-column cell (used by collapsed lanes). */
export interface CellSummary {
  count: number;
  blockedCount: number;
  staleCount: number;
}

/**
 * Cards sitting in one lane-column cell, in stable input order.
 * Inputs: all card states, a lane id, a column id.
 * Output: the matching cards (possibly empty). Failure: none.
 */
export function cellCards(cards: CardState[], laneId: string, columnId: string): CardState[] {
  return cards.filter((card) => card.laneId === laneId && card.columnId === columnId);
}

/**
 * WIP read-out for one column across all lanes.
 * Inputs: all card states, the column definition's id and wipLimit.
 * Output: a WipStatus; with a null limit the display reads "non defini"
 * and exceeded is always false (nothing is enforced).
 * Failure: none.
 */
export function wipStatus(cards: CardState[], columnId: string, limit: number | null): WipStatus {
  const count = cards.reduce((n, card) => (card.columnId === columnId ? n + 1 : n), 0);
  if (limit === null) {
    return { count, limit, display: `${count} / non defini`, exceeded: false };
  }
  return { count, limit, display: `${count}/${limit}`, exceeded: count > limit };
}

/**
 * Glance summary of one cell: total, blocked and stagnant counts.
 * Inputs: all card states, lane id, column id, board config, now.
 * Output: a CellSummary. Failure: none.
 */
export function cellSummary(
  cards: CardState[],
  laneId: string,
  columnId: string,
  config: BoardConfig,
  now: Date,
): CellSummary {
  const inCell = cellCards(cards, laneId, columnId);
  return {
    count: inCell.length,
    blockedCount: inCell.filter((card) => card.blocked).length,
    staleCount: inCell.filter((card) => isStale(card, config, now)).length,
  };
}

/**
 * Portfolio head-line numbers shown in the header.
 * Inputs: all card states. Output: total and blocked counts. Failure: none.
 */
export function portfolioStats(cards: CardState[]): { total: number; blocked: number } {
  return {
    total: cards.length,
    blocked: cards.reduce((n, card) => (card.blocked ? n + 1 : n), 0),
  };
}

/**
 * Neighbour cell for the keyboard move fallback (arrow direction).
 * Inputs: board config, current lane/column ids, a direction.
 * Output: the target {laneId, columnId}, or null at the board edge or when
 * the current ids are unknown to the config.
 * Failure: none.
 */
export function neighbourCell(
  config: BoardConfig,
  laneId: string,
  columnId: string,
  direction: "left" | "right" | "up" | "down",
): { laneId: string; columnId: string } | null {
  const laneIndex = config.lanes.findIndex((lane) => lane.id === laneId);
  const columnIndex = config.columns.findIndex((column) => column.id === columnId);
  if (laneIndex < 0 || columnIndex < 0) return null;
  const laneDelta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const columnDelta = direction === "left" ? -1 : direction === "right" ? 1 : 0;
  const lane = config.lanes[laneIndex + laneDelta];
  const column = config.columns[columnIndex + columnDelta];
  if (!lane || !column) return null;
  return { laneId: lane.id, columnId: column.id };
}
