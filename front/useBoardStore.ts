// React bridge over the HTTP API: fetch the board once, fold on read, and
// turn every UI action into a POSTed intent. The server is authoritative for
// event id/ts/actor; this layer never mutates cards — it appends the event
// the server returns and re-folds (ADR 002, ADR 010).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, CardEvent, CardPatch, CardState } from "../core/types.ts";
import { foldEvents } from "../core/state.ts";
import { ApiError, fetchBoard, postBlock, postEdit, postMove, postUnblock } from "./api.ts";

/** Lifecycle of the initial board fetch. */
export type BoardStatus = "loading" | "ready" | "error";

/** What the view layer gets: load state, derived cards, the log, the actions. */
export interface BoardStore {
  status: BoardStatus;
  /** Human-readable French message when status is "error". */
  error: string | null;
  cards: CardState[];
  events: CardEvent[];
  moveCard(cardId: string, to: { laneId: string; columnId: string }): void;
  blockCard(cardId: string, reason: string): void;
  unblockCard(cardId: string): void;
  editCard(cardId: string, patch: CardPatch): void;
}

interface Backbone {
  baseCards: Card[];
  events: CardEvent[];
}

const NO_EVENTS: CardEvent[] = [];

function messageOf(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  if (cause instanceof Error && cause.message) return cause.message;
  return "Erreur inconnue.";
}

// The four write actions: POST the intent, append the server's event, re-fold.
// A failed write simply did not happen (no optimistic state to roll back).
// Writes are not serialized client-side; the server is authoritative and
// rejects redundant moves, so a fast double-action cannot corrupt the log.
function useWriters(
  ref: React.RefObject<Backbone | null>,
  apply: (event: CardEvent) => void,
  onError: (cause: unknown) => void,
): Pick<BoardStore, "moveCard" | "blockCard" | "unblockCard" | "editCard"> {
  const moveCard = useCallback(
    (cardId: string, to: { laneId: string; columnId: string }) => {
      const current = ref.current;
      if (!current) return;
      const card = foldEvents(current.baseCards, current.events).find((c) => c.id === cardId);
      if (!card || (card.laneId === to.laneId && card.columnId === to.columnId)) return;
      postMove(cardId, to).then(apply).catch(onError);
    },
    [ref, apply, onError],
  );
  const blockCard = useCallback(
    (cardId: string, reason: string) => void postBlock(cardId, reason).then(apply).catch(onError),
    [apply, onError],
  );
  const unblockCard = useCallback(
    (cardId: string) => void postUnblock(cardId).then(apply).catch(onError),
    [apply, onError],
  );
  const editCard = useCallback(
    (cardId: string, patch: CardPatch) => void postEdit(cardId, patch).then(apply).catch(onError),
    [apply, onError],
  );
  return { moveCard, blockCard, unblockCard, editCard };
}

interface Loaded {
  backbone: Backbone | null;
  setBackbone: React.Dispatch<React.SetStateAction<Backbone | null>>;
  status: BoardStatus;
  error: string | null;
}

// Fetches the board once on mount (the `active` flag absorbs StrictMode's
// double-invoke and any unmount before the fetch resolves).
function useBoardLoad(): Loaded {
  const [backbone, setBackbone] = useState<Backbone | null>(null);
  const [status, setStatus] = useState<BoardStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetchBoard()
      .then((data) => {
        if (!active) return;
        setBackbone({ baseCards: data.cards, events: data.events });
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(messageOf(cause));
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);
  return { backbone, setBackbone, status, error };
}

/**
 * Loads the board from the API and exposes the folded cards, the event log
 * and the write actions.
 * Output: a BoardStore; status is "loading" until the first fetch resolves,
 * then "ready", or "error" with a French message on failure.
 * Failure: load failures surface via status/error; write failures are logged
 * and leave the board unchanged (the action simply did not persist).
 */
export function useBoardStore(): BoardStore {
  const { backbone, setBackbone, status, error } = useBoardLoad();

  // Mirror the latest committed backbone for the write callbacks, which read
  // it only in async handlers (after commit) — so an effect, not a render-time
  // assignment, keeps the ref in step with committed state.
  const ref = useRef<Backbone | null>(null);
  useEffect(() => {
    ref.current = backbone;
  }, [backbone]);

  const cards = useMemo(
    () => (backbone ? foldEvents(backbone.baseCards, backbone.events) : []),
    [backbone],
  );
  const apply = useCallback((stored: CardEvent) => {
    setBackbone((b) => (b ? { ...b, events: [...b.events, stored] } : b));
  }, [setBackbone]);
  const onError = useCallback((cause: unknown) => {
    console.error("écriture refusée:", messageOf(cause));
  }, []);

  const writers = useWriters(ref, apply, onError);
  return { status, error, cards, events: backbone?.events ?? NO_EVENTS, ...writers };
}
