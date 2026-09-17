// Snapshot restores (ADR 042). A restore never removes anything from the
// log: it appends ONE `restored` event that says « back to position N »
// (the sequence number the snapshot was taken at). The board is then read
// through this filter — the events written after that position and before
// the restore are UNDONE (kept in the log, dropped from the reading), and
// the events written after the restore apply again. Restores nest: a
// restore to a position that was itself reached by a restore is read the
// same way, recursively.

import type { CardEvent } from "./types.ts";
import { eventSequence } from "./event-sequence.ts";

/** The card id a `restored` event carries: it is a board-wide event. */
export const RESTORE_CARD_ID = "*";

/**
 * The position a `restored` event goes back to, when it is a valid one:
 * an integer sequence number, non-negative, strictly before the event's
 * own sequence. Any other value — or another event type — gives null and
 * the event is read as a no-op.
 * Input: one event. Output: the target sequence or null. Failure: none.
 */
export function restoreTarget(event: CardEvent): number | null {
  if (event.type !== "restored") return null;
  const toSeq = event.payload["toSeq"];
  if (typeof toSeq !== "number" || !Number.isInteger(toSeq) || toSeq < 0) return null;
  return toSeq < eventSequence(event.id) ? toSeq : null;
}

// The valid restore with the highest sequence number, or null.
function lastRestore(events: readonly CardEvent[]): { seq: number; target: number } | null {
  let found: { seq: number; target: number } | null = null;
  for (const event of events) {
    const target = restoreTarget(event);
    if (target === null) continue;
    const seq = eventSequence(event.id);
    if (found === null || seq > found.seq) found = { seq, target };
  }
  return found;
}

/**
 * The events the board is read from: the log minus what restores undid,
 * minus the `restored` events themselves. Without any restore, the log as
 * given (in its order). Idempotent — reading the result again changes
 * nothing.
 * Input: events of one log (any order; sequence numbers decide).
 * Output: a new array, the kept events in their input order.
 * Failure: none.
 */
export function effectiveEvents(events: readonly CardEvent[]): CardEvent[] {
  const restore = lastRestore(events);
  if (restore === null) return events.filter((event) => event.type !== "restored");
  const before = events.filter((event) => eventSequence(event.id) <= restore.target);
  const after = events.filter((event) => eventSequence(event.id) > restore.seq && event.type !== "restored");
  return [...effectiveEvents(before), ...after];
}

/**
 * The events a restore undid: in the log, no longer read. The fiche's
 * Historique says so for the card's own ones.
 * Input: events of one log. Output: the undone events, input order.
 * Failure: none.
 */
export function undoneEvents(events: readonly CardEvent[]): CardEvent[] {
  const kept = new Set(effectiveEvents(events).map((event) => event.id));
  return events.filter((event) => event.type !== "restored" && !kept.has(event.id));
}
