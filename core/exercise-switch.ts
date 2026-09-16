// The year switch (ADR 035/038, author 2026-09-16: « l'année dernière est
// archivée, on passe d'année »). Computes the events the switch writes, in
// the order the fold needs: (1) every card without an exercise is PINNED on
// the closing year (edited { exercise }) — before the current year changes
// under it, or it would follow the new one; (2) every active card of the
// closing year is ARCHIVED (its board stays readable as a closed year);
// (3) every card of the new year is ACTIVATED — its aging clock starts
// today. Nothing is deleted, nothing moves. Pure; no React, no Node.

import type { CardState } from "./types.ts";
import type { CardEventInput } from "./events.ts";
import { lifecycleEvent } from "./events.ts";
import { exerciseOf } from "./exercise.ts";

/** What a switch writes, and how many cards each step touches. */
export interface SwitchPlan {
  events: CardEventInput[];
  /** Cards stored without exercise, pinned on the closing year. */
  pinned: number;
  /** Active cards of the closing year, archived. */
  archived: number;
  /** Cards of the new year whose clock starts. */
  activated: number;
}

/**
 * The events that make `nextYear` the current exercise.
 * Inputs: the folded card states (archived included, deleted excluded), the
 * closing (current) year, the next year, the actor, the timestamp.
 * Output: the SwitchPlan — nothing is written here. Failure: none; the
 * caller checks that nextYear is the year after currentYear.
 */
export function switchPlan(
  cards: readonly CardState[], currentYear: number, nextYear: number, actor: string, ts: string,
): SwitchPlan {
  const plan: SwitchPlan = { events: [], pinned: 0, archived: 0, activated: 0 };
  for (const card of cards) {
    if (card.exercise === undefined) {
      plan.events.push(lifecycleEvent("edited", card.id, actor, ts, { patch: { exercise: currentYear }, reason: "bascule" }));
      plan.pinned++;
    }
  }
  for (const card of cards) {
    const year = exerciseOf(card, currentYear);
    if (year === currentYear && !card.archived) {
      plan.events.push(lifecycleEvent("archived", card.id, actor, ts, { reason: "bascule" }));
      plan.archived++;
    } else if (year === nextYear) {
      plan.events.push(lifecycleEvent("activated", card.id, actor, ts));
      plan.activated++;
    }
  }
  return plan;
}
