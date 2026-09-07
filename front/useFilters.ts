// React state wrapper around core/filters.ts. All semantics live in core;
// this hook only holds the FilterState and exposes the sidebar's actions
// (search, per-pill toggle, tout/rien, reset). The domain group is the one
// exception routed through core helpers: a domain pill drags its
// sub-domains along (withDomainToggled / withDomainsSet, ADR 022).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardConfig } from "../core/types.ts";
import {
  defaultFilters,
  isFilterActive,
  subDomainKey,
  withDomainToggled,
  withDomainsSet,
  type FilterGroup,
  type FilterState,
} from "../core/filters.ts";

/** Filter state + the actions the sidebar binds to its controls. */
export interface Filters {
  state: FilterState;
  /** True when a search, blockedOnly or a toggled-off pill narrows the board. */
  active: boolean;
  setSearch(search: string): void;
  /** Flips the « Bloqués uniquement » toggle (design v11). */
  toggleBlockedOnly(): void;
  /** Flips the « Aucune » pill of the Contrainte group (design v12). */
  toggleNoConstraint(): void;
  /** Toggles one pill of a group; a domain pill aligns its sub-domains. */
  toggle(group: FilterGroup, key: string): void;
  /** Sets every pill of a group at once (the tout / rien quick actions). */
  setGroup(group: FilterGroup, value: boolean): void;
  /** Back to the full portfolio: clears search, re-enables every pill. */
  reset(): void;
}

// The group maps, read and written under their common shape. The cast is
// sound: Criticality keys are strings, and cardMatches treats a missing
// key as enabled (the design's `!== false` convention).
function groupOf(state: FilterState, group: FilterGroup): Record<string, boolean> {
  return state[group] as Record<string, boolean>;
}

// Rebuilds the config-derived groups (type, domain, sub-domain, constraint)
// after an admin config change: known keys keep their state, new keys start
// enabled. `noConstraint` is deliberately untouched — it is not config
// data, so no topology edit can invalidate it.
function reconcile(state: FilterState, config: BoardConfig): FilterState {
  const keep = (ids: string[], previous: Record<string, boolean>) =>
    Object.fromEntries(ids.map((id) => [id, previous[id] !== false]));
  const subKeys = config.domains.flatMap((domain) =>
    (domain.subDomains ?? []).map((sub) => subDomainKey(domain.id, sub.id)));
  return {
    ...state,
    type: keep(config.types.map((type) => type.id), state.type),
    domain: keep(config.domains.map((domain) => domain.id), state.domain),
    subDomain: keep(subKeys, state.subDomain),
    constraint: keep(config.projectConstraints.map((entry) => entry.id), state.constraint),
  };
}

/**
 * Holds the sidebar filter state for one board.
 * Input: the runtime board config (type/domain/sub-domain id lists); when
 * the config object changes (admin apply), the groups are reconciled to
 * its lists. Output: a Filters bundle. Failure: none.
 */
export function useFilters(config: BoardConfig): Filters {
  const [state, setState] = useState<FilterState>(() => defaultFilters(config));
  useEffect(() => {
    setState((current) => reconcile(current, config));
  }, [config]);

  const setSearch = useCallback((search: string) => {
    setState((current) => ({ ...current, search }));
  }, []);
  const toggleBlockedOnly = useCallback(() => {
    setState((current) => ({ ...current, blockedOnly: !current.blockedOnly }));
  }, []);
  const toggleNoConstraint = useCallback(() => {
    setState((current) => ({ ...current, noConstraint: !current.noConstraint }));
  }, []);
  const toggle = useCallback((group: FilterGroup, key: string) => {
    setState((current) => {
      if (group === "domain") return withDomainToggled(current, config, key);
      const pills = groupOf(current, group);
      return { ...current, [group]: { ...pills, [key]: pills[key] === false } };
    });
  }, [config]);
  const setGroup = useCallback((group: FilterGroup, value: boolean) => {
    setState((current) => {
      if (group === "domain") return withDomainsSet(current, value);
      const keys = Object.keys(groupOf(current, group));
      return { ...current, [group]: Object.fromEntries(keys.map((key) => [key, value])) };
    });
  }, []);
  const reset = useCallback(() => setState(defaultFilters(config)), [config]);

  const active = useMemo(() => isFilterActive(state), [state]);
  return { state, active, setSearch, toggleBlockedOnly, toggleNoConstraint, toggle, setGroup, reset };
}
