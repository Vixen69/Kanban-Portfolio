// React state wrapper around core/filters.ts. All semantics live in core;
// this hook only holds the FilterState and exposes the sidebar's actions
// (search, per-pill toggle, tout/rien, reset).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardConfig } from "../core/types.ts";
import {
  defaultFilters,
  isFilterActive,
  type FilterGroup,
  type FilterState,
} from "../core/filters.ts";

/** Filter state + the actions the sidebar binds to its controls. */
export interface Filters {
  state: FilterState;
  /** True when a search or any toggled-off pill narrows the board. */
  active: boolean;
  setSearch(search: string): void;
  /** Toggles one pill of a group (type / nature / crit / domain). */
  toggle(group: FilterGroup, key: string): void;
  /** Sets every pill of a group at once (the tout / rien quick actions). */
  setGroup(group: FilterGroup, value: boolean): void;
  /** Back to the full portfolio: clears search, re-enables every pill. */
  reset(): void;
}

// The group maps, read and written under their common shape. The cast is
// sound: NatureKey/Criticality keys are strings, and cardMatches treats a
// missing key as enabled (the design's `!== false` convention).
function groupOf(state: FilterState, group: FilterGroup): Record<string, boolean> {
  return state[group] as Record<string, boolean>;
}

// Rebuilds the config-derived groups (type, domain) after an admin config
// change: known keys keep their state, new keys start enabled.
function reconcile(state: FilterState, config: BoardConfig): FilterState {
  const keep = (ids: string[], previous: Record<string, boolean>) =>
    Object.fromEntries(ids.map((id) => [id, previous[id] !== false]));
  return {
    ...state,
    type: keep(config.types.map((type) => type.id), state.type),
    domain: keep(config.domains.map((domain) => domain.id), state.domain),
  };
}

/**
 * Holds the sidebar filter state for one board.
 * Input: the runtime board config (type/domain id lists); when the config
 * object changes (admin apply), the groups are reconciled to its lists.
 * Output: a Filters bundle. Failure: none.
 */
export function useFilters(config: BoardConfig): Filters {
  const [state, setState] = useState<FilterState>(() => defaultFilters(config));
  useEffect(() => {
    setState((current) => reconcile(current, config));
  }, [config]);

  const setSearch = useCallback((search: string) => {
    setState((current) => ({ ...current, search }));
  }, []);
  const toggle = useCallback((group: FilterGroup, key: string) => {
    setState((current) => {
      const pills = groupOf(current, group);
      return { ...current, [group]: { ...pills, [key]: pills[key] === false } };
    });
  }, []);
  const setGroup = useCallback((group: FilterGroup, value: boolean) => {
    setState((current) => {
      const keys = Object.keys(groupOf(current, group));
      return { ...current, [group]: Object.fromEntries(keys.map((key) => [key, value])) };
    });
  }, []);
  const reset = useCallback(() => setState(defaultFilters(config)), [config]);

  const active = useMemo(() => isFilterActive(state), [state]);
  return { state, active, setSearch, toggle, setGroup, reset };
}
