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
import type {
  BoardConfig,
  CardEventType,
  CardState,
  Criticality,
  CustomValue,
  NatureKey,
} from "../core/types.ts";
import type { ConfigStore } from "./config-store.ts";

/** Actor stamped on events until authentication exists (RP3). */
export const SERVER_ACTOR = "anonymous";

/** A status code and a JSON-serializable body for the transport to send. */
export interface ApiResult {
  status: number;
  body: unknown;
}

/** Thrown when a request body fails validation; the transport maps it to 400. */
export class BadRequest extends Error {}

const POSTABLE: ReadonlySet<string> = new Set([
  "moved", "blocked", "unblocked", "edited", "commented", "deleted",
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
 * Inputs: the storage, the runtime board config, the parsed JSON body.
 * Output: 201 with the stored CardEvent.
 * Failure: throws BadRequest (→ 400) on an invalid intent; propagates storage
 * errors (→ 500).
 */
export async function postEvent(storage: BoardStorage, config: BoardConfig, raw: unknown): Promise<ApiResult> {
  const [cards, events] = await Promise.all([storage.listBaseCards(), storage.listEvents()]);
  const states = foldEvents(cards, events);
  const input = buildValidatedEvent(config, states, raw);
  return { status: 201, body: await storage.appendEvent(input) };
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

/**
 * True when the value is one of the fixed nature keys.
 * Input: any value. Output: a NatureKey type guard result. Failure: none.
 */
export function isNature(value: unknown): value is NatureKey {
  return value === "simple" || value === "complicated" || value === "complex";
}

/**
 * True when the value is one of the fixed criticality keys.
 * Input: any value. Output: a Criticality type guard result. Failure: none.
 */
export function isCriticality(value: unknown): value is Criticality {
  return value === "top" || value === "major" || value === "normal";
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
      if (!state.blocked) throw new BadRequest("Carte non bloquée.");
      return lifecycleEvent("unblocked", state.id, SERVER_ACTOR, ts);
    case "edited":
      return buildEdited(config, state, body, ts);
    case "commented":
      return buildCommented(state, body, ts);
    case "deleted":
      return lifecycleEvent("deleted", state.id, SERVER_ACTOR, ts);
    default:
      throw new BadRequest("Type d’évènement non autorisé.");
  }
}

// "from" is the card's authoritative current cell (server-derived, not
// client-supplied); "to" must reference known topology and differ from the
// current cell — recording a same-cell move would reset the aging clock.
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
  if (state.laneId === toLaneId && state.columnId === toColumnId) {
    throw new BadRequest("Carte déjà dans cette cellule.");
  }
  const from = { laneId: state.laneId, columnId: state.columnId };
  return movedEvent(state.id, from, { laneId: toLaneId, columnId: toColumnId }, SERVER_ACTOR, ts);
}

function buildBlocked(
  state: CardState,
  body: Record<string, unknown>,
  ts: string,
): CardEventInput {
  const reason = typeof body["reason"] === "string" ? body["reason"].trim() : "";
  if (reason.length === 0) throw new BadRequest("Motif de blocage requis.");
  if (reason.length > 500) throw new BadRequest("Motif de blocage trop long (500 caractères max).");
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

// Small structural predicates reused across the patch validators.
const amountOrNull = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const stringArray = (v: unknown) =>
  Array.isArray(v) && v.every((item) => typeof item === "string");
const stringOrNull = (v: unknown) => v === null || typeof v === "string";
const nonNegNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isPlainObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Config-aware validators for the design-v10 detail fields: referential ids
// (profiles, risk types, project constraints) must point at existing topology.
function designV10Validators(config: BoardConfig): Record<string, (v: unknown) => boolean> {
  const profileIds = new Set(config.profiles.map((p) => p.id));
  const riskIds = new Set(config.riskTypes.map((r) => r.id));
  const constraintIds = new Set(config.projectConstraints.map((c) => c.id));
  return {
    budgetEngaged: amountOrNull,
    budgetRdli: amountOrNull,
    contentionNote: (v) => typeof v === "string",
    contentionProfiles: (v) => stringArray(v) && (v as string[]).every((id) => profileIds.has(id)),
    projectConstraints: (v) => stringArray(v) && (v as string[]).every((id) => constraintIds.has(id)),
    alerts: stringArray,
    dateRdr: stringOrNull,
    chargeByProfile: (v) => Array.isArray(v) && v.every((e) =>
      isPlainObj(e) && profileIds.has(e.profileId as string) && nonNegNumber(e.jh) && nonNegNumber(e.done)),
    risks: (v) => Array.isArray(v) && v.every((r) =>
      isPlainObj(r) && riskIds.has(r.type as string) && typeof r.desc === "string"),
  };
}

// Per-field acceptance for an "edited" patch, closed over the runtime config
// so referential fields (domain, typeId, profiles…) must point at existing
// topology.
function patchValidators(config: BoardConfig): Record<string, (value: unknown) => boolean> {
  const customValue = (v: unknown): v is CustomValue =>
    v === null || typeof v === "string" || typeof v === "boolean" ||
    (typeof v === "number" && Number.isFinite(v));
  return {
    title: (v) => typeof v === "string" && v.trim().length > 0,
    owner: (v) => typeof v === "string",
    domain: (v) => typeof v === "string" && config.domains.some((d) => d.id === v),
    criticality: isCriticality,
    typeId: (v) => v === null || (typeof v === "string" && config.types.some((t) => t.id === v)),
    codename: stringOrNull,
    nature: isNature,
    tags: stringArray,
    effortEstimated: amountOrNull,
    effortConsumed: amountOrNull,
    budgetEstimated: amountOrNull,
    budgetConsumed: amountOrNull,
    loadPlan: stringOrNull,
    resources: stringArray,
    notes: (v) => typeof v === "string",
    ...designV10Validators(config),
    custom: (v) =>
      typeof v === "object" && v !== null && !Array.isArray(v) &&
      Object.values(v).every(customValue),
  };
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
