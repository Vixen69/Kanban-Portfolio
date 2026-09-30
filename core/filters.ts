// Sidebar filters (design v11): search, the « Bloqués uniquement » toggle
// and the pill groups — project type, criticality, domain (with its
// sub-domains, ADR 022), constraint. (The nature group left in v11: nature
// is positional, carried by the canal.) Filters HIDE the cards they exclude
// (ADR 031, author's call 2026-09-11 — the v12 dimming is retired): the
// board shows the retained subset and the counts say how much was kept.
// Pure logic, rendered by front/components/Sidebar.tsx.

import type { BoardConfig, Card, CardState, Criticality } from "./types.ts";
import type { ResourceDraw } from "./resource-draw.ts";
import { cardMatchesQuery } from "./text-search.ts";
import { domainIssue } from "./domain-check.ts";

export type { ResourceDraw } from "./resource-draw.ts";
export type { ViewCounts } from "./filter-counts.ts";
export { portfolioCounts, viewCounts } from "./filter-counts.ts";

/** The togglable pill groups of FilterState (search/blockedOnly excluded). */
export type FilterGroup = "type" | "crit" | "domain" | "subDomain" | "constraint" | "resource";

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
  /** Matches title or codename; case, accents, apostrophes and spacing ignored (core/text-search.ts). Blank = all. */
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
  /**
   * The « Ressources embarquées » pills (ADR 041), one per transverse
   * domain. OPT-IN, unlike every other group: all off by default; a pill
   * on keeps only the cards drawing days from that domain's people, OR
   * across the pills on (the draw comes from the capacity snapshot).
   */
  resource: Record<string, boolean>;
  /**
   * The « Sans domaine » pill of the Domaine group (ADR 061), on by
   * default: keeps the cards without domain. Like `noConstraint`, not a
   * key of `domain` — the absence of a domain is not a domain.
   */
  noDomain: boolean;
  /** « Domaine à vérifier » (ADR 061) — hides every card without a domain problem (none, or one to verify). */
  domainCheckOnly: boolean;
}

/** The single on/off switches of FilterState (the pill groups excluded). */
export type FilterFlag = "blockedOnly" | "noConstraint" | "noDomain" | "domainCheckOnly";

/**
 * Flips one switch of the filters.
 * Inputs: the filters, the switch. Output: a new FilterState (input
 * untouched). Failure: none.
 */
export function withFlagToggled(filters: FilterState, flag: FilterFlag): FilterState {
  return { ...filters, [flag]: !filters[flag] };
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
    resource: Object.fromEntries(config.domains.filter((domain) => domain.transverse === true).map((domain) => [domain.id, false])),
    noDomain: true,
    domainCheckOnly: false,
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
 * Flips one sub-domain pill (author, 2026-09-16): when its domain is off,
 * the click turns the domain on with THIS sub-domain alone (the others
 * stay off) — « tout désactiver puis ne réactiver que le bon sous-filtre »
 * works; when the domain is on, the pill simply toggles.
 * Inputs: the filters, the board config, the pill key (subDomainKey).
 * Output: a new FilterState (input untouched). Failure: none — a key
 * without domain toggles nothing but itself.
 */
export function withSubDomainToggled(filters: FilterState, config: BoardConfig, key: string): FilterState {
  const slash = key.indexOf("/");
  const domainId = slash < 0 ? "" : key.slice(0, slash);
  if (filters.domain[domainId] !== false) {
    return { ...filters, subDomain: { ...filters.subDomain, [key]: filters.subDomain[key] === false } };
  }
  const subDomain = { ...filters.subDomain };
  for (const sub of config.domains.find((domain) => domain.id === domainId)?.subDomains ?? []) {
    subDomain[subDomainKey(domainId, sub.id)] = false;
  }
  subDomain[key] = true;
  return { ...filters, domain: { ...filters.domain, [domainId]: true }, subDomain };
}

/**
 * Sets every domain AND sub-domain pill at once, « Sans domaine »
 * included (the domain group's tout / rien quick actions, ADR 061).
 * Inputs: the filters, the value. Output: a new FilterState. Failure: none.
 */
export function withDomainsSet(filters: FilterState, value: boolean): FilterState {
  const set = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, value]));
  return {
    ...filters,
    domain: set(Object.keys(filters.domain)),
    subDomain: set(Object.keys(filters.subDomain)),
    noDomain: value,
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
    !filters.noConstraint ||
    !filters.noDomain ||
    filters.domainCheckOnly ||
    Object.values(filters.resource).some((on) => on)
  );
}

// The resource group is opt-in and OR-shaped (ADR 041): with no pill on
// every card passes; else the card must draw on one of the domains on.
// Without a draw (no snapshot), a pill on keeps nothing — said, not guessed.
function resourcePasses(card: Card, filters: FilterState, draw: ResourceDraw | undefined): boolean {
  const wanted = Object.entries(filters.resource).filter(([, on]) => on).map(([id]) => id);
  if (wanted.length === 0) return true;
  return wanted.some((id) => draw?.get(id)?.has(card.id) === true);
}

// The constraint group, unlike every other one, is OR-shaped: a card wears
// several constraints at once, so it stays lit as long as ONE of them is
// still enabled. A card wearing none is governed by the « Aucune » pill.
function constraintPasses(card: Card, filters: FilterState): boolean {
  if (card.projectConstraints.length === 0) return filters.noConstraint;
  return card.projectConstraints.some((id) => filters.constraint[id] !== false);
}

// The domain group (ADR 022/061): a card without domain follows the
// « Sans domaine » pill; otherwise its domain pill, then its sub-domain's.
// « Domaine à vérifier » keeps only the cards with a domain problem.
function domainPasses(card: Card, filters: FilterState): boolean {
  if (filters.domainCheckOnly && domainIssue(card) === null) return false;
  if (card.domain === "") return filters.noDomain;
  if (filters.domain[card.domain] === false) return false;
  return card.subDomain === null || filters.subDomain[subDomainKey(card.domain, card.subDomain)] !== false;
}

/**
 * Whether one card stays lit: the search matches its title OR codename
 * (case, accents and apostrophes ignored — core/text-search.ts) AND it is blocked when blockedOnly is on AND
 * every group passes. A group passes when the card's key is missing from
 * the map or mapped to true; a null typeId always passes the type group,
 * a null subDomain always passes the sub-domain group (the card follows its
 * domain alone; a card without domain follows « Sans domaine », ADR 061).
 * The constraint group is OR-shaped (see constraintPasses), the resource
 * group opt-in (see resourcePasses).
 * Inputs: a Card (CardState included), the filters, the resource draw of
 * the exercise shown (optional — absent, a resource pill on hides all).
 * Output: true when the card passes everything. Failure: none.
 */
export function cardMatches(card: Card, filters: FilterState, draw?: ResourceDraw): boolean {
  if (!cardMatchesQuery(card, filters.search)) return false;
  if (filters.blockedOnly && !card.blocked) return false;
  if (filters.crit[card.criticality] === false) return false;
  if (!domainPasses(card, filters)) return false;
  if (card.typeId !== null && filters.type[card.typeId] === false) return false;
  if (!constraintPasses(card, filters)) return false;
  return resourcePasses(card, filters, draw);
}

/**
 * Ids of the cards the filters hide (the complement of cardMatches).
 * Inputs: all card states, the filters, the resource draw (optional).
 * Output: a Set of card ids to leave off the board (empty when neutral).
 * Failure: none.
 */
export function hiddenCardIds(cards: CardState[], filters: FilterState, draw?: ResourceDraw): Set<string> {
  const hidden = new Set<string>();
  for (const card of cards) {
    if (!cardMatches(card, filters, draw)) hidden.add(card.id);
  }
  return hidden;
}
