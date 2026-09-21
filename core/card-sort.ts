// Sorting the board's cards for the arbitration session (ADR 044, author
// 2026-09-21: the responsables de domaine look at what costs the scarce
// métiers, all domains mixed, instead of being grilled one portfolio after
// the other). A sort is a VIEW: it never writes an event, the manual order
// (ADR 019) stays underneath and comes back when the sort is cleared.
// Four keys: the board's own order, the card's reste à faire (j.h), its
// meilleur estimé (k€), the reste à faire of chosen métiers (the card's
// per-profile plan, the same figures as the column headers' breakdown).
// A card with nothing to show for the key goes LAST in both directions —
// an ascending sort must not put the cards without data on top.

import type { BoardConfig, CardState, Profile } from "./types.ts";

/** What the cards are sorted by. */
export type SortKey = "board" | "remaining" | "estimate" | "profiles";
/** Largest first, or smallest first. */
export type SortDirection = "desc" | "asc";

/** The sort of the board: a key, a direction, the métiers of a « profiles » sort. */
export interface CardSort {
  key: SortKey;
  direction: SortDirection;
  profileIds: readonly string[];
}

/** No sort: the board's own (manual) order. */
export const BOARD_ORDER: CardSort = { key: "board", direction: "desc", profileIds: [] };

/**
 * True when the sort reorders anything: a key other than the board's
 * order, and at least one métier for a « profiles » sort.
 * Input: the sort. Output: the flag. Failure: none.
 */
export function isSortActive(sort: CardSort): boolean {
  if (sort.key === "board") return false;
  return sort.key !== "profiles" || sort.profileIds.length > 0;
}

/**
 * The card's load in jours-homme: its per-profile plan when it has one,
 * else its card-level effort (the rule of core/totals and of the fiche).
 * Input: the card. Output: planned, done and reste à faire (clamped at 0).
 * Failure: none.
 */
export function cardLoad(card: CardState): { jh: number; done: number; raf: number } {
  const plan = card.chargeByProfile;
  const jh = plan.length > 0 ? plan.reduce((total, entry) => total + entry.jh, 0) : card.effortEstimated ?? 0;
  const done = plan.length > 0 ? plan.reduce((total, entry) => total + entry.done, 0) : card.effortConsumed ?? 0;
  return { jh, done, raf: Math.max(0, jh - done) };
}

/**
 * The reste à faire of one métier on a card: planned minus done over the
 * card's entries of that profile, clamped at 0.
 * Inputs: the card, the profile id. Output: j.h remaining. Failure: none.
 */
export function profileRemaining(card: CardState, profileId: string): number {
  let jh = 0;
  let done = 0;
  for (const entry of card.chargeByProfile) {
    if (entry.profileId !== profileId) continue;
    jh += entry.jh;
    done += entry.done;
  }
  return Math.max(0, jh - done);
}

/**
 * The figure a card is sorted by: reste à faire (j.h), meilleur estimé
 * (k€), or the summed reste à faire of the chosen métiers.
 * Inputs: the card, the sort. Output: the figure, 0 when the card has
 * nothing to show for that key (or the key is the board's order).
 * Failure: none.
 */
export function sortValue(card: CardState, sort: CardSort): number {
  if (sort.key === "remaining") return cardLoad(card).raf;
  if (sort.key === "estimate") return Math.max(0, card.budgetEstimated ?? 0);
  if (sort.key !== "profiles") return 0;
  return sort.profileIds.reduce((total, id) => total + profileRemaining(card, id), 0);
}

/**
 * Sorts cards by the sort's figure, stable: equal figures keep their
 * input (board) order, and the cards without a figure go last — in both
 * directions — in their input order. An inactive sort returns a copy in
 * input order.
 * Inputs: the cards, the sort. Output: a new array. Failure: none.
 */
export function sortCards<T extends CardState>(cards: readonly T[], sort: CardSort): T[] {
  if (!isSortActive(sort)) return [...cards];
  const sign = sort.direction === "desc" ? -1 : 1;
  const rows = cards.map((card, index) => ({ card, index, value: sortValue(card, sort) }));
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
  /** True when the métier is one the board is sorted by. */
  chosen: boolean;
}

/** The expanded card's « RAF par métier » block. */
export interface ProfileBreakdown {
  /** False when the card carries no per-profile plan at all (« sans ventilation »). */
  hasPlan: boolean;
  /** The lines shown: the chosen métiers first, then the largest, capped. */
  lines: ProfileLine[];
  /** How many métiers of the card still have a reste à faire. */
  total: number;
}

/**
 * The métiers with the largest reste à faire on a card, the ones the board
 * is sorted by coming first.
 * Inputs: the card, the sort, how many lines at most (default 3).
 * Output: the ProfileBreakdown. Failure: none.
 */
export function topProfiles(card: CardState, sort: CardSort, limit = 3): ProfileBreakdown {
  const chosen = new Set(sort.key === "profiles" ? sort.profileIds : []);
  const ids = [...new Set(card.chargeByProfile.map((entry) => entry.profileId))];
  const lines = ids
    .map((profileId) => ({ profileId, raf: profileRemaining(card, profileId), chosen: chosen.has(profileId) }))
    .filter((line) => line.raf > 0)
    .sort((a, b) => (a.chosen === b.chosen ? b.raf - a.raf : a.chosen ? -1 : 1));
  return { hasPlan: card.chargeByProfile.length > 0, lines: lines.slice(0, limit), total: lines.length };
}

/** One métier of the sidebar's list: the profile and its reste à faire over the cards. */
export interface ProfileTotal {
  profile: Profile;
  raf: number;
}

/**
 * The reste à faire of each métier of the config over a set of cards,
 * largest first; the métiers without any are left out.
 * Inputs: the cards, the config. Output: the totals. Failure: none.
 */
export function profileRemainingTotals(cards: readonly CardState[], config: BoardConfig): ProfileTotal[] {
  return config.profiles
    .map((profile) => ({ profile, raf: cards.reduce((total, card) => total + profileRemaining(card, profile.id), 0) }))
    .filter((entry) => entry.raf > 0)
    .sort((a, b) => b.raf - a.raf);
}

/**
 * How many cards carry no per-profile plan: a sort by métier cannot rank
 * them, and the screen says so rather than hiding it.
 * Input: the cards. Output: the count. Failure: none.
 */
export function withoutBreakdown(cards: readonly CardState[]): number {
  return cards.filter((card) => card.chargeByProfile.length === 0).length;
}
