// Every way a card moves on the board, in one place: the drag and drop,
// the edit form's canal / column — each through the decision gate (ADR 052:
// a move that IS a decision waits for its fiche), then the 4-second signal
// once written (ADR 050). Split out of App.tsx to hold its 300-line cap.

import { useCallback } from "react";
import type { BoardConfig, CardPatch, CardState } from "../core/types.ts";
import type { MoveTarget } from "./api.ts";
import type { BoardStore } from "./useBoardStore.ts";
import { useDragHandlers, type MoveRequest, type UiState } from "./useInteractions.ts";
import { useMoveFlash, type MoveFlashState } from "./useMoveFlash.ts";
import { useMoveGate, type MoveGate } from "./useMoveGate.ts";

/** The board's moves: the drag handlers, the gate, the signal, the edit save. */
export interface BoardMoves {
  drag: ReturnType<typeof useDragHandlers>;
  gate: MoveGate;
  move: MoveRequest;
  flash: MoveFlashState | null;
  /** One edit-form save: the field patch, then the move (through the gate). */
  saveEdit: (card: CardState, patch: CardPatch, to: MoveTarget | null) => Promise<void>;
}

/**
 * The board's moves.
 * Inputs: the store, the config, the UiState (drag hover), reorder (false
 * while sorted, ADR 044). Output: BoardMoves. Failure: a refused write is
 * the store's lastError; a cancelled fiche moves nothing.
 */
export function useBoardMoves(store: BoardStore, config: BoardConfig, ui: UiState, reorder: boolean): BoardMoves {
  const moveFlash = useMoveFlash(config);
  const gate = useMoveGate(store, config);
  const { request } = gate;
  const { flash } = moveFlash;
  const move = useCallback<MoveRequest>(
    (card, to) => request(card, to).then((ok) => { if (ok) flash(card, to); return ok; }),
    [request, flash],
  );
  const drag = useDragHandlers(store, ui, reorder, move);
  // The field patch first, then the move: the sequence stops at the first
  // refused intent so a failed patch never lets the move half-apply.
  const saveEdit = useCallback(async (card: CardState, patch: CardPatch, to: MoveTarget | null) => {
    if (Object.keys(patch).length > 0 && !(await store.editCard(card.id, patch))) return;
    if (to) await move(card, to);
  }, [store, move]);
  return { drag, gate, move, flash: moveFlash.current, saveEdit };
}
