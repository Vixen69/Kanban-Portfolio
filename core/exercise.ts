// Exercises (ADR 035, author 2026-09-16): the board shows one budget year
// at a time. `config.exercise.year` is the CURRENT exercise — the main
// board; a card carries its own `exercise`, and its status follows from
// the comparison alone (no extra state): a past year is CLOSED (read-only,
// ages frozen), the current year is the main board, a future year is in
// PREPARATION — importable and editable, but its aging clock is frozen
// until the year is activated (the `activated` event restarts the clock).
// Cards stored before ADR 035 carry no exercise: they belong to the
// current one, whatever it is. Pure; no React, no Node.

import type { Card, CardState } from "./types.ts";

/** Where a year stands against the current exercise. */
export type ExerciseStatus = "closed" | "current" | "preparing";

/**
 * The exercise a card belongs to: its own, else the current one (cards
 * stored before ADR 035).
 * Inputs: the card, the current exercise year. Output: the year. Failure: none.
 */
export function exerciseOf(card: Card, currentYear: number): number {
  return card.exercise ?? currentYear;
}

/**
 * The status of a year against the current exercise.
 * Inputs: the year, the current exercise year. Output: closed / current /
 * preparing. Failure: none.
 */
export function exerciseStatus(year: number, currentYear: number): ExerciseStatus {
  if (year < currentYear) return "closed";
  return year > currentYear ? "preparing" : "current";
}

/**
 * True when the card's aging clock must not run: its exercise is still in
 * preparation (the year is not open yet).
 * Inputs: the card, the current exercise year. Output: boolean. Failure: none.
 */
export function isClockFrozen(card: Card, currentYear: number): boolean {
  return exerciseOf(card, currentYear) > currentYear;
}

/**
 * The board id of one project's instance in one exercise (author,
 * 2026-09-16): the same PE code lives again next year as ANOTHER card,
 * re-budgeted — « code@année ». Cards stored before ADR 035 keep their
 * bare id (hasExerciseSuffix says which).
 * Inputs: the base id (PE code or slug), the year. Output: the id. Failure: none.
 */
export function instanceId(base: string, year: number): string {
  return `${base}@${year}`;
}

/**
 * True when a card id carries its exercise suffix (instanceId); ids stored
 * before ADR 035 do not and belong to the current exercise.
 * Input: the id. Output: boolean. Failure: none.
 */
export function hasExerciseSuffix(id: string): boolean {
  return /@\d{4}$/.test(id);
}

/**
 * Every exercise year the board knows: the current one and every year a
 * card carries, ascending.
 * Inputs: the cards, the current exercise year. Output: the years. Failure: none.
 */
export function exerciseYears(cards: readonly Card[], currentYear: number): number[] {
  const years = new Set<number>([currentYear]);
  for (const card of cards) years.add(exerciseOf(card, currentYear));
  return [...years].sort((a, b) => a - b);
}

/**
 * The years the header's selector offers (author, 2026-09-16): the years
 * before the current one, the current one, the years after, plus every
 * year a card carries — ascending, without duplicates.
 * Inputs: the cards, the current exercise year, how many years before and
 * after. Output: the years. Failure: none.
 */
export function selectableYears(cards: readonly Card[], currentYear: number, before = 5, after = 5): number[] {
  const years = new Set<number>(exerciseYears(cards, currentYear));
  for (let year = currentYear - before; year <= currentYear + after; year++) years.add(year);
  return [...years].sort((a, b) => a - b);
}

/**
 * How many cards each exercise holds (the selector's hint).
 * Inputs: the cards, the current exercise year. Output: year -> count.
 * Failure: none.
 */
export function cardCountsByYear(cards: readonly Card[], currentYear: number): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const year = exerciseOf(card, currentYear);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return counts;
}

/**
 * The cards of one exercise — what that year's board shows.
 * Inputs: the folded cards, the year, the current exercise year.
 * Output: the cards whose exercise is that year, in input order. Failure: none.
 */
export function cardsOfExercise<T extends CardState>(cards: readonly T[], year: number, currentYear: number): T[] {
  return cards.filter((card) => exerciseOf(card, currentYear) === year);
}
