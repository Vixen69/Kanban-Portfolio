// Time per stage (author, 2026-09-16: « le temps moyen passé d'une carte
// dans les étapes »): for every column, how many cards sit there now and
// for how long on average, and how long the cards that already LEFT it
// stayed on average. Computed from the position events alone (created /
// imported / moved; same-cell reorders ignored, ADR 019; a lane change
// inside the same column does not end the stay). Metrics are queries on
// events, never a store (CLAUDE.md §4). Pure; no React, no Node.

import type { BoardConfig, CardEvent, CardState } from "./types.ts";
import { daysInColumn } from "./aging.ts";
import { isReorder } from "./events.ts";

const DAY_MS = 86_400_000;

/** One column of the « temps par étape » read-out. */
export interface StageDwell {
  id: string;
  name: string;
  /** Cards in the column now. */
  current: number;
  /** Their average days there (null when none). */
  currentAvgDays: number | null;
  /** Completed stays: cards that entered the column and left it. */
  pastStays: number;
  /** Average length of those stays in days (null when none). */
  pastAvgDays: number | null;
}

interface Tally {
  current: number;
  currentDays: number;
  pastStays: number;
  pastDays: number;
}

function numericSuffix(id: string): number {
  const match = /(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function oldestFirst(a: CardEvent, b: CardEvent): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  return numericSuffix(a.id) - numericSuffix(b.id);
}

function isPosition(event: CardEvent): boolean {
  return (event.type === "created" || event.type === "imported" || event.type === "moved")
    && event.toColumn !== null && !isReorder(event);
}

// The position events of the given cards, per card, oldest first.
function positionsByCard(events: readonly CardEvent[], ids: ReadonlySet<string>): Map<string, CardEvent[]> {
  const byCard = new Map<string, CardEvent[]>();
  for (const event of events) {
    if (!ids.has(event.cardId) || !isPosition(event)) continue;
    const list = byCard.get(event.cardId);
    if (list) list.push(event);
    else byCard.set(event.cardId, [event]);
  }
  for (const list of byCard.values()) list.sort(oldestFirst);
  return byCard;
}

// Every completed stay of one card: from its arrival in a column to its
// arrival in ANOTHER column.
function tallyStays(list: readonly CardEvent[], tallies: Map<string, Tally>): void {
  let start = list[0];
  if (start === undefined) return;
  for (const event of list.slice(1)) {
    if (event.toColumn === start.toColumn) continue;
    const tally = tallies.get(start.toColumn ?? "");
    const days = (Date.parse(event.ts) - Date.parse(start.ts)) / DAY_MS;
    if (tally !== undefined && Number.isFinite(days) && days >= 0) {
      tally.pastStays++;
      tally.pastDays += days;
    }
    start = event;
  }
}

function average(total: number, count: number): number | null {
  return count === 0 ? null : Math.round((total / count) * 10) / 10;
}

/**
 * The time per stage of one board: the cards in each column now with
 * their average age there, and the completed stays with their average
 * length — one row per configured column, in board order.
 * Inputs: the (active) card states of the board shown, the event log, the
 * board config, now. Output: the StageDwell rows. Failure: none — a column
 * nobody entered reads zeros and null averages.
 */
export function stageDwell(
  cards: readonly CardState[], events: readonly CardEvent[], config: BoardConfig, now: Date,
): StageDwell[] {
  const tallies = new Map<string, Tally>(
    config.columns.map((column) => [column.id, { current: 0, currentDays: 0, pastStays: 0, pastDays: 0 }]),
  );
  for (const card of cards) {
    const tally = tallies.get(card.columnId);
    if (tally === undefined) continue;
    tally.current++;
    tally.currentDays += daysInColumn(card, now);
  }
  for (const list of positionsByCard(events, new Set(cards.map((card) => card.id))).values()) tallyStays(list, tallies);
  return config.columns.map((column) => {
    const tally = tallies.get(column.id) ?? { current: 0, currentDays: 0, pastStays: 0, pastDays: 0 };
    return {
      id: column.id, name: column.name,
      current: tally.current, currentAvgDays: average(tally.currentDays, tally.current),
      pastStays: tally.pastStays, pastAvgDays: average(tally.pastDays, tally.pastStays),
    };
  });
}
