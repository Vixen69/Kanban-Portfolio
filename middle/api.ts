// API request handlers (ADR 010/012/013). Pure of HTTP I/O: each returns an
// ApiResult the transport layer writes out. The server is authoritative for
// event id, timestamp and actor — the client states an intent, never the
// stored shape. created/imported stay reserved for the creation/sync paths;
// the UI creates cards through POST /api/cards (handler in middle/cards.ts).

import type { BoardStorage } from "../core/ports.ts";
import type { CardEventInput } from "../core/events.ts";
import { lifecycleEvent, movedEvent } from "../core/events.ts";
import { EDITABLE_FIELDS, foldEvents } from "../core/state.ts";
import { validateBoardConfig } from "../core/config.ts";
import type { BoardConfig, CardEventType, CardState } from "../core/types.ts";
import type { ConfigStore } from "./config-store.ts";
import { patchValidators } from "./validation.ts";

export { isCriticality } from "./validation.ts";

/** Actor stamped on events until authentication exists (RP3). */
export const SERVER_ACTOR = "anonymous";

/** A status code and a JSON-serializable body for the transport to send. */
export interface ApiResult {
  status: number;
  body: unknown;
}

// Writes are validated against a fold of the CURRENT log, then appended —
// with real I/O between read and write. Serializing the whole
// read-fold-validate-append section in-process closes the validate-then-
// append race (two concurrent intents both validated against the same stale
// fold would poison the append-only log with non-chaining events). Sound
// for the delivery model — the middle is mono-instance (single JSONL
// writer; one container on Postgres); a multi-instance middle would need a
// DB-level advisory lock instead.
let writeChain: Promise<unknown> = Promise.resolve();

/**
 * Runs a write task after every previously queued write has settled.
 * Input: the async task. Output: the task's promise (rejections propagate
 * to the caller only — the chain itself never breaks). Failure: none.
 */
export function serializedWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

/** Thrown when a request body fails validation; the transport maps it to 400. */
export class BadRequest extends Error {}

const POSTABLE: ReadonlySet<string> = new Set([
  "moved", "blocked", "unblocked", "edited", "commented", "archived", "unarchived", "deleted",
]);

/**
 * GET /api/config and /api/config/default — a validated board topology.
 * Input: the config to expose (runtime or defaults).
 * Output: 200 with the config. Failure: none.
 */
export function getConfig(config: BoardConfig): ApiResult {
  return { status: 200, body: config };
}

/**
 * PUT /api/config — validates a full board config and persists it as the
 * runtime override, with one appended history line (ADR 013).
 * Inputs: the config store, the parsed JSON body.
 * Output: 200 with the stored config.
 * Failure: throws BadRequest (→ 400) with the validator's French message on
 * an invalid config; propagates I/O errors (→ 500).
 */
export function putConfig(store: ConfigStore, raw: unknown): ApiResult {
  let config: BoardConfig;
  try {
    config = validateBoardConfig(raw);
  } catch (error) {
    throw new BadRequest(error instanceof Error ? error.message : "Configuration invalide.");
  }
  return { status: 200, body: store.setRuntime(config, SERVER_ACTOR) };
}

/**
 * GET /api/board — the import-time card snapshots and the full event log; the
 * client folds them into the live board (ADR 002).
 * Input: the storage. Output: 200 with { cards, events }.
 * Failure: propagates storage errors (transport maps to 500).
 */
export async function getBoard(storage: BoardStorage): Promise<ApiResult> {
  const [cards, events] = await Promise.all([storage.listBaseCards(), storage.listEvents()]);
  return { status: 200, body: { cards, events } };
}

/**
 * POST /api/events — validates an event intent against the live (folded)
 * board and the runtime config, stamps server id/ts/actor, and appends it.
 * The read-fold-validate-append section runs serialized (see
 * serializedWrite) so concurrent intents validate against each other's
 * results, never against a shared stale fold.
 * Inputs: the storage, the runtime board config, the parsed JSON body.
 * Output: 201 with the stored CardEvent.
 * Failure: throws BadRequest (→ 400) on an invalid intent; propagates storage
 * errors (→ 500).
 */
export function postEvent(storage: BoardStorage, config: BoardConfig, raw: unknown): Promise<ApiResult> {
  return serializedWrite(async () => {
    const [cards, events] = await Promise.all([storage.listBaseCards(), storage.listEvents()]);
    const states = foldEvents(cards, events);
    const input = buildValidatedEvent(config, states, raw);
    return { status: 201, body: await storage.appendEvent(input) };
  });
}

/**
 * Guards a JSON body into a plain object (arrays and scalars rejected).
 * Input: any parsed JSON value. Output: the same value, narrowed.
 * Failure: throws BadRequest when the value is not a JSON object.
 */
export function asObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new BadRequest("Corps JSON (objet) attendu.");
  }
  return raw as Record<string, unknown>;
}

// Validates the common envelope (type allowed, card exists in the folded
// board — a deleted card is unknown) then dispatches per type.
function buildValidatedEvent(
  config: BoardConfig,
  states: CardState[],
  raw: unknown,
): CardEventInput {
  const body = asObject(raw);
  const type = body["type"];
  if (typeof type !== "string" || !POSTABLE.has(type)) {
    throw new BadRequest("Type d’évènement non autorisé.");
  }
  const cardId = body["cardId"];
  const state = typeof cardId === "string" ? states.find((card) => card.id === cardId) : undefined;
  if (!state) throw new BadRequest("Carte inconnue.");
  return buildByType(config, type as CardEventType, state, body, new Date().toISOString(), states);
}

function buildByType(
  config: BoardConfig,
  type: CardEventType,
  state: CardState,
  body: Record<string, unknown>,
  ts: string,
  states: CardState[],
): CardEventInput {
  switch (type) {
    case "moved":
      return buildMoved(config, state, body, ts, states);
    case "blocked":
      return buildBlocked(state, body, ts);
    case "unblocked":
      if (!state.blocked) throw new BadRequest("Carte non bloquée.");
      return lifecycleEvent("unblocked", state.id, SERVER_ACTOR, ts);
    case "edited":
      return buildEdited(config, state, body, ts);
    case "commented":
      return buildCommented(state, body, ts);
    case "archived":
      if (state.archived) throw new BadRequest("Carte déjà archivée.");
      return lifecycleEvent("archived", state.id, SERVER_ACTOR, ts);
    case "unarchived":
      if (!state.archived) throw new BadRequest("Carte non archivée.");
      return lifecycleEvent("unarchived", state.id, SERVER_ACTOR, ts);
    case "deleted":
      return lifecycleEvent("deleted", state.id, SERVER_ACTOR, ts);
    default:
      throw new BadRequest("Type d’évènement non autorisé.");
  }
}

// The optional insertion target of a move (ADR 019): another card the drop
// landed on, which MUST sit in the target cell of the folded board.
function validBeforeId(
  states: CardState[],
  state: CardState,
  body: Record<string, unknown>,
  to: { laneId: string; columnId: string },
): string | undefined {
  const beforeId = body["beforeId"];
  if (beforeId === undefined) return undefined;
  if (typeof beforeId !== "string" || beforeId === state.id) {
    throw new BadRequest("Carte cible de l’insertion invalide.");
  }
  // An archived target is off the board: no legitimate drop can land on it.
  const target = states.find((card) => card.id === beforeId);
  if (!target || target.archived || target.laneId !== to.laneId || target.columnId !== to.columnId) {
    throw new BadRequest("Carte cible de l’insertion hors de la cellule visée.");
  }
  return beforeId;
}

// "from" is the card's authoritative current cell (server-derived, not
// client-supplied); "to" must reference known topology. A same-cell move is
// only accepted as a reorder (beforeId present, ADR 019) — a plain same-cell
// move would reset the aging clock for nothing.
function buildMoved(
  config: BoardConfig,
  state: CardState,
  body: Record<string, unknown>,
  ts: string,
  states: CardState[],
): CardEventInput {
  // An archived card is off the board (ADR 017): its position may not
  // change until it is unarchived — the log must never record board moves
  // of invisible cards.
  if (state.archived) throw new BadRequest("Carte archivée : désarchiver avant de déplacer.");
  const toColumnId = body["toColumnId"];
  const toLaneId = body["toLaneId"];
  if (typeof toColumnId !== "string" || !config.columns.some((c) => c.id === toColumnId)) {
    throw new BadRequest("Colonne cible inconnue.");
  }
  if (typeof toLaneId !== "string" || !config.lanes.some((lane) => lane.id === toLaneId)) {
    throw new BadRequest("Canal cible inconnu.");
  }
  const to = { laneId: toLaneId, columnId: toColumnId };
  const beforeId = validBeforeId(states, state, body, to);
  if (state.laneId === toLaneId && state.columnId === toColumnId && beforeId === undefined) {
    throw new BadRequest("Carte déjà dans cette cellule.");
  }
  const from = { laneId: state.laneId, columnId: state.columnId };
  return movedEvent(state.id, from, to, SERVER_ACTOR, ts, beforeId);
}

function buildBlocked(
  state: CardState,
  body: Record<string, unknown>,
  ts: string,
): CardEventInput {
  const reason = typeof body["reason"] === "string" ? body["reason"].trim() : "";
  if (reason.length === 0) throw new BadRequest("Motif de blocage requis.");
  if (reason.length > 500) throw new BadRequest("Motif de blocage trop long (500 caractères max).");
  // Re-blocking would silently restart the andon clock and shadow the
  // original motif; lifting first keeps the escalation story honest.
  if (state.blocked) throw new BadRequest("Carte déjà bloquée.");
  return lifecycleEvent("blocked", state.id, SERVER_ACTOR, ts, { reason });
}

function buildCommented(
  state: CardState,
  body: Record<string, unknown>,
  ts: string,
): CardEventInput {
  const text = typeof body["text"] === "string" ? body["text"].trim() : "";
  if (text.length === 0) throw new BadRequest("Commentaire requis.");
  if (text.length > 2000) throw new BadRequest("Commentaire trop long (2000 caractères max).");
  return lifecycleEvent("commented", state.id, SERVER_ACTOR, ts, { text });
}

// The patch must be an object holding only whitelisted fields with valid
// values. Screening here keeps junk (and prototype-named keys) out of the
// permanent log; foldEvents re-checks types on read (core/state.ts).
function buildEdited(
  config: BoardConfig,
  state: CardState,
  body: Record<string, unknown>,
  ts: string,
): CardEventInput {
  const patch = body["patch"];
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new BadRequest("Patch d’édition invalide.");
  }
  const fields = patch as Record<string, unknown>;
  if (Object.keys(fields).length === 0) throw new BadRequest("Patch d’édition vide.");
  const allowed = new Set(EDITABLE_FIELDS);
  const validators = patchValidators(config);
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key)) throw new BadRequest(`Champ d’édition non autorisé : « ${key} ».`);
    const accepts = validators[key];
    if (!accepts || !accepts(fields[key])) {
      throw new BadRequest(`Valeur invalide pour le champ « ${key} ».`);
    }
  }
  return lifecycleEvent("edited", state.id, SERVER_ACTOR, ts, { patch });
}
