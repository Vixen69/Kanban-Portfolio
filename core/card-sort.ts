// Sorting the board's cards for the arbitration session (ADR 044, author
// 2026-09-21: the responsables de domaine look at what costs the scarce
// métiers, all domains mixed, instead of being grilled one portfolio after
// the other). A sort is a VIEW: it never writes an event, the manual order
// (ADR 019) stays underneath and comes back when the sort is cleared.
// Three keys since ADR 048: the board's own order, the card's reste à
// faire (j.h — the per-métier plan only, on the métiers the lens counts:
// the lens of the board gutter replaces the former « par métier » key and
// its checkbox list), its meilleur estimé (k€).
// A card with nothing to show for the key goes LAST in both directions —
// an ascending sort must not put the cards without data on top.

import type { CardState } from "./types.ts";
import { cardRaf, profileRemaining } from "./raf-card.ts";

/** What the cards are sorted by. */
export type SortKey = "board" | "remaining" | "estimate";
/** Largest first, or smallest first. */
export type SortDirection = "desc" | "asc";

/** The sort of the board: a key and a direction. */
export interface CardSort {
  key: SortKey;
  direction: SortDirection;
}

/** No sort: the board's own (manual) order. */
export const BOARD_ORDER: CardSort = { key: "board", direction: "desc" };

/**
 * True when the sort reorders anything: a key other than the board's order.
 * Input: the sort. Output: the flag. Failure: none.
 */
export function isSortActive(sort: CardSort): boolean {
  return sort.key !== "board";
}

/**
 * The figure a card is sorted by: its reste à faire on the counted métiers
 * (j.h), or its meilleur estimé (k€).
 * Inputs: the card, the sort, the counted profile ids (the lens's —
 * every métier of the config when it is off). Output: the figure, 0 when
 * the card has nothing to show for that key (or the key is the board's
 * order). Failure: none.
 */
export function sortValue(card: CardState, sort: CardSort, counted: ReadonlySet<string>): number {
  if (sort.key === "remaining") return cardRaf(card, counted);
  if (sort.key === "estimate") return Math.max(0, card.budgetEstimated ?? 0);
  return 0;
}

/**
 * Sorts cards by the sort's figure, stable: equal figures keep their
 * input (board) order, and the cards without a figure go last — in both
 * directions — in their input order. An inactive sort returns a copy in
 * input order.
 * Inputs: the cards, the sort, the counted profile ids (« reste à faire »).
 * Output: a new array. Failure: none.
 */
export function sortCards<T extends CardState>(cards: readonly T[], sort: CardSort, counted: ReadonlySet<string>): T[] {
  if (!isSortActive(sort)) return [...cards];
  const sign = sort.direction === "desc" ? -1 : 1;
  const rows = cards.map((card, index) => ({ card, index, value: sortValue(card, sort, counted) }));
  rows.sort((a, b) => {
    const aEmpty = a.value <= 0;
    const bEmpty = b.value <= 0;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    if (aEmpty || a.value === b.value) return a.index - b.index;
    return sign * (a.value - b.value);
  });
  return rows.map((row) => row.card);
}

/** One métier line of a card's breakdown. */
export interface ProfileLine {
  profileId: string;
  raf: number;
  /** True when the lens narrows the board and counts this métier. */
  chosen: boolean;
  /** True when the lens narrows the board and does NOT count this métier (greyed). */
  out: boolean;
}

/** The expanded card's « RAF par métier » block. */
export interface ProfileBreakdown {
  /** False when the card carries no per-profile plan at all (« sans ventilation »). */
  hasPlan: boolean;
  /** The lines shown: the counted métiers first, then the largest, capped. */
  lines: ProfileLine[];
  /** How many métiers of the card still have a reste à faire. */
  total: number;
}

/**
 * The métiers with the largest reste à faire on a card; while the lens
 * narrows the board, the métiers it counts come first and the others are
 * marked out (ADR 048).
 * Inputs: the card, the lens's counted métiers (null when the lens is off —
 * every line is then plain), how many lines at most (default 3).
 * Output: the ProfileBreakdown. Failure: none.
 */
export function topProfiles(card: CardState, scope: ReadonlySet<string> | null, limit = 3): ProfileBreakdown {
  const ids = [...new Set(card.chargeByProfile.map((entry) => entry.profileId))];
  const lines = ids
    .map((profileId) => {
      const chosen = scope !== null && scope.has(profileId);
      return { profileId, raf: profileRemaining(card, profileId), chosen, out: scope !== null && !chosen };
    })
    .filter((line) => line.raf > 0)
    .sort((a, b) => (a.chosen === b.chosen ? b.raf - a.raf : a.chosen ? -1 : 1));
  return { hasPlan: card.chargeByProfile.length > 0, lines: lines.slice(0, limit), total: lines.length };
}
