// The UI's single egress surface (CLAUDE.md §2): every call is a same-origin
// relative URL, so an auditor can confirm zero outbound connections by reading
// this one file. The server owns event id/ts/actor — the client posts intents.

import type { BoardConfig, Card, CardEvent, CardPatch } from "../core/types.ts";

/** What GET /api/board returns: import snapshots + the full event log. */
export interface BoardData {
  cards: Card[];
  events: CardEvent[];
}

/** A failed API call, carrying a French, user-facing message. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { accept: "application/json" } });
  } catch {
    throw new ApiError(0, "Serveur injoignable.");
  }
  if (!res.ok) throw new ApiError(res.status, `Requête ${path} refusée (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

// Posts one event intent and returns the server-stamped event.
async function postIntent(intent: Record<string, unknown>): Promise<CardEvent> {
  let res: Response;
  try {
    res = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intent),
    });
  } catch {
    throw new ApiError(0, "Serveur injoignable.");
  }
  if (!res.ok) throw new ApiError(res.status, `Action refusée (HTTP ${res.status}).`);
  return (await res.json()) as CardEvent;
}

/**
 * GET /api/config — the validated board topology.
 * Output: the BoardConfig. Failure: throws ApiError (server unreachable or
 * non-2xx).
 */
export function fetchConfig(): Promise<BoardConfig> {
  return getJson<BoardConfig>("/api/config");
}

/**
 * GET /api/board — base card snapshots and the full event log.
 * Output: BoardData. Failure: throws ApiError.
 */
export function fetchBoard(): Promise<BoardData> {
  return getJson<BoardData>("/api/board");
}

/**
 * POST a move intent. Inputs: card id, target lane/column.
 * Output: the stored CardEvent. Failure: throws ApiError.
 */
export function postMove(cardId: string, to: { laneId: string; columnId: string }): Promise<CardEvent> {
  return postIntent({ type: "moved", cardId, toLaneId: to.laneId, toColumnId: to.columnId });
}

/** POST a block intent with a reason. Failure: throws ApiError. */
export function postBlock(cardId: string, reason: string): Promise<CardEvent> {
  return postIntent({ type: "blocked", cardId, reason });
}

/** POST an unblock intent. Failure: throws ApiError. */
export function postUnblock(cardId: string): Promise<CardEvent> {
  return postIntent({ type: "unblocked", cardId });
}

/** POST an edit intent carrying the field patch. Failure: throws ApiError. */
export function postEdit(cardId: string, patch: CardPatch): Promise<CardEvent> {
  return postIntent({ type: "edited", cardId, patch });
}
