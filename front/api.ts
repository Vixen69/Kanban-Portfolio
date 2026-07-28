// The UI's single egress surface (CLAUDE.md §2): every call is a same-origin
// relative URL, so an auditor can confirm zero outbound connections by
// reading this one file. The server owns event id/ts/actor and every
// validation — the client posts intents, never stored shapes.

import type {
  BoardConfig,
  Card,
  CardEvent,
  CardPatch,
  Criticality,
} from "../core/types.ts";

/** What GET /api/board returns: import snapshots + the full event log. */
export interface BoardData {
  cards: Card[];
  events: CardEvent[];
}

/** What POST /api/cards returns: the server-built card + its "created" event. */
export interface CreatedCard {
  card: Card;
  event: CardEvent;
}

/** The QuickAdd creation intent — the server builds everything else,
 * including the nature (derived from the canal, ADR 018). */
export interface NewCardInput {
  title: string;
  domain: string;
  laneId: string;
  typeId: string;
  criticality: Criticality;
  owner: string;
}

/** A target cell for a move intent; beforeId = insert just before that
 * card in the cell (a drop landed on it — manual ordering, ADR 019). */
export interface MoveTarget {
  laneId: string;
  columnId: string;
  beforeId?: string;
}

/** A failed API call, carrying a French, user-facing message. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Prefers the middle's French { error } body; falls back to a generic line.
async function failureMessage(res: Response, path: string): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null) {
      const error = (body as { error?: unknown }).error;
      if (typeof error === "string" && error !== "") return error;
    }
  } catch {
    // Non-JSON failure body — keep the generic message.
  }
  return `Requête ${path} refusée (HTTP ${res.status}).`;
}

// One place doing fetch: same-origin path in, parsed JSON out, ApiError on
// network failure (status 0) or any non-2xx response.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init ?? { headers: { accept: "application/json" } });
  } catch {
    throw new ApiError(0, "Serveur injoignable.");
  }
  if (!res.ok) throw new ApiError(res.status, await failureMessage(res, path));
  return (await res.json()) as T;
}

function jsonInit(method: "POST" | "PUT", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Posts one event intent and returns the server-stamped event.
function postIntent(intent: Record<string, unknown>): Promise<CardEvent> {
  return request<CardEvent>("/api/events", jsonInit("POST", intent));
}

/**
 * GET /api/config — the runtime board topology (admin override or defaults).
 * Output: the BoardConfig. Failure: throws ApiError (unreachable or non-2xx).
 */
export function fetchConfig(): Promise<BoardConfig> {
  return request<BoardConfig>("/api/config");
}

/**
 * GET /api/config/default — the versioned default model (config/board.json).
 * Output: the BoardConfig. Failure: throws ApiError.
 */
export function fetchDefaultConfig(): Promise<BoardConfig> {
  return request<BoardConfig>("/api/config/default");
}

/**
 * PUT /api/config — persist a full board config as the runtime override
 * (ADR 013; the middle validates and appends one history line).
 * Input: the next BoardConfig. Output: the stored config.
 * Failure: throws ApiError (400 carries the validator's French message).
 */
export function putConfig(config: BoardConfig): Promise<BoardConfig> {
  return request<BoardConfig>("/api/config", jsonInit("PUT", config));
}

/**
 * GET /api/board — base card snapshots and the full event log.
 * Output: BoardData (the caller folds it via core/state). Failure: ApiError.
 */
export function fetchBoard(): Promise<BoardData> {
  return request<BoardData>("/api/board");
}

/**
 * POST /api/cards — create a subject from the QuickAdd intent; the server
 * assigns id, codename, first column, timestamps and the "created" event.
 * Input: the NewCardInput. Output: { card, event }. Failure: throws ApiError.
 */
export function postCard(input: NewCardInput): Promise<CreatedCard> {
  return request<CreatedCard>("/api/cards", jsonInit("POST", { ...input }));
}

/**
 * POST a move intent. Inputs: card id, target lane/column and the optional
 * insertion target (beforeId, ADR 019).
 * Output: the stored CardEvent. Failure: throws ApiError.
 */
export function postMove(cardId: string, to: MoveTarget): Promise<CardEvent> {
  return postIntent({
    type: "moved", cardId, toLaneId: to.laneId, toColumnId: to.columnId,
    ...(to.beforeId === undefined ? {} : { beforeId: to.beforeId }),
  });
}

/** POST a block intent with a reason. Output: the stored event. Failure: throws ApiError. */
export function postBlock(cardId: string, reason: string): Promise<CardEvent> {
  return postIntent({ type: "blocked", cardId, reason });
}

/** POST an unblock intent. Output: the stored event. Failure: throws ApiError. */
export function postUnblock(cardId: string): Promise<CardEvent> {
  return postIntent({ type: "unblocked", cardId });
}

/** POST an edit intent carrying the field patch. Output: the stored event. Failure: throws ApiError. */
export function postEdit(cardId: string, patch: CardPatch): Promise<CardEvent> {
  return postIntent({ type: "edited", cardId, patch });
}

/** POST a comment intent. Inputs: card id, comment text. Output: the stored event. Failure: throws ApiError. */
export function postComment(cardId: string, text: string): Promise<CardEvent> {
  return postIntent({ type: "commented", cardId, text });
}

/**
 * POST an archive intent — archiving is itself an event (ADR 017): the card
 * leaves the board but stays in the fold for the archive view.
 * Input: the card id. Output: the stored event. Failure: throws ApiError.
 */
export function postArchive(cardId: string): Promise<CardEvent> {
  return postIntent({ type: "archived", cardId });
}

/** POST an unarchive intent — the card returns to the board. Output: the stored event. Failure: throws ApiError. */
export function postUnarchive(cardId: string): Promise<CardEvent> {
  return postIntent({ type: "unarchived", cardId });
}

/**
 * POST a deletion intent — deletion is itself an event: the fold excludes
 * the card, the log keeps everything (ADR 012).
 * Input: the card id. Output: the stored event. Failure: throws ApiError.
 */
export function postDelete(cardId: string): Promise<CardEvent> {
  return postIntent({ type: "deleted", cardId });
}
