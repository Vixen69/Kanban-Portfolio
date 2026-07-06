// Board selectors: cells, WIP read-outs and cell/portfolio summaries.
// Pure queries over CardState[] — the React layer only renders these.

import type { BoardConfig, CardState } from "./types.ts";
import { isStale } from "./aging.ts";

/** WIP heat of one cell: no limit / under / nearing (>= 80%) / exceeded. */
export type WipState = "na" | "ok" | "warn" | "over";

/** Glance summary of one lane-column cell (collapsed lanes/columns). */
export interface CellSummary {
  count: number;
  blockedCount: number;
  staleCount: number;
}

/** Ratio of a WIP limit at which the read-out warns before it overflows. */
const WIP_WARN_RATIO = 0.8;

/**
 * Cards sitting in one lane-column cell, in stable input order.
 * Inputs: all card states, a lane id, a column id.
 * Output: the matching cards (possibly empty). Failure: none.
 */
export function cellCards(cards: CardState[], laneId: string, columnId: string): CardState[] {
  return cards.filter((card) => card.laneId === laneId && card.columnId === columnId);
}

/**
 * WIP heat for a card count against a column's limit: "na" without a limit,
 * "over" when count/limit > 1, "warn" from count/limit >= 0.8, else "ok".
 * A WIP limit warns, it never blocks.
 * Inputs: card count, the column's wip (null = no limit).
 * Output: a WipState. Failure: none (a non-positive limit reads as "na").
 */
export function wipState(count: number, wip: number | null): WipState {
  if (wip === null || wip <= 0) return "na";
  const ratio = count / wip;
  if (ratio > 1) return "over";
  if (ratio >= WIP_WARN_RATIO) return "warn";
  return "ok";
}

/**
 * WIP read-out text: "n/limit" when a limit is set, plain "n" otherwise.
 * Inputs: card count, the column's wip (null = no limit).
 * Output: the display string. Failure: none (a non-positive limit reads
 * as no limit, matching wipState).
 */
export function wipDisplay(count: number, wip: number | null): string {
  if (wip === null || wip <= 0) return String(count);
  return `${count}/${wip}`;
}

/**
 * Glance summary of one cell: total, blocked and stagnant counts.
 * Inputs: all card states, lane id, column id, board config, now.
 * Output: a CellSummary (a card both blocked and stale counts in both).
 * Failure: none.
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
