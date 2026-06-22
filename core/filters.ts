// Sidebar filters (Sprint 2): search, domain, type, nature, criticality,
// owner, blocked, age — plus the counts the sidebar displays. Filters DIM
// cards, they never remove them: the spatial structure of the board is
// always the truth. Pure logic, rendered by front/components/Sidebar*.tsx.

import type { BoardConfig, CardState, Criticality } from "./types.ts";
import { daysInColumn, isStale } from "./aging.ts";

/** The togglable filter groups (domain/type/nature/criticality pills). */
export type FilterGroup = "domains" | "types" | "natures" | "crits";

/** The filter state driven by the sidebar. A card failing any criterion
 *  is dimmed. Group maps record key -> enabled; absent keys mean enabled. */
export interface FilterState {
  /** Matches title or codename, case-insensitive. Empty = no search. */
  search: string;
  domains: Record<string, boolean>;
  types: Record<string, boolean>;
  natures: Record<string, boolean>;
  crits: Record<string, boolean>;
  /** Exactly one owner, or null for all owners. */
  owner: string | null;
  /** True = only blocked cards stay lit. */
  blockedOnly: boolean;
  /** Minimum days in column, or null for any age. */
  minAgeDays: number | null;
}

/** Counts for one sidebar stat row: lit cards vs the whole portfolio. */
export interface GroupCounts {
  shown: number;
  total: number;
}

/** The headline counts of the sidebar read-out. */
export interface ViewCounts extends GroupCounts {
  blocked: GroupCounts;
  stale: GroupCounts;
  crits: Record<Criticality, GroupCounts>;
}

/**
 * Distinct lane natures, in lane order (drives the Nature filter; empty
 * when no lane declares a nature).
 * Input: the board config. Output: distinct nature strings. Failure: none.
 */
export function laneNatures(config: BoardConfig): string[] {
  const natures: string[] = [];
  for (const lane of config.lanes) {
    if (lane.nature && !natures.includes(lane.nature)) natures.push(lane.nature);
  }
  return natures;
}

/**
 * The neutral filter state: everything enabled, nothing dimmed.
 * Input: the board config (domain/type/nature lists).
 * Output: a fresh FilterState. Failure: none.
 */
export function defaultFilters(config: BoardConfig): FilterState {
  const on = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, true]));
  return {
    search: "",
    domains: on(config.domains),
    types: on(config.types.map((type) => type.id)),
    natures: on(laneNatures(config)),
    crits: on(["top", "major", "normal"]),
    owner: null,
    blockedOnly: false,
    minAgeDays: null,
  };
}

/**
 * True when the state differs from the neutral state (drives the
 * "Filtré : x/y" chip and the reset button).
 * Input: a FilterState. Output: boolean. Failure: none.
 */
export function isFilterActive(filters: FilterState): boolean {
  const groupOff = (group: Record<string, boolean>) => Object.values(group).some((enabled) => !enabled);
  return (
    filters.search.trim() !== "" ||
    groupOff(filters.domains) ||
    groupOff(filters.types) ||
    groupOff(filters.natures) ||
    groupOff(filters.crits) ||
    filters.owner !== null ||
    filters.blockedOnly ||
    filters.minAgeDays !== null
  );
}

function matchesSearch(card: CardState, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (query === "") return true;
  if (card.title.toLowerCase().includes(query)) return true;
  return (card.codename ?? "").toLowerCase().includes(query);
}

/**
 * Whether one card passes the filters (stays lit). Criteria combine with
 * AND; untyped cards and lanes without a nature pass those criteria.
 * Inputs: a CardState, the filters, the board config (lane natures), now.
 * Output: true when the card passes every criterion. Failure: none —
 * keys missing from a group map count as enabled.
 */
export function passesFilters(
  card: CardState,
  filters: FilterState,
  config: BoardConfig,
  now: Date,
): boolean {
  if (!matchesSearch(card, filters.search)) return false;
  if (filters.domains[card.domain] === false) return false;
  if (card.typeId !== null && filters.types[card.typeId] === false) return false;
  if (filters.crits[card.criticality] === false) return false;
  const nature = config.lanes.find((lane) => lane.id === card.laneId)?.nature;
  if (nature && filters.natures[nature] === false) return false;
  if (filters.owner !== null && card.owner !== filters.owner) return false;
  if (filters.blockedOnly && !card.blocked) return false;
  if (filters.minAgeDays !== null && daysInColumn(card, now) < filters.minAgeDays) return false;
  return true;
}

/**
 * Ids of the cards the filters dim (the complement of passesFilters).
 * Inputs: all card states, the filters, the board config, now.
 * Output: a Set of card ids to render dimmed (empty when neutral).
 * Failure: none.
 */
export function dimmedCardIds(
  cards: CardState[],
  filters: FilterState,
  config: BoardConfig,
  now: Date,
): Set<string> {
  const dimmed = new Set<string>();
  if (!isFilterActive(filters)) return dimmed;
  for (const card of cards) {
    if (!passesFilters(card, filters, config, now)) dimmed.add(card.id);
  }
  return dimmed;
}

/**
 * The sidebar's live read-out: lit counts against portfolio totals, plus
 * per-criticality counts for the stats block.
 * Inputs: all card states, the dimmed id set, the board config, now.
 * Output: a ViewCounts. Failure: none.
 */
export function viewCounts(
  cards: CardState[],
  dimmed: ReadonlySet<string>,
  config: BoardConfig,
  now: Date,
): ViewCounts {
  const zero = (): GroupCounts => ({ shown: 0, total: 0 });
  const counts: ViewCounts = {
    shown: 0,
    total: cards.length,
    blocked: zero(),
    stale: zero(),
    crits: { top: zero(), major: zero(), normal: zero() },
  };
  const bump = (group: GroupCounts, lit: boolean) => {
    group.total++;
    if (lit) group.shown++;
  };
  for (const card of cards) {
    const lit = !dimmed.has(card.id);
    if (lit) counts.shown++;
    if (card.blocked) bump(counts.blocked, lit);
    if (isStale(card, config, now)) bump(counts.stale, lit);
    bump(counts.crits[card.criticality], lit);
  }
  return counts;
}

/**
 * Lit/total card counts per key for one filter dimension, in the given
 * key order (domain pills, nature stats…).
 * Inputs: all card states, the dimmed id set, the ordered keys, a
 * function mapping a card to its key (or null to skip the card).
 * Output: key -> GroupCounts. Failure: none — unknown keys are ignored.
 */
export function groupCounts(
  cards: CardState[],
  dimmed: ReadonlySet<string>,
  keys: string[],
  keyOf: (card: CardState) => string | null,
): Record<string, GroupCounts> {
  const counts = Object.fromEntries(keys.map((key) => [key, { shown: 0, total: 0 }]));
  for (const card of cards) {
    const key = keyOf(card);
    const entry = key === null ? undefined : counts[key];
    if (!entry) continue;
    entry.total++;
    if (!dimmed.has(card.id)) entry.shown++;
  }
  return counts;
}

/**
 * The distinct owners present in the portfolio, sorted for the owner
 * select. Input: all card states. Output: sorted owner names.
 * Failure: none.
 */
export function listOwners(cards: CardState[]): string[] {
  return [...new Set(cards.map((card) => card.owner))].sort((a, b) => a.localeCompare(b, "fr"));
}
