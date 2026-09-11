// Sidebar filters (design v11): search, the « Bloqués uniquement » toggle
// and the pill groups — project type, criticality, domain (with its
// sub-domains, ADR 022), constraint. (The nature group left in v11: nature
// is positional, carried by the canal.) Filters HIDE the cards they exclude
// (ADR 031, author's call 2026-09-11 — the v12 dimming is retired): the
// board shows the retained subset and the counts say how much was kept.
// Pure logic, rendered by front/components/Sidebar.tsx.

import { reviewOverdue } from "./decisions.ts";
import type { BoardConfig, Card, CardState, Criticality } from "./types.ts";
import { isStale } from "./aging.ts";

/** The togglable pill groups of FilterState (search/blockedOnly excluded). */
export type FilterGroup = "type" | "crit" | "domain" | "subDomain" | "constraint";

/**
 * The key of one sub-domain pill in FilterState.subDomain — scoped by its
 * domain, since two domains may declare a sub-domain with the same id.
 * Inputs: the domain id, the sub-domain id. Output: "domain/sub".
 * Failure: none.
 */
export function subDomainKey(domainId: string, subDomainId: string): string {
  return `${domainId}/${subDomainId}`;
}

// Every sub-domain pill key the config declares, in config order.
function subDomainKeys(config: BoardConfig): string[] {
  return config.domains.flatMap((domain) =>
    (domain.subDomains ?? []).map((sub) => subDomainKey(domain.id, sub.id)));
}

/**
 * The filter state driven by the sidebar. Group maps record key ->
 * enabled; a key missing from a map counts as enabled (the design's
 * `!== false` convention, tolerant to config edits).
 */
export interface FilterState {
  /** Matches title or codename, trimmed, case-insensitive. Empty = all. */
  search: string;
  /** « Bloqués uniquement » — hides every card that is not blocked. */
  blockedOnly: boolean;
  type: Record<string, boolean>;
  crit: Record<Criticality, boolean>;
  domain: Record<string, boolean>;
  /**
   * Sub-domain pills keyed by subDomainKey (ADR 022). A card wearing a
   * sub-domain must pass its domain AND its sub-domain pill; a card without
   * one follows its domain alone. Toggling a domain pill resets its
   * sub-domains to the same value (withDomainToggled).
   */
  subDomain: Record<string, boolean>;
  /** Project-constraint ids (design v12). OR-shaped — see cardMatches. */
  constraint: Record<string, boolean>;
  /**
   * The « Aucune » pill: keeps cards carrying NO project constraint. It is
   * deliberately NOT a key of `constraint` — the absence of a constraint is
   * not a constraint, and a separate field cannot collide with an admin-
   * defined id (config vocabulary is editable, ADR 013).
   */
  noConstraint: boolean;
}

/**
 * The live read-out of the sidebar and header: how many cards are shown
 * (not hidden) and how the shown subset splits by state and criticality.
 * `total` is always the whole portfolio.
 */
export interface ViewCounts {
  shown: number;
  total: number;
  blocked: number;
  stale: number;
  top: number;
  major: number;
  normal: number;
  /** Cards the last import did not list (ADR 026). */
  absent: number;
  /** Cards whose last decision's review date is past (ADR 026). */
  toReview: number;
}

/**
 * The neutral filter state: empty search, blockedOnly off, every key of
 * every group true. Input: the board config (type/domain id lists).
 * Output: a fresh FilterState (safe to mutate). Failure: none.
 */
export function defaultFilters(config: BoardConfig): FilterState {
  const on = (keys: string[]): Record<string, boolean> =>
    Object.fromEntries(keys.map((key) => [key, true]));
  return {
    search: "",
    blockedOnly: false,
    type: on(config.types.map((type) => type.id)),
    crit: { top: true, major: true, normal: true },
    domain: on(config.domains.map((domain) => domain.id)),
    subDomain: on(subDomainKeys(config)),
    constraint: on(config.projectConstraints.map((constraint) => constraint.id)),
    noConstraint: true,
  };
}

/**
 * Flips one domain pill and aligns every sub-domain pill of that domain on
 * the new value (a domain checked = all its sub-domains; unchecked = none).
 * Inputs: the filters, the board config (the domain's sub-domain list), the
 * domain id. Output: a new FilterState (input untouched). Failure: none.
 */
export function withDomainToggled(filters: FilterState, config: BoardConfig, domainId: string): FilterState {
  const value = filters.domain[domainId] === false;
  const subDomain = { ...filters.subDomain };
  for (const sub of config.domains.find((domain) => domain.id === domainId)?.subDomains ?? []) {
    subDomain[subDomainKey(domainId, sub.id)] = value;
  }
  return { ...filters, domain: { ...filters.domain, [domainId]: value }, subDomain };
}

/**
 * Sets every domain AND sub-domain pill at once (the domain group's
 * tout / rien quick actions).
 * Inputs: the filters, the value. Output: a new FilterState. Failure: none.
 */
export function withDomainsSet(filters: FilterState, value: boolean): FilterState {
  const set = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, value]));
  return {
    ...filters,
    domain: set(Object.keys(filters.domain)),
    subDomain: set(Object.keys(filters.subDomain)),
  };
}

/**
 * True when the board is currently narrowed: a non-blank search, the
 * blocked-only toggle, or any group key toggled off (drives the
 * "Filtré : x/y" chip and the reset buttons).
 * Input: a FilterState. Output: boolean. Failure: none.
 */
export function isFilterActive(filters: FilterState): boolean {
  const groupOff = (group: Record<string, boolean>) =>
    Object.values(group).some((enabled) => enabled === false);
  return (
    filters.search.trim() !== "" ||
    filters.blockedOnly ||
    groupOff(filters.type) ||
    groupOff(filters.crit) ||
    groupOff(filters.domain) ||
    groupOff(filters.subDomain) ||
    groupOff(filters.constraint) ||
    !filters.noConstraint
  );
}

// The constraint group, unlike every other one, is OR-shaped: a card wears
// several constraints at once, so it stays lit as long as ONE of them is
// still enabled. A card wearing none is governed by the « Aucune » pill.
function constraintPasses(card: Card, filters: FilterState): boolean {
  if (card.projectConstraints.length === 0) return filters.noConstraint;
  return card.projectConstraints.some((id) => filters.constraint[id] !== false);
}

/**
 * Whether one card stays lit: the search matches its title OR codename
 * (trimmed, case-insensitive) AND it is blocked when blockedOnly is on AND
 * every group passes. A group passes when the card's key is missing from
 * the map or mapped to true; a null typeId always passes the type group,
 * a null subDomain always passes the sub-domain group (the card follows its
 * domain alone). The constraint group is OR-shaped (see constraintPasses).
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
  if (filters.blockedOnly && !card.blocked) return false;
  if (filters.crit[card.criticality] === false) return false;
  if (filters.domain[card.domain] === false) return false;
  if (card.subDomain !== null && filters.subDomain[subDomainKey(card.domain, card.subDomain)] === false) {
    return false;
  }
  if (card.typeId !== null && filters.type[card.typeId] === false) return false;
  if (!constraintPasses(card, filters)) return false;
  return true;
}

/**
 * Ids of the cards the filters hide (the complement of cardMatches).
 * Inputs: all card states, the filters.
 * Output: a Set of card ids to leave off the board (empty when neutral).
 * Failure: none.
 */
export function hiddenCardIds(cards: CardState[], filters: FilterState): Set<string> {
  const hidden = new Set<string>();
  for (const card of cards) {
    if (!cardMatches(card, filters)) hidden.add(card.id);
  }
  return hidden;
}

function emptyCounts(total: number): ViewCounts {
  return { shown: 0, total, blocked: 0, stale: 0, top: 0, major: 0, normal: 0, absent: 0, toReview: 0 };
}

function tally(counts: ViewCounts, card: CardState, config: BoardConfig, now: Date): void {
  counts.shown++;
  if (card.blocked) counts.blocked++;
  if (isStale(card, config, now)) counts.stale++;
  if (card.absentFromLastImport !== null) counts.absent++;
  if (reviewOverdue(card, now)) counts.toReview++;
  counts[card.criticality]++;
}

/**
 * Counts over the VISIBLE subset: only the cards not hidden are tallied
 * (shown, blocked, stale, per-criticality); total is the whole portfolio
 * size.
 * Inputs: all card states, the hidden id set, the board config (stale
 * threshold), now. Output: a ViewCounts. Failure: none.
 */
export function viewCounts(
  cards: CardState[],
  hidden: ReadonlySet<string>,
  config: BoardConfig,
  now: Date,
): ViewCounts {
  const counts = emptyCounts(cards.length);
  for (const card of cards) {
    if (!hidden.has(card.id)) tally(counts, card, config, now);
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
