// The append-only event log: audit trail AND single source of flow truth.
// InMemoryEventStore backs core tests and the fixtures generator; the middle
// persists the same event shape behind the BoardStorage port.

import type { CardEvent, CardEventType } from "./types.ts";

/** Input for appending: the store assigns id and keeps insertion order. */
export type CardEventInput = Omit<CardEvent, "id">;

/**
 * In-memory append-only event store. Events can be appended and read,
 * never updated, never deleted. Listeners are notified after each append.
 */
export class InMemoryEventStore {
  private readonly events: CardEvent[] = [];
  private readonly listeners = new Set<() => void>();
  private nextId = 1;

  /**
   * Appends one event and returns the stored, frozen copy. The payload is
   * copied and frozen too, so later mutations of the caller's object can
   * never rewrite history.
   * Input: a CardEventInput (ts, actor, cardId, type, columns, payload).
   * Output: the stored CardEvent with its assigned id.
   * Failure: none — appends are unconditional by design.
   */
  append(input: CardEventInput): CardEvent {
    const event: CardEvent = Object.freeze({
      ...input,
      payload: Object.freeze({ ...input.payload }),
      id: `evt-${this.nextId++}`,
    });
    this.events.push(event);
    for (const listener of this.listeners) listener();
    return event;
  }

  /**
   * Returns a snapshot of all events in append order.
   * Output: a fresh array — mutating it never affects the store.
   */
  list(): CardEvent[] {
    return this.events.slice();
  }

  /** Number of events currently in the log. */
  size(): number {
    return this.events.length;
  }

  /**
   * Registers a listener called after every append.
   * Output: an unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * Builds a "moved" event input.
 * Inputs: card id, lane/column before and after, actor, timestamp.
 * Output: a CardEventInput recording the move. Columns travel first-class
 * (fromColumn/toColumn); lanes travel in the payload — "laneId" is the
 * destination lane read back by foldEvents, "fromLaneId" is kept for the
 * audit trail only.
 * Failure: none.
 */
export function movedEvent(
  cardId: string,
  from: { laneId: string; columnId: string },
  to: { laneId: string; columnId: string },
  actor: string,
  ts: string,
): CardEventInput {
  return {
    ts,
    actor,
    cardId,
    type: "moved",
    fromColumn: from.columnId,
    toColumn: to.columnId,
    payload: { fromLaneId: from.laneId, laneId: to.laneId },
  };
}

/**
 * Builds a lifecycle event input (created / imported / blocked / unblocked /
 * edited / commented / deleted) without column transition.
 * Inputs: event type (any type but "moved"), card id, actor, timestamp, and
 * an optional payload — { reason } for blocked, { patch } for edited,
 * { text } for commented, { laneId } (plus a toColumn set by the caller on
 * the stored input) for created/imported, {} for unblocked/deleted.
 * Output: a CardEventInput with fromColumn/toColumn set to null.
 * Failure: none.
 */
export function lifecycleEvent(
  type: Exclude<CardEventType, "moved">,
  cardId: string,
  actor: string,
  ts: string,
  payload: Record<string, unknown> = {},
): CardEventInput {
  return { ts, actor, cardId, type, fromColumn: null, toColumn: null, payload };
}
