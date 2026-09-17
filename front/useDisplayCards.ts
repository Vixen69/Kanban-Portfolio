// The cards the board shows: those of ONE exercise (ADR 035 — the year the
// header's selector points at), remapped for display when an admin edit
// removed their lane/column/domain/type (ADR 013: the card is shown
// against the first config entry so the whole portfolio stays visible;
// never an event, the fold keeps the original references). The nature is
// derived from the (remapped) canal (ADR 018: nature is positional).

import { useEffect, useMemo, useState } from "react";
import type { BoardConfig, CardState } from "../core/types.ts";
import { portfolioStats } from "../core/board.ts";
import { laneNature, reconcileCardRefs } from "../core/config.ts";
import { cardCountsByYear, cardsOfExercise, selectableYears } from "../core/exercise.ts";
import { hiddenCardIds, portfolioCounts, viewCounts, type ResourceDraw } from "../core/filters.ts";
import type { YearPickerProps } from "./components/YearPicker.tsx";
import type { Filters } from "./useFilters.ts";

/**
 * The filter and count projections over the board's cards (all from
 * core/): the hidden ids, the counts over the visible subset, the
 * whole-portfolio counts and stats.
 * Inputs: the active cards, the config, the filters, now, the resource
 * draw of the exercise shown (ADR 041). Output: the projections (memoised).
 * Failure modes: none.
 */
export function useDerived(cards: CardState[], config: BoardConfig, filters: Filters, now: Date, draw: ResourceDraw) {
  const hidden = useMemo(() => hiddenCardIds(cards, filters.state, draw), [cards, filters.state, draw]);
  const view = useMemo(() => viewCounts(cards, hidden, config, now), [cards, hidden, config, now]);
  const all = useMemo(() => portfolioCounts(cards, config, now), [cards, config, now]);
  const stats = useMemo(() => portfolioStats(cards), [cards]);
  return { hidden, view, all, stats };
}

/**
 * The exercise the header points at: the current one until the selector
 * says otherwise, with the selector's data (years offered, card counts).
 * Inputs: every folded card, the current exercise year.
 * Output: the year shown and the YearPicker props (memoised).
 * Failure modes: none.
 */
export function useExerciseShown(cards: CardState[], currentYear: number): { viewYear: number; exercise: YearPickerProps } {
  const [viewYear, setViewYear] = useState(currentYear);
  // The switch moved the current exercise: follow it (the old year is closed now).
  useEffect(() => { setViewYear(currentYear); }, [currentYear]);
  const exercise = useMemo<YearPickerProps>(() => ({
    year: viewYear, years: selectableYears(cards, currentYear), currentYear,
    counts: cardCountsByYear(cards, currentYear), onYear: setViewYear,
  }), [viewYear, cards, currentYear]);
  return { viewYear, exercise };
}

/**
 * The display cards of one exercise.
 * Inputs: every folded card, the runtime config, the exercise year shown.
 * Output: that year's cards, remapped for display (memoised).
 * Failure modes: none.
 */
export function useDisplayCards(cards: CardState[], config: BoardConfig, year: number): CardState[] {
  return useMemo(() => cardsOfExercise(cards, year, config.exercise.year).map((card) => {
    const refs = reconcileCardRefs(card, config);
    const nature = laneNature(config, refs.laneId);
    const unchanged =
      refs.laneId === card.laneId && refs.columnId === card.columnId &&
      refs.domain === card.domain && refs.typeId === card.typeId &&
      refs.subDomain === card.subDomain && nature === card.nature;
    return unchanged ? card : { ...card, ...refs, nature };
  }), [cards, config, year]);
}
