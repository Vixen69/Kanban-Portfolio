// React state wrapper around core/filters.ts. All semantics live in core;
// this hook only holds the FilterState and exposes the sidebar's actions.

import { useCallback, useMemo, useState } from "react";
import type { BoardConfig } from "../core/types.ts";
import { defaultFilters, isFilterActive, type FilterGroup, type FilterState } from "../core/filters.ts";

/** Filter state + the actions the sidebar binds to its controls. */
export interface Filters {
  state: FilterState;
  active: boolean;
  setSearch: (search: string) => void;
  /** Toggles one pill of a togglable group (domains/types/natures/crits). */
  toggle: (group: FilterGroup, key: string) => void;
  /** Sets every pill of a group at once (the tout/rien quick actions). */
  setAll: (group: FilterGroup, enabled: boolean) => void;
  setOwner: (owner: string | null) => void;
  toggleBlockedOnly: () => void;
  setMinAge: (days: number | null) => void;
  reset: () => void;
}

/**
 * Holds the sidebar filter state for one board.
 * Input: the validated board config (domain/type/nature lists).
 * Output: a Filters bundle. Failure: none.
 */
export function useFilters(config: BoardConfig): Filters {
  const [state, setState] = useState<FilterState>(() => defaultFilters(config));

  const setSearch = useCallback((search: string) => {
    setState((s) => ({ ...s, search }));
  }, []);
  const toggle = useCallback((group: FilterGroup, key: string) => {
    setState((s) => ({ ...s, [group]: { ...s[group], [key]: s[group][key] === false } }));
  }, []);
  const setAll = useCallback((group: FilterGroup, enabled: boolean) => {
    setState((s) => ({
      ...s,
      [group]: Object.fromEntries(Object.keys(s[group]).map((key) => [key, enabled])),
    }));
  }, []);
  const setOwner = useCallback((owner: string | null) => {
    setState((s) => ({ ...s, owner }));
  }, []);
  const toggleBlockedOnly = useCallback(() => {
    setState((s) => ({ ...s, blockedOnly: !s.blockedOnly }));
  }, []);
  const setMinAge = useCallback((days: number | null) => {
    setState((s) => ({ ...s, minAgeDays: days }));
  }, []);
  const reset = useCallback(() => setState(defaultFilters(config)), [config]);

  const active = useMemo(() => isFilterActive(state), [state]);
  return { state, active, setSearch, toggle, setAll, setOwner, toggleBlockedOnly, setMinAge, reset };
}
