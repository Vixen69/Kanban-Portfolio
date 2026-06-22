// API request handlers (ADR 010). Pure of HTTP I/O: each returns an ApiResult
// the transport layer writes out. The server is authoritative for event id,
// timestamp and actor — the client states an intent, never the stored shape.
// Only moved/blocked/unblocked/edited are accepted; created/imported belong
// to the import/sync path, never to the UI.

import type { BoardStorage } from "../core/ports.ts";
import type { CardEventInput } from "../core/events.ts";
import { lifecycleEvent, movedEvent } from "../core/events.ts";
import { EDITABLE_FIELDS, foldEvents } from "../core/state.ts";
import type { BoardConfig, CardEventType, CardState } from "../core/types.ts";

/** Actor stamped on events until authentication exists (Sprint 4). */
export const SERVER_ACTOR = "anonymous";

/** A status code and a JSON-serializable body for the transport to send. */
export interface ApiResult {
  status: number;
  body: unknown;
}

/** Thrown when a request body fails validation; the transport maps it to 400. */
export class BadRequest extends Error {}

const POSTABLE: ReadonlySet<string> = new Set(["moved", "blocked", "unblocked", "edited"]);

/**
 * GET /api/config — the validated board topology.
 * Input: the board config. Output: 200 with the config. Failure: none.
 */
export function getConfig(config: BoardConfig): ApiResult {
  return { status: 200, body: config };
}

/**
 * GET /api/board — the import-time card snapshots and the full event log; the
 * client folds them into the live board (ADR 002).
 * Input: the storage. Output: 200 with { cards, events }.
 * Failure: propagates storage errors (transport maps to 500).
 */
export function getBoard(storage: BoardStorage): ApiResult {
  return { status: 200, body: { cards: storage.listBaseCards(), events: storage.listEvents() } };
}

/**
 * POST /api/events — validates an event intent against the live board, stamps
 * server id/ts/actor, and appends it.
 * Inputs: the storage, the board config, the parsed JSON body.
 * Output: 201 with the stored CardEvent.
 * Failure: throws BadRequest (→ 400) on an invalid intent; propagates storage
 * errors (→ 500).
 */
export function postEvent(storage: BoardStorage, config: BoardConfig, raw: unknown): ApiResult {
  const states = foldEvents(storage.listBaseCards(), storage.listEvents());
  const input = buildValidatedEvent(config, states, raw);
  return { status: 201, body: storage.appendEvent(input) };
}

function asObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new BadRequest("Corps JSON (objet) attendu.");
  }
  return raw as Record<string, unknown>;
}

// Validates the common envelope (type allowed, card exists) then dispatches.
function buildValidatedEvent(
  config: BoardConfig,
  states: CardState[],
  raw: unknown,
): CardEventInput {
  const body = asObject(raw);
  const type = body["type"];
  if (typeof type !== "string" || !POSTABLE.has(type)) {
    throw new BadRequest("Type d'evenement non autorise.");
  }
  const cardId = body["cardId"];
  const state = typeof cardId === "string" ? states.find((card) => card.id === cardId) : undefined;
  if (!state) throw new BadRequest("Carte inconnue.");
  return buildByType(config, type as CardEventType, state, body, new Date().toISOString());
}

function buildByType(
  config: BoardConfig,
  type: CardEventType,
  state: CardState,
  body: Record<string, unknown>,
  ts: string,
): CardEventInput {
  switch (type) {
    case "moved":
      return buildMoved(config, state, body, ts);
    case "blocked":
      return buildBlocked(state, body, ts);
    case "unblocked":
      return lifecycleEvent("unblocked", state.id, SERVER_ACTOR, ts);
    case "edited":
      return buildEdited(state, body, ts);
    default:
      throw new BadRequest("Type d'evenement non autorise.");
  }
}

// "from" is the card's authoritative current cell (server-derived, not
// client-supplied); "to" must reference known topology.
function buildMoved(
  config: BoardConfig,
  state: CardState,
  body: Record<string, unknown>,
  ts: string,
): CardEventInput {
  const toColumnId = body["toColumnId"];
  const toLaneId = body["toLaneId"];
  if (typeof toColumnId !== "string" || !config.columns.some((c) => c.id === toColumnId)) {
    throw new BadRequest("Colonne cible inconnue.");
  }
  if (typeof toLaneId !== "string" || !config.lanes.some((lane) => lane.id === toLaneId)) {
    throw new BadRequest("Canal cible inconnu.");
  }
  const from = { laneId: state.laneId, columnId: state.columnId };
  // Reject a move to the cell the card already occupies: recording it would
  // reset the aging clock (enteredColumnAt) for no real movement. The server
  // is authoritative here, so a client race that slips past the UI no-op
  // guard still cannot pollute the log.
  if (from.laneId === toLaneId && from.columnId === toColumnId) {
    throw new BadRequest("Carte deja dans cette cellule.");
  }
  return movedEvent(state.id, from, { laneId: toLaneId, columnId: toColumnId }, SERVER_ACTOR, ts);
}

function buildBlocked(
  state: CardState,
  body: Record<string, unknown>,
  ts: string,
): CardEventInput {
  const reason = body["reason"];
  if (typeof reason !== "string" || reason.length === 0) {
    throw new BadRequest("Motif de blocage requis.");
  }
  return lifecycleEvent("blocked", state.id, SERVER_ACTOR, ts, { reason });
}

// The patch must be an object holding only whitelisted fields. Screening the
// keys here keeps junk (and prototype-named keys) out of the permanent log;
// foldEvents additionally enforces field types on read (core/state.ts).
function buildEdited(
  state: CardState,
  body: Record<string, unknown>,
  ts: string,
): CardEventInput {
  const patch = body["patch"];
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new BadRequest("Patch d'edition invalide.");
  }
  const allowed = new Set(EDITABLE_FIELDS);
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) throw new BadRequest("Champ d'edition non autorise.");
  }
  return lifecycleEvent("edited", state.id, SERVER_ACTOR, ts, { patch });
}
