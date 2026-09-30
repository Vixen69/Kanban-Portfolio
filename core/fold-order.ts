// The order the event log is read in (the fold, the Délais, the time per
// stage): by timestamp, then by log sequence for same-instant events —
// with ONE exception: a card's creation event — the `imported` or
// `created` the log wrote FIRST for that card (lowest sequence) — is
// always read before that card's other events, whatever its timestamp. Loads written before ADR 058 dated the
// `imported` event at the project's « Début », sometimes still to come:
// read by timestamp alone, such a card sat in its entry column and every
// later hand move stayed invisible until that date (ADR 058 amendment,
// 2026-09-30). The creation is hoisted to just before the card's first
// other event; every other event keeps its place. An `imported` written
// AFTER other events of the card (a re-import of a legacy log, a test
// shape) is not a birth: it is read at its timestamp, as before. Pure.

import type { CardEvent } from "./types.ts";
import { eventSequence } from "./event-sequence.ts";

/**
 * Oldest first: timestamp, then the log sequence for same-instant events.
 * Inputs: two events. Output: a sort comparison number. Failure: none.
 */
export function oldestFirst(a: CardEvent, b: CardEvent): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  return eventSequence(a.id) - eventSequence(b.id);
}

function isCreation(event: CardEvent): boolean {
  return event.type === "imported" || event.type === "created";
}

// Per card, its birth: the card's first event by log sequence (the first
// met on a tie), kept only when it is a creation. An import doubt settled
// before the project entered the board (`settled`, ADR 062) is no event
// of the card's life: it never hides the birth that follows.
function creations(events: readonly CardEvent[]): Map<string, CardEvent> {
  const first = new Map<string, CardEvent>();
  for (const event of events) {
    if (event.type === "settled") continue;
    const seen = first.get(event.cardId);
    if (seen === undefined || eventSequence(event.id) < eventSequence(seen.id)) first.set(event.cardId, event);
  }
  for (const [cardId, event] of first) if (!isCreation(event)) first.delete(cardId);
  return first;
}

/**
 * Moves each card's creation event to just before that card's first
 * other event, when it stood later (a future-dated `imported` of an old
 * log). A card without creation event, and every other event, keep the
 * given order. Idempotent.
 * Input: events already in timestamp order (oldestFirst, or a caller's
 * own equivalent). Output: a new array. Failure: none.
 */
export function creationFirst(sorted: readonly CardEvent[]): CardEvent[] {
  const born = creations(sorted);
  const placed = new Set<string>();
  const out: CardEvent[] = [];
  for (const event of sorted) {
    const creation = born.get(event.cardId);
    if (creation === undefined) {
      out.push(event);
      continue;
    }
    if (!placed.has(event.cardId)) {
      placed.add(event.cardId);
      out.push(creation);
    }
    if (event !== creation) out.push(event);
  }
  return out;
}

/**
 * The events in the order the fold reads them: oldest first
 * (oldestFirst), each card's creation first (creationFirst).
 * Input: events (any order; the caller filters restores first).
 * Output: a new array. Failure: none.
 */
export function foldOrder(events: readonly CardEvent[]): CardEvent[] {
  return creationFirst([...events].sort(oldestFirst));
}
