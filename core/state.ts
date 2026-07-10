// Replays the event log over imported subjects to produce the live board.
// The event log is the truth: position, blocked state, comments, deletion
// and time-in-column are all derived here, never stored elsewhere.

import type { Card, CardEvent, CardState, Financials } from "./types.ts";
import type { Subject } from "./ports.ts";
import { isReorder } from "./events.ts";

// Validators of the fields an "edited" event may patch (CardPatch, v2).
// Anything else in the payload is silently ignored — replays must never
// corrupt state because one historic event carried garbage.
const isStringOrNull = (value: unknown) => typeof value === "string" || value === null;
const isNumberOrNull = (value: unknown) =>
  value === null || (typeof value === "number" && Number.isFinite(value));
const isStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const isCustomValue = (value: unknown) =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));
const isCustomMap = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(isCustomValue);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
// Plan de charge: array of { profileId: string, jh: number, done: number }.
const isChargeByProfile = (value: unknown) =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isPlainObject(item) &&
      typeof item.profileId === "string" &&
      isFiniteNumber(item.jh) &&
      isFiniteNumber(item.done),
  );
// Risks: array of { type: string, desc: string }.
const isRisks = (value: unknown) =>
  Array.isArray(value) &&
  value.every(
    (item) => isPlainObject(item) && typeof item.type === "string" && typeof item.desc === "string",
  );

const EDITABLE: Record<string, (value: unknown) => boolean> = {
  title: (value) => typeof value === "string" && value.length > 0,
  owner: (value) => typeof value === "string",
  domain: (value) => typeof value === "string" && value.length > 0,
  criticality: (value) => value === "top" || value === "major" || value === "normal",
  typeId: isStringOrNull,
  codename: isStringOrNull,
  // nature is deliberately absent (design v11): positional, carried by the
  // canal — a historic "edited" patch touching it is silently ignored.
  tags: isStringArray,
  effortEstimated: isNumberOrNull,
  effortConsumed: isNumberOrNull,
  budgetEstimated: isNumberOrNull,
  budgetConsumed: isNumberOrNull,
  loadPlan: isStringOrNull,
  resources: isStringArray,
  notes: (value) => typeof value === "string",
  budgetEngaged: isNumberOrNull,
  budgetRdli: isNumberOrNull,
  chargeByProfile: isChargeByProfile,
  contentionProfiles: isStringArray,
  contentionNote: (value) => typeof value === "string",
  risks: isRisks,
  projectConstraints: isStringArray,
  alerts: isStringArray,
  dateRdr: isStringOrNull,
  custom: isCustomMap,
};

/** The field names an "edited" event may patch (callers validate against this). */
export const EDITABLE_FIELDS: readonly string[] = Object.keys(EDITABLE);

/**
 * Combines a subject with its financials into a full Card.
 * Inputs: a Subject from a data source, its Financials (or null).
 * Output: a Card with budgetEstimated (from Financials.budget) and
 * budgetConsumed (from Financials.consumed), null when unknown.
 * Financials.remaining is not stored — the remainder is derived at display
 * time from estimated minus consumed.
 * Failure: none.
 */
export function toCard(subject: Subject, financials: Financials | null): Card {
  return {
    ...subject,
    budgetEstimated: financials?.budget ?? null,
    budgetConsumed: financials?.consumed ?? null,
  };
}

// Applies a position-setting event (created / imported / moved): column from
// toColumn (when present), lane from payload.laneId (unchanged when absent),
// aging clock reset to the event timestamp — EXCEPT a recorded reorder
// (ADR 019): rank change, not a stage change, so position and clock are
// left alone entirely. Classifying by the RECORDED transition (isReorder,
// same predicate as history/Délais/metrics) keeps every projection
// consistent even when a raced log holds a reorder whose replayed state
// diverged from its record.
function applyPosition(state: CardState, event: CardEvent): void {
  if (isReorder(event)) return;
  if (event.toColumn !== null) state.columnId = event.toColumn;
  const laneId = event.payload["laneId"];
  if (typeof laneId === "string") state.laneId = laneId;
  state.enteredColumnAt = event.ts;
}

function applyBlocked(state: CardState, event: CardEvent): void {
  state.blocked = true;
  const reason = event.payload["reason"];
  state.blockedReason = typeof reason === "string" ? reason : null;
  state.blockedSince = event.ts;
}

function applyUnblocked(state: CardState): void {
  state.blocked = false;
  state.blockedReason = null;
  state.blockedSince = null;
}

function applyCommented(state: CardState, event: CardEvent): void {
  const text = event.payload["text"];
  if (typeof text !== "string") return; // malformed comment: skip, never corrupt
  state.comments.push({ actor: event.actor, ts: event.ts, text });
}

// Copies container values so a patched state never aliases the (possibly
// frozen, possibly shared) event payload. "custom" REPLACES the whole map;
// object spread defines own data properties only, so a forged "__proto__"
// key inside the map can never touch the prototype chain.
function copyPatchValue(key: string, value: unknown): unknown {
  if (Array.isArray(value)) return value.slice();
  if (key === "custom") return { ...(value as Record<string, unknown>) };
  return value;
}

function applyEdited(state: CardState, event: CardEvent): void {
  const patch = event.payload["patch"];
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return;
  const fields = patch as Record<string, unknown>;
  // Iterate the whitelist, never the payload's own keys: a forged key like
  // "hasOwnProperty" or "constructor" must never reach a prototype-chain
  // lookup (which would throw or corrupt state on every replay).
  for (const key of EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    const value = fields[key];
    const accepts = EDITABLE[key];
    if (accepts && accepts(value)) {
      // The whitelist above guarantees the value matches the field's type.
      (state as unknown as Record<string, unknown>)[key] = copyPatchValue(key, value);
    }
  }
}

function applyEvent(state: CardState, event: CardEvent): void {
  switch (event.type) {
    case "created":
    case "imported":
    case "moved":
      applyPosition(state, event);
      break;
    case "blocked":
      applyBlocked(state, event);
      break;
    case "unblocked":
      applyUnblocked(state);
      break;
    case "edited":
      applyEdited(state, event);
      break;
    case "commented":
      applyCommented(state, event);
      break;
    case "archived":
      state.archived = true;
      break;
    case "unarchived":
      state.archived = false;
      break;
    // "deleted" is handled by foldEvents itself: it removes the whole card.
  }
}

// Numeric suffix of an event id ("evt-12" -> 12). Lexicographic comparison
// would order "evt-10" before "evt-9" and break insertion-order replays.
function eventSequence(id: string): number {
  const sequence = Number(id.slice(id.lastIndexOf("-") + 1));
  return Number.isNaN(sequence) ? 0 : sequence;
}

// Manual ordering (ADR 019): a "moved" event may carry payload.beforeId —
// the card is re-inserted just before that card in the global fold order
// (cells read the order through cellCards). Unknown or self target: the
// order is unchanged.
function applyReorder(order: string[], event: CardEvent): void {
  const beforeId = event.payload["beforeId"];
  if (typeof beforeId !== "string" || beforeId === event.cardId) return;
  const from = order.indexOf(event.cardId);
  if (from === -1) return;
  order.splice(from, 1);
  const to = order.indexOf(beforeId);
  order.splice(to === -1 ? from : to, 0, event.cardId);
}

/**
 * Folds the event log over the imported cards to get the current board.
 * Inputs: the cards as imported, the full event list (any order — sorted
 * here by timestamp, then numeric insertion sequence for same-instant
 * events).
 * Output: one CardState per surviving card, in the input card order —
 * repositioned by "moved" events carrying a beforeId (manual ordering,
 * ADR 019) — with comments accumulated in chronological order. A card with
 * a "deleted" event is excluded from the output entirely (the log remains)
 * and its later events are ignored, like events for unknown card ids (a
 * sync may reference retired cards). An archived card STAYS in the output
 * with archived=true — the archive view lists it; the board excludes it.
 * Failure: none — folding is total.
 */
export function foldEvents(cards: Card[], events: CardEvent[]): CardState[] {
  const byId = new Map<string, CardState>();
  for (const card of cards) {
    byId.set(card.id, { ...card, enteredColumnAt: card.createdAt, comments: [], archived: false });
  }
  const order = cards.map((card) => card.id);
  const ordered = events
    .slice()
    .sort((a, b) =>
      a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : eventSequence(a.id) - eventSequence(b.id),
    );
  for (const event of ordered) {
    if (event.type === "deleted") {
      // Keep order and byId in lockstep: a later beforeId naming this card
      // must fall into applyReorder's unknown-target no-op, not a ghost slot.
      byId.delete(event.cardId);
      const at = order.indexOf(event.cardId);
      if (at !== -1) order.splice(at, 1);
      continue;
    }
    const state = byId.get(event.cardId);
    if (!state) continue;
    applyEvent(state, event);
    if (event.type === "moved") applyReorder(order, event);
  }
  return order
    .map((id) => byId.get(id))
    .filter((state): state is CardState => state !== undefined);
}
