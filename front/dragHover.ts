// Where a dragged card hovers — the cell under it and the card it would be
// inserted before (ADR 019) — kept OUT of the shell's React state: a drag
// crossing the board changes it at every ticket, and as shell state each
// change re-rendered the whole screen to repaint two cells. Only the cells
// that read it re-render (React 18's built-in useSyncExternalStore).

import { useSyncExternalStore } from "react";
import type { CardState } from "../core/types.ts";
import { UNIFIED_LANE } from "../core/layout.ts";

/** The hover state of a drag: the cell under the card, the insertion target. */
export interface DragHover {
  over: { laneId: string; columnId: string } | null;
  dropCardId: string | null;
}

/** A tiny subscribable holder of the DragHover. */
export interface DragHoverStore {
  get: () => DragHover;
  /** Replaces the given fields; listeners hear of it only when something changed. */
  set: (next: Partial<DragHover>) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * A fresh hover store, empty (no drag).
 * Inputs: none. Output: the store. Failure: none.
 */
export function createDragHoverStore(): DragHoverStore {
  let state: DragHover = { over: null, dropCardId: null };
  const listeners = new Set<() => void>();
  const sameOver = (a: DragHover["over"], b: DragHover["over"]) =>
    a === b || (a !== null && b !== null && a.laneId === b.laneId && a.columnId === b.columnId);
  return {
    get: () => state,
    set: (next) => {
      const over = next.over === undefined ? state.over : next.over;
      const dropCardId = next.dropCardId === undefined ? state.dropCardId : next.dropCardId;
      if (sameOver(over, state.over) && dropCardId === state.dropCardId) return;
      state = { over: sameOver(over, state.over) ? state.over : over, dropCardId };
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/**
 * Whether the dragged card is over this cell. A canal-less cell (ADR 039)
 * is hovered by any lane of its column.
 * Inputs: the store, the cell's lane (or UNIFIED_LANE) and column.
 * Output: true while hovered. Failure: none.
 */
export function useCellHovered(store: DragHoverStore, laneId: string, columnId: string): boolean {
  return useSyncExternalStore(store.subscribe, () => {
    const over = store.get().over;
    return over !== null && over.columnId === columnId && (laneId === UNIFIED_LANE || over.laneId === laneId);
  });
}

/**
 * The insertion target when it is one of this cell's cards, else null —
 * so only the cells holding the old and the new target re-render.
 * Inputs: the store, the cell's cards. Output: a card id or null.
 * Failure: none.
 */
export function useCellDropCard(store: DragHoverStore, cards: readonly CardState[]): string | null {
  return useSyncExternalStore(store.subscribe, () => {
    const id = store.get().dropCardId;
    return id !== null && cards.some((card) => card.id === id) ? id : null;
  });
}
