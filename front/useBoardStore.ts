// React bridge over the HTTP API: load config + board, fold on read, and
// turn every UI action into an awaited API call followed by a board refetch.
// The server is authoritative for ids, timestamps, actors and validation —
// this layer keeps no optimistic state (ADR 002, ADR 010).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardConfig, CardEvent, CardPatch, CardState } from "../core/types.ts";
import { foldEvents } from "../core/state.ts";
import {
  ApiError,
  fetchBoard,
  fetchConfig,
  fetchDefaultConfig,
  postArchive,
  postBlock,
  postCard,
  postComment,
  postDelete,
  postEdit,
  postMove,
  postUnarchive,
  postUnblock,
  putConfig,
  type BoardData,
  type MoveTarget,
  type NewCardInput,
} from "./api.ts";

/** Lifecycle of the initial config + board fetch. */
export type BoardStatus = "loading" | "ready" | "error";

/** What the view layer gets: load state, config, derived cards, the actions. */
export interface BoardStore {
  status: BoardStatus;
  /** Human-readable French message when status is "error". */
  error: string | null;
  /**
   * The last refused write or refresh (French), null when none. Cleared by
   * the next successful action or by dismissError — the shell shows it in
   * a banner so a failed save is never silent.
   */
  lastError: string | null;
  dismissError(): void;
  /** The runtime board topology, null until loaded. */
  config: BoardConfig | null;
  /** The default model (« Réinitialiser »), null when its fetch failed. */
  defaults: BoardConfig | null;
  cards: CardState[];
  events: CardEvent[];
  reload(): Promise<void>;
  /** Card actions resolve true when persisted, false when refused. */
  createCard(input: NewCardInput): Promise<boolean>;
  moveCard(cardId: string, to: MoveTarget): Promise<boolean>;
  blockCard(cardId: string, reason: string): Promise<boolean>;
  unblockCard(cardId: string): Promise<boolean>;
  editCard(cardId: string, patch: CardPatch): Promise<boolean>;
  commentCard(cardId: string, text: string): Promise<boolean>;
  archiveCard(cardId: string): Promise<boolean>;
  unarchiveCard(cardId: string): Promise<boolean>;
  deleteCard(cardId: string): Promise<boolean>;
  /** Config writes resolve null on success, the French message on failure. */
  saveConfig(next: BoardConfig): Promise<string | null>;
  resetConfig(): Promise<string | null>;
}

const NO_EVENTS: CardEvent[] = [];

function messageOf(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  if (cause instanceof Error && cause.message) return cause.message;
  return "Erreur inconnue.";
}

interface InitialLoad {
  status: BoardStatus;
  error: string | null;
  config: BoardConfig | null;
  setConfig: (config: BoardConfig) => void;
  defaults: BoardConfig | null;
  board: BoardData | null;
  setBoard: (board: BoardData) => void;
}

// Fetches config + board once on mount (defaults non-fatally: resetConfig
// fetches them again on demand, so the admin reset stays available). The
// `active` flag absorbs StrictMode's double-invoke and any unmount before
// the fetches resolve.
function useInitialLoad(): InitialLoad {
  const [status, setStatus] = useState<BoardStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [defaults, setDefaults] = useState<BoardConfig | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([fetchConfig(), fetchBoard(), fetchDefaultConfig().catch(() => null)])
      .then(([loadedConfig, loadedBoard, loadedDefaults]) => {
        if (!active) return;
        setConfig(loadedConfig);
        setDefaults(loadedDefaults);
        setBoard(loadedBoard);
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
  return { status, error, config, setConfig, defaults, board, setBoard };
}

// The refetch every action ends with: the server's log is the truth, the
// front never keeps a locally-appended version of it.
function useReload(
  setBoard: (board: BoardData) => void,
  setLastError: (message: string | null) => void,
): () => Promise<void> {
  return useCallback(async () => {
    try {
      setBoard(await fetchBoard());
    } catch (cause) {
      const message = messageOf(cause);
      console.error("rafraîchissement refusé :", message);
      setLastError(message);
    }
  }, [setBoard, setLastError]);
}

// The card actions: await the API call, then refetch the board. A
// failed write simply did not happen (logged, ids only — no titles) — the
// French message lands in lastError so the shell can show it.
function useCardActions(reload: () => Promise<void>, setLastError: (m: string | null) => void) {
  const perform = useCallback(
    async (call: () => Promise<unknown>): Promise<boolean> => {
      try {
        await call();
      } catch (cause) {
        const message = messageOf(cause);
        console.error("action refusée :", message);
        setLastError(message);
        return false;
      }
      setLastError(null);
      await reload();
      return true;
    },
    [reload, setLastError],
  );
  return useMemo(
    () => ({
      createCard: (input: NewCardInput) => perform(() => postCard(input)),
      moveCard: (cardId: string, to: MoveTarget) => perform(() => postMove(cardId, to)),
      blockCard: (cardId: string, reason: string) => perform(() => postBlock(cardId, reason)),
      unblockCard: (cardId: string) => perform(() => postUnblock(cardId)),
      editCard: (cardId: string, patch: CardPatch) => perform(() => postEdit(cardId, patch)),
      commentCard: (cardId: string, text: string) => perform(() => postComment(cardId, text)),
      archiveCard: (cardId: string) => perform(() => postArchive(cardId)),
      unarchiveCard: (cardId: string) => perform(() => postUnarchive(cardId)),
      deleteCard: (cardId: string) => perform(() => postDelete(cardId)),
    }),
    [perform],
  );
}

// Config writes: PUT the override, refetch the runtime config, then the
// board (uniform action rule). Reset re-applies the default model, fetching
// it again when the initial defaults fetch failed. Both resolve null on
// success or the French failure message — the AdminPanel shows it inline
// and stays open, so a refused « Appliquer » is never silent.
function useConfigWrites(
  setConfig: (config: BoardConfig) => void,
  defaults: BoardConfig | null,
  reload: () => Promise<void>,
) {
  const push = useCallback(
    async (next: BoardConfig) => {
      await putConfig(next);
      setConfig(await fetchConfig());
      await reload();
    },
    [setConfig, reload],
  );
  const saveConfig = useCallback(
    async (next: BoardConfig): Promise<string | null> => {
      try {
        await push(next);
        return null;
      } catch (cause) {
        const message = messageOf(cause);
        console.error("configuration refusée :", message);
        return message;
      }
    },
    [push],
  );
  const resetConfig = useCallback(async (): Promise<string | null> => {
    try {
      await push(defaults ?? (await fetchDefaultConfig()));
      return null;
    } catch (cause) {
      const message = messageOf(cause);
      console.error("réinitialisation refusée :", message);
      return message;
    }
  }, [defaults, push]);
  return { saveConfig, resetConfig };
}

/**
 * Loads the runtime config and the board from the API, folds the event log
 * into CardState[] on every change, and exposes the write actions.
 * Output: a BoardStore; status is "loading" until the first fetches resolve,
 * then "ready", or "error" with a French message.
 * Failure: load failures surface via status/error; write failures leave the
 * board unchanged (the action did not persist) and surface via lastError
 * (card actions) or the returned message (config writes).
 */
export function useBoardStore(): BoardStore {
  const load = useInitialLoad();
  const [lastError, setLastError] = useState<string | null>(null);
  const reload = useReload(load.setBoard, setLastError);
  const cardActions = useCardActions(reload, setLastError);
  const configWrites = useConfigWrites(load.setConfig, load.defaults, reload);
  const dismissError = useCallback(() => setLastError(null), []);
  const cards = useMemo(
    () => (load.board ? foldEvents(load.board.cards, load.board.events) : []),
    [load.board],
  );
  return {
    status: load.status,
    error: load.error,
    lastError,
    dismissError,
    config: load.config,
    defaults: load.defaults,
    cards,
    events: load.board?.events ?? NO_EVENTS,
    reload,
    ...cardActions,
    ...configWrites,
  };
}
