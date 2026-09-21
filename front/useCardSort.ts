// The board's sort (ADR 044): a view chosen in the sidebar — the board's
// own order, the reste à faire, the meilleur estimé, or the reste à faire
// of chosen métiers, ascending or descending. Session state only: nothing
// is written, the manual order (ADR 019) comes back when the sort is
// cleared.

import { useCallback, useMemo, useState } from "react";
import type { BoardConfig, CardState } from "../core/types.ts";
import {
  BOARD_ORDER, isSortActive, profileRemainingTotals, sortCards, withoutBreakdown,
  type CardSort, type ProfileTotal, type SortDirection, type SortKey,
} from "../core/card-sort.ts";

/** The sort and its setters, as the sidebar and the header drive it. */
export interface CardSorting {
  sort: CardSort;
  /** True when the sort reorders the board (core isSortActive). */
  active: boolean;
  setKey: (key: SortKey) => void;
  setDirection: (direction: SortDirection) => void;
  /** Checks or unchecks one métier — and makes the sort a métier sort. */
  toggleProfile: (profileId: string) => void;
  /** Back to the board's own order (the chosen métiers are kept for next time). */
  clear: () => void;
}

/**
 * The sort state of the board.
 * Output: the CardSorting. Failure modes: none.
 */
export function useCardSort(): CardSorting {
  const [sort, setSort] = useState<CardSort>(BOARD_ORDER);
  const setKey = useCallback((key: SortKey) => setSort((current) => ({ ...current, key })), []);
  const setDirection = useCallback((direction: SortDirection) => setSort((current) => ({ ...current, direction })), []);
  const toggleProfile = useCallback((profileId: string) => setSort((current) => {
    const kept = current.profileIds.filter((id) => id !== profileId);
    const profileIds = kept.length === current.profileIds.length ? [...kept, profileId] : kept;
    return { ...current, key: "profiles", profileIds };
  }), []);
  const clear = useCallback(() => setSort((current) => ({ ...current, key: "board" })), []);
  return useMemo(
    () => ({ sort, active: isSortActive(sort), setKey, setDirection, toggleProfile, clear }),
    [sort, setKey, setDirection, toggleProfile, clear],
  );
}

/**
 * The cards in the sort's order; the same array when no sort is active, so
 * nothing re-renders for it.
 * Inputs: the cards in board order, the sort. Output: the cards to show.
 * Failure modes: none.
 */
export function useSortedCards(cards: CardState[], sort: CardSort): CardState[] {
  return useMemo(() => (isSortActive(sort) ? sortCards(cards, sort) : cards), [cards, sort]);
}

/** What the sidebar's section and the header's chip read. */
export interface SortPanel {
  /** The métiers with a reste à faire on the cards shown, largest first. */
  totals: ProfileTotal[];
  /** Cards shown without any per-métier plan: a métier sort cannot rank them. */
  blind: number;
  /** « reste à faire · décroissant »… null when no sort is active. */
  label: string | null;
  /** The header chip's text, null when no sort is active. */
  chip: string | null;
}

// The French name of what the board is sorted by.
function sortedBy(sort: CardSort, config: BoardConfig): string {
  if (sort.key === "remaining") return "reste à faire";
  if (sort.key === "estimate") return "meilleur estimé";
  const names = sort.profileIds.map((id) => config.profiles.find((profile) => profile.id === id)?.name ?? id);
  return `RAF ${names.length <= 2 ? names.join(" + ") : `${names.length} métiers`}`;
}

/**
 * The sort's read-out over the cards the filters keep.
 * Inputs: the board's cards, the ids the filters hide, the config, the sort.
 * Output: the SortPanel (memoised). Failure modes: none.
 */
export function useSortPanel(cards: CardState[], hidden: ReadonlySet<string>, config: BoardConfig, sort: CardSort): SortPanel {
  return useMemo(() => {
    const shown = cards.filter((card) => !hidden.has(card.id));
    const blind = withoutBreakdown(shown);
    const totals = profileRemainingTotals(shown, config);
    if (!isSortActive(sort)) return { totals, blind, label: null, chip: null };
    const label = `${sortedBy(sort, config)} · ${sort.direction === "desc" ? "décroissant" : "croissant"}`;
    const unranked = sort.key === "profiles" && blind > 0 ? ` · ${blind} sans ventilation` : "";
    return { totals, blind, label, chip: `Trié par ${label}${unranked}` };
  }, [cards, hidden, config, sort]);
}
