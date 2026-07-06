// Sidebar filters (design v9): search plus four pill groups — project
// type, nature, criticality, domain. Filters DIM cards, they never remove
// them: the spatial structure of the board is always the truth. Pure
// logic, rendered by front/components/Sidebar.tsx.

import type { BoardConfig, Card, CardState, Criticality, NatureKey } from "./types.ts";
import { isStale } from "./aging.ts";

/** The togglable pill groups of FilterState (everything except search). */
export type FilterGroup = "type" | "nature" | "crit" | "domain";

/**
 * The filter state driven by the sidebar. Group maps record key ->
 * enabled; a key missing from a map counts as enabled (the design's
 * `!== false` convention, tolerant to config edits).
 */
export interface FilterState {
  /** Matches title or codename, trimmed, case-insensitive. Empty = all. */
  search: string;
  type: Record<string, boolean>;
  nature: Record<NatureKey, boolean>;
  crit: Record<Criticality, boolean>;
  domain: Record<string, boolean>;
}

/**
 * The live read-out of the sidebar and header: how many cards are shown
 * (non-dimmed) and how the shown subset splits by state, criticality and
 * nature. `total` is always the whole portfolio.
 */
export interface ViewCounts {
  shown: number;
  total: number;
  blocked: number;
  stale: number;
  top: number;
  major: number;
  normal: number;
  simple: number;
  complicated: number;
  complex: number;
}

/**
 * The neutral filter state: empty search, every key of every group true.
 * Input: the board config (type/domain id lists).
 * Output: a fresh FilterState (safe to mutate). Failure: none.
 */
export function defaultFilters(config: BoardConfig): FilterState {
  const on = (keys: string[]): Record<string, boolean> =>
    Object.fromEntries(keys.map((key) => [key, true]));
  return {
    search: "",
    type: on(config.types.map((type) => type.id)),
    nature: { simple: true, complicated: true, complex: true },
    crit: { top: true, major: true, normal: true },
    domain: on(config.domains.map((domain) => domain.id)),
  };
}

/**
 * True when the board is currently narrowed: a non-blank search or any
 * group key toggled off (drives the "Filtré : x/y" chip and the reset
 * buttons). Input: a FilterState. Output: boolean. Failure: none.
 */
export function isFilterActive(filters: FilterState): boolean {
  const groupOff = (group: Record<string, boolean>) =>
    Object.values(group).some((enabled) => enabled === false);
  return (
    filters.search.trim() !== "" ||
    groupOff(filters.type) ||
    groupOff(filters.nature) ||
    groupOff(filters.crit) ||
    groupOff(filters.domain)
  );
}

/**
 * Whether one card stays lit: the search matches its title OR codename
 * (trimmed, case-insensitive) AND every group passes. A group passes when
 * the card's key is missing from the map or mapped to true; a null typeId
 * always passes the type group.
 * Inputs: a Card (CardState included), the filters.
 * Output: true when the card passes everything. Failure: none.
 */
export function cardMatches(card: Card, filters: FilterState): boolean {
  const query = filters.search.trim().toLowerCase();
  const matchesSearch =
    query === "" ||
    card.title.toLowerCase().includes(query) ||
    (card.codename ?? "").toLowerCase().includes(query);
  if (!matchesSearch) return false;
  if (filters.nature[card.nature] === false) return false;
  if (filters.crit[card.criticality] === false) return false;
  if (filters.domain[card.domain] === false) return false;
  if (card.typeId !== null && filters.type[card.typeId] === false) return false;
  return true;
}

/**
 * Ids of the cards the filters dim (the complement of cardMatches).
 * Inputs: all card states, the filters.
 * Output: a Set of card ids to render dimmed (empty when neutral).
 * Failure: none.
 */
export function dimmedCardIds(cards: CardState[], filters: FilterState): Set<string> {
  const dimmed = new Set<string>();
  for (const card of cards) {
    if (!cardMatches(card, filters)) dimmed.add(card.id);
  }
  return dimmed;
}

function emptyCounts(total: number): ViewCounts {
  return {
    shown: 0,
    total,
    blocked: 0,
    stale: 0,
    top: 0,
    major: 0,
    normal: 0,
    simple: 0,
    complicated: 0,
    complex: 0,
  };
}

function tally(counts: ViewCounts, card: CardState, config: BoardConfig, now: Date): void {
  counts.shown++;
  if (card.blocked) counts.blocked++;
  if (isStale(card, config, now)) counts.stale++;
  counts[card.criticality]++;
  counts[card.nature]++;
}

/**
 * Counts over the VISIBLE subset: only non-dimmed cards are tallied
 * (shown, blocked, stale, per-criticality, per-nature); total is the
 * whole portfolio size.
 * Inputs: all card states, the dimmed id set, the board config (stale
 * threshold), now. Output: a ViewCounts. Failure: none.
 */
export function viewCounts(
  cards: CardState[],
  dimmed: ReadonlySet<string>,
  config: BoardConfig,
  now: Date,
): ViewCounts {
  const counts = emptyCounts(cards.length);
  for (const card of cards) {
    if (!dimmed.has(card.id)) tally(counts, card, config, now);
  }
  return counts;
}

/**
 * Counts over the WHOLE portfolio, ignoring filters (the sidebar's muted
 * reference totals and the header stats). shown always equals total.
 * Inputs: all card states, the board config, now.
 * Output: a ViewCounts. Failure: none.
 */
export function portfolioCounts(cards: CardState[], config: BoardConfig, now: Date): ViewCounts {
  const counts = emptyCounts(cards.length);
  for (const card of cards) {
    tally(counts, card, config, now);
  }
  return counts;
}
