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

/**
 * The move gate of the board.
 * Inputs: the board store (cards, events, moveCard, decideCard, lastError),
 * the config (gestures read against its columns and decisions).
 * Output: the MoveGate. Failure: a refused write keeps the fiche open; the
 * server's French message is the store's lastError (shown in the fiche);
 * nothing half-written (the move and its decisions travel together).
 */
export function useMoveGate(store: BoardStore, config: BoardConfig): MoveGate {
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const latest = useLatest({ store, config, pending });
  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  }, []);
  const request = useCallback((card: CardState, to: MoveTarget): Promise<boolean> => {
    const { store: current, config: cfg } = latest.current;
    const from = { laneId: card.laneId, columnId: card.columnId };
    const gesture = readGesture(cfg, from, to, laneChosen(cfg, card.id, current.events));
    const required = requiredDecisions(cfg, gesture);
    if (required.length === 0) return current.moveCard(card.id, to);
    resolver.current?.(false); // a fiche left open is abandoned, never written
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      current.dismissError();
      setPending({ card, to, gesture, required });
    });
  }, [latest]);
  const tracePause = useCallback((card: CardState) => {
    resolver.current?.(false);
    resolver.current = null;
    latest.current.store.dismissError();
    setPending({ card, to: null, gesture: null, required: [PAUSE_DECISION_ID] });
  }, [latest]);
  const confirm = useCallback(async (decisions: DecisionInput[]) => {
    const { store: current, pending: held } = latest.current;
    if (held === null) return;
    const ok = held.to === null
      ? await current.decideCard(held.card.id, decisions[0]!)
      : await current.moveCard(held.card.id, held.to, decisions);
    if (ok) settle(true); // refused: the fiche stays open over the store's lastError
  }, [latest, settle]);
  const cancel = useCallback(() => settle(false), [settle]);
  return useMemo(() => ({ pending, request, tracePause, confirm, cancel }), [pending, request, tracePause, confirm, cancel]);
}
