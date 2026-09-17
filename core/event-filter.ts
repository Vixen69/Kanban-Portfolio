// The storage's event filter, applied in memory (ADR 040): the JSONL driver
// and the test stubs keep the whole log in memory and filter it here; the
// Postgres driver turns the same filter into a WHERE clause. Pure.

import type { EventFilter } from "./ports.ts";
import type { CardEvent } from "./types.ts";
import { eventSequence } from "./state.ts";

/**
 * The events a filter keeps: those strictly after `afterSeq` (the
 * incremental refresh), and/or those of `cardIds` (the per-action
 * validation fold). No filter = every event.
 * Inputs: the events in append order, the filter. Output: the kept events,
 * order preserved. Failure: none.
 */
export function filterEvents(events: readonly CardEvent[], filter: EventFilter): CardEvent[] {
  const ids = filter.cardIds === undefined ? null : new Set(filter.cardIds);
  const after = filter.afterSeq ?? -1;
  return events.filter((event) => (ids === null || ids.has(event.cardId)) && eventSequence(event.id) > after);
}
