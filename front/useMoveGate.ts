// Decisions by the gesture (ADR 052): every move of the board passes this
// gate. A move that is a decision — into Pause, or a chosen canal changed —
// is held: the card does not move, the fiche « Décision et Raison » opens,
// and only « Valider » sends the move WITH its decisions (one request, all
// or none). « Annuler » writes nothing: we decide before we write. The
// same fiche traces, from the card's detail, a pause decided on paper.

import { useCallback, useMemo, useRef, useState } from "react";
import type { BoardConfig, CardState } from "../core/types.ts";
import { laneChosen, PAUSE_DECISION_ID, readGesture, requiredDecisions, type Gesture } from "../core/gesture.ts";
import type { DecisionInput, MoveTarget } from "./api.ts";
import type { BoardStore } from "./useBoardStore.ts";

/** What the fiche is open for: a held move, or a pause traced after the fact. */
export interface PendingDecision {
  card: CardState;
  /** The held move; null when tracing a pause from the fiche (nothing moves). */
  to: MoveTarget | null;
  gesture: Gesture | null;
  /** The decision ids to fill, pause first (D4, D5). */
  required: string[];
}

/** The gate: request a move, trace a pause, confirm or cancel the fiche. */
export interface MoveGate {
  pending: PendingDecision | null;
  /** Whether this move is a decision (its fiche will open) — read before writing anything. */
  requires: (card: CardState, to: MoveTarget) => boolean;
  /** Moves the card, or holds the move for its fiche; resolves true once written. */
  request: (card: CardState, to: MoveTarget) => Promise<boolean>;
  /** Opens the fiche to trace (or renew) the pause of a card in Pause. */
  tracePause: (card: CardState) => void;
  confirm: (decisions: DecisionInput[]) => Promise<void>;
  cancel: () => void;
}

// The latest store and config, read by stable callbacks (the drag handlers
// and the memoised tickets keep their identity).
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

// The open fiche: its state (rendered), a ref (read after an await) and
// the promise of the move it holds.
function useFiche() {
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const held = useRef<PendingDecision | null>(null);
  const open = useCallback((next: PendingDecision, resolve: ((ok: boolean) => void) | null) => {
    resolver.current?.(false); // a fiche left open is abandoned, never written
    resolver.current = resolve;
    held.current = next;
    setPending(next);
  }, []);
  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    held.current = null;
    setPending(null);
  }, []);
  return { pending, held, open, settle };
}

/**
 * The move gate of the board.
 * Inputs: the board store (cards, events, moveCard, decideCard, lastError),
 * the config (gestures read against its columns and decisions).
 * Output: the MoveGate. Failure: a refused write keeps the fiche open; the
 * server's French message is the store's lastError (shown in the fiche);
 * nothing half-written (the move and its decisions travel together).
 */
export function useMoveGate(store: BoardStore, config: BoardConfig): MoveGate {
  const { pending, held, open, settle } = useFiche();
  const latest = useLatest({ store, config });
  const readMove = useCallback((card: CardState, to: MoveTarget) => {
    const { store: current, config: cfg } = latest.current;
    const gesture = readGesture(cfg, { laneId: card.laneId, columnId: card.columnId }, to, laneChosen(cfg, card.id, current.events));
    return { gesture, required: requiredDecisions(cfg, gesture) };
  }, [latest]);
  const requires = useCallback((card: CardState, to: MoveTarget) => readMove(card, to).required.length > 0, [readMove]);
  const request = useCallback((card: CardState, to: MoveTarget): Promise<boolean> => {
    const { gesture, required } = readMove(card, to);
    if (required.length === 0) return latest.current.store.moveCard(card.id, to);
    latest.current.store.dismissError();
    return new Promise<boolean>((resolve) => open({ card, to, gesture, required }, resolve));
  }, [latest, readMove, open]);
  const tracePause = useCallback((card: CardState) => {
    latest.current.store.dismissError();
    open({ card, to: null, gesture: null, required: [PAUSE_DECISION_ID] }, null);
  }, [latest, open]);
  const confirm = useCallback(async (decisions: DecisionInput[]) => {
    const fiche = held.current;
    if (fiche === null) return;
    const current = latest.current.store;
    const ok = fiche.to === null
      ? await current.decideCard(fiche.card.id, decisions[0]!)
      : await current.moveCard(fiche.card.id, fiche.to, decisions);
    // Refused: the fiche stays open over the store's lastError. Written:
    // only THIS fiche closes — never one opened meanwhile.
    if (ok && held.current === fiche) settle(true);
  }, [held, latest, settle]);
  const cancel = useCallback(() => { latest.current.store.dismissError(); settle(false); }, [latest, settle]);
  return useMemo(() => ({ pending, requires, request, tracePause, confirm, cancel }), [pending, requires, request, tracePause, confirm, cancel]);
}
