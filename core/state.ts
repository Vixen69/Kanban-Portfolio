// Replays the event log over imported subjects to produce the live board.
// The event log is the truth: position, blocked state and time-in-column
// are all derived here, never stored elsewhere.

import type { Card, CardEvent, CardState, Financials } from "./types.ts";
import type { Subject } from "./ports.ts";

// Validators of the fields an "edited" event may patch (CardPatch).
// Anything else in the payload is silently ignored — replays must never
// corrupt state because one historic event carried garbage.
const isStringOrNull = (value: unknown) => typeof value === "string" || value === null;
const isNumberOrNull = (value: unknown) =>
  value === null || (typeof value === "number" && Number.isFinite(value));
const EDITABLE: Record<string, (value: unknown) => boolean> = {
  title: (value) => typeof value === "string" && value.length > 0,
  owner: (value) => typeof value === "string",
  domain: (value) => typeof value === "string" && value.length > 0,
  criticality: (value) => value === "top" || value === "major" || value === "normal",
  typeId: isStringOrNull,
  codename: isStringOrNull,
  tags: (value) => Array.isArray(value) && value.every((tag) => typeof tag === "string"),
  budget: isNumberOrNull,
  consumed: isNumberOrNull,
  remaining: isNumberOrNull,
};

/**
 * Combines a subject with its financials into a full Card.
 * Inputs: a Subject from a data source, its Financials (or null).
 * Output: a Card with budget/consumed/remaining filled (null when unknown).
 * Failure: none.
 */
export function toCard(subject: Subject, financials: Financials | null): Card {
  return {
    ...subject,
    budget: financials?.budget ?? null,
    consumed: financials?.consumed ?? null,
    remaining: financials?.remaining ?? null,
  };
}

function applyMoved(state: CardState, event: CardEvent): void {
  if (event.toColumn !== null) state.columnId = event.toColumn;
  const toLane = event.payload["toLane"];
  if (typeof toLane === "string") state.laneId = toLane;
  state.enteredColumnAt = event.ts;
}

function applyBlocked(state: CardState, event: CardEvent): void {
  state.blocked = true;
  const reason = event.payload["reason"];
  state.blockedReason = typeof reason === "string" ? reason : null;
  state.blockedSince = event.ts;
}

function applyEdited(state: CardState, event: CardEvent): void {
  const patch = event.payload["patch"];
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return;
  for (const [key, value] of Object.entries(patch)) {
    const accepts = EDITABLE[key];
    if (accepts && accepts(value)) {
      // The whitelist above guarantees the value matches the field's type.
      (state as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

function applyEvent(state: CardState, event: CardEvent): void {
  switch (event.type) {
    case "moved":
      applyMoved(state, event);
      break;
    case "blocked":
      applyBlocked(state, event);
      break;
    case "unblocked":
      state.blocked = false;
      state.blockedReason = null;
      state.blockedSince = null;
      break;
    case "created":
    case "imported":
      if (event.toColumn !== null) state.columnId = event.toColumn;
      state.enteredColumnAt = event.ts;
      break;
    case "edited":
      applyEdited(state, event);
      break;
  }
}

// Numeric suffix of an event id ("evt-12" -> 12). Lexicographic comparison
// would order "evt-10" before "evt-9" and break insertion-order replays.
function eventSequence(id: string): number {
  const sequence = Number(id.slice(id.lastIndexOf("-") + 1));
  return Number.isNaN(sequence) ? 0 : sequence;
}

/**
 * Folds the event log over the imported cards to get the current board.
 * Inputs: the cards as imported, the full event list (any order — sorted
 * here by timestamp, then numeric insertion sequence for same-instant
 * events).
 * Output: one CardState per card, in the input card order; events for
 * unknown card ids are ignored (a sync may reference retired cards).
 * Failure: none — folding is total.
 */
export function foldEvents(cards: Card[], events: CardEvent[]): CardState[] {
  const byId = new Map<string, CardState>();
  for (const card of cards) {
    byId.set(card.id, { ...card, enteredColumnAt: card.createdAt });
  }
  const ordered = events
    .slice()
    .sort((a, b) =>
      a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : eventSequence(a.id) - eventSequence(b.id),
    );
  for (const event of ordered) {
    const state = byId.get(event.cardId);
    if (state) applyEvent(state, event);
  }
  return [...byId.values()];
}
