// The board's sort (ADR 044): a view chosen in the sidebar — the board's
// own order, the reste à faire (on the métiers the gutter's lens counts,
// ADR 048 — the lens replaced the former « par métier » key), or the
// meilleur estimé, ascending or descending. Session state only: nothing is
// written, the manual order (ADR 019) comes back when the sort is cleared.

import { useCallback, useMemo, useState } from "react";
import type { BoardConfig, CardState } from "../core/types.ts";
import { BOARD_ORDER, isSortActive, sortCards, type CardSort, type SortDirection, type SortKey } from "../core/card-sort.ts";
import { hasBreakdown } from "../core/raf-card.ts";
import { scopeLabel } from "./rafLabels.ts";
import type { BoardLens } from "./useRafLens.ts";

/** The sort and its setters, as the sidebar and the header drive it. */
export interface CardSorting {
  sort: CardSort;
  /** True when the sort reorders the board (core isSortActive). */
  active: boolean;
  setKey: (key: SortKey) => void;
  setDirection: (direction: SortDirection) => void;
  /** Back to the board's own order (the direction is kept for next time). */
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
  const clear = useCallback(() => setSort((current) => ({ ...current, key: "board" })), []);
  return useMemo(
    () => ({ sort, active: isSortActive(sort), setKey, setDirection, clear }),
    [sort, setKey, setDirection, clear],
  );
}

/**
 * The cards in the sort's order; the same array when no sort is active, so
 * nothing re-renders for it.
 * Inputs: the cards in board order, the sort, the métiers the « reste à
 * faire » key counts (the lens's — ADR 048: an unknown métier never
 * counts). Output: the cards to show. Failure modes: none.
 */
export function useSortedCards(cards: CardState[], sort: CardSort, counted: ReadonlySet<string>): CardState[] {
  return useMemo(() => (isSortActive(sort) ? sortCards(cards, sort, counted) : cards), [cards, sort, counted]);
}

/** What the sidebar's section and the header's chip read. */
export interface SortPanel {
  /** Cards shown without any per-métier plan: the « reste à faire » sort cannot rank them. */
  blind: number;
  /** « reste à faire · décroissant »… null when no sort is active. */
  label: string | null;
  /** The header chip's text, null when no sort is active. */
  chip: string | null;
  /** The métiers the « reste à faire » counts in words, null when the lens is off. */
  scope: string | null;
}

// The French name of what the board is sorted by: while the lens narrows
// the métiers, the reste à faire says so — the lens chip beside it names
// them (ADR 048).
function sortedBy(sort: CardSort, scope: string | null): string {
  if (sort.key === "estimate") return "meilleur estimé";
  return scope === null ? "reste à faire" : "reste à faire (métiers cochés)";
}

/**
 * The sort's read-out over the cards the filters keep.
 * Inputs: the board's cards, the ids the filters hide, the config, the
 * sort, the lens. Output: the SortPanel (memoised). Failure modes: none.
 */
export function useSortPanel(
  cards: CardState[], hidden: ReadonlySet<string>, config: BoardConfig, sort: CardSort, lens: BoardLens,
): SortPanel {
  return useMemo(() => {
    const shown = cards.filter((card) => !hidden.has(card.id));
    const blind = shown.filter((card) => !hasBreakdown(card)).length;
    const scope = lens.active ? scopeLabel(lens.scope, config) : null;
    if (!isSortActive(sort)) return { blind, label: null, chip: null, scope };
    const label = `${sortedBy(sort, scope)} · ${sort.direction === "desc" ? "décroissant" : "croissant"}`;
    // The « reste à faire » (ADR 048: no fallback on the card effort)
    // cannot rank a card without a per-métier plan: the chip says how many.
    const unranked = sort.key === "remaining" && blind > 0 ? ` · ${blind} sans ventilation` : "";
    return { blind, label, chip: `Trié par ${label}${unranked}`, scope };
  }, [cards, hidden, config, sort, lens.active, lens.scope]);
}
