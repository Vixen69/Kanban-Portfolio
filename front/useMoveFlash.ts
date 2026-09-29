// The last move, signalled (author, 2026-09-29: « les 4 secondes, c'est
// convaincant »): after a drop, the moved card wears a 2px ink outline for
// four seconds — no fade, it simply ends — so the room sees where it went
// among 150 bars; a zone invisible on screen tells screen readers the same
// thing in words. The move itself is the event in the log, as always.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardConfig, CardState } from "../core/types.ts";
import { unifiedColumnIds } from "../core/layout.ts";
import type { MoveTarget } from "./api.ts";

/** How long the moved card stays outlined. */
export const MOVE_FLASH_MS = 4000;

/** The card being signalled and the sentence read to screen readers. */
export interface MoveFlashState {
  id: string;
  text: string;
}

// A position in words: « Actifs · Projets », or the column alone for a
// canal-less column (ADR 039).
function place(config: BoardConfig, laneId: string, columnId: string): string {
  const column = config.columns.find((entry) => entry.id === columnId)?.name ?? columnId;
  if (unifiedColumnIds(config).has(columnId)) return column;
  const lane = config.lanes.find((entry) => entry.id === laneId)?.name ?? laneId;
  return `${column} · ${lane}`;
}

/**
 * The sentence announcing a move: « Titre : Demandes → Études/Cadrage ·
 * Projets », or « Titre : réordonné dans … » within the same cell.
 * Inputs: the config, the card before the move, the target.
 * Output: the sentence. Failure: none.
 */
export function moveSentence(config: BoardConfig, card: CardState, to: MoveTarget): string {
  const from = place(config, card.laneId, card.columnId);
  const dest = place(config, to.laneId, to.columnId);
  return from === dest ? `${card.title} : réordonné dans ${dest}` : `${card.title} : ${from} → ${dest}`;
}

/**
 * The move signal: flash(card, to) after a successful move; it clears by
 * itself after MOVE_FLASH_MS, a new move replacing the previous one.
 * Input: the config. Output: the current state and flash. Failure: none.
 */
export function useMoveFlash(config: BoardConfig): { current: MoveFlashState | null; flash: (card: CardState, to: MoveTarget) => void } {
  const [current, setCurrent] = useState<MoveFlashState | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const flash = useCallback((card: CardState, to: MoveTarget) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setCurrent({ id: card.id, text: moveSentence(config, card, to) });
    timer.current = window.setTimeout(() => setCurrent(null), MOVE_FLASH_MS);
  }, [config]);
  return { current, flash };
}
