// Cell-level interaction state: which cell is focused, which lanes are
// collapsed, the drag-over highlight, and the two-stage card-open (detail).

import { useCallback, useRef, useState } from "react";
import type { CardState } from "../../core/types.ts";
import type { CellRef } from "../components/Cell.tsx";

/**
 * Focus-cell state: clicking a cell focuses it (clicking again unfocuses);
 * enterFocus targets the last clicked cell, else the first card's cell.
 * Inputs: the current card states. Output: focus state + actions.
 * Failure: none — enterFocus is a no-op on an empty board.
 */
export function useFocusCell(cards: CardState[]) {
  const [focusCell, setFocusCell] = useState<CellRef | null>(null);
  const lastCell = useRef<CellRef | null>(null);
  const onFocusCell = useCallback((cell: CellRef) => {
    lastCell.current = cell;
    setFocusCell((current) =>
      current && current.laneId === cell.laneId && current.columnId === cell.columnId ? null : cell,
    );
  }, []);
  const clearFocus = useCallback(() => setFocusCell(null), []);
  const enterFocus = useCallback(() => {
    const first = cards[0];
    const target = lastCell.current ?? (first ? { laneId: first.laneId, columnId: first.columnId } : null);
    if (target) setFocusCell(target);
  }, [cards]);
  return { focusCell, onFocusCell, clearFocus, enterFocus };
}

/**
 * Collapsed-lanes state: any lane collapses to a single summary row.
 * Collapsing the lane of the focused cell leaves focus first — the board
 * must never strand itself in a fully dimmed focus view.
 * Inputs: the focused cell's lane id (or null) and clearFocus.
 * Output: the collapsed set + the toggle action. Failure: none.
 */
export function useCollapsedLanes(focusedLaneId: string | null, clearFocus: () => void) {
  const [collapsedLanes, setCollapsedLanes] = useState<ReadonlySet<string>>(new Set());
  const onToggleLane = useCallback(
    (laneId: string) => {
      if (focusedLaneId === laneId) clearFocus();
      setCollapsedLanes((current) => {
        const next = new Set(current);
        if (next.has(laneId)) next.delete(laneId);
        else next.add(laneId);
        return next;
      });
    },
    [focusedLaneId, clearFocus],
  );
  return { collapsedLanes, onToggleLane };
}

/**
 * Drag-over highlight state. dragover fires continuously, so the same
 * state object is kept while the pointer stays over one cell and React
 * skips redundant re-renders.
 * Output: the highlighted cell (or null) + the setter. Failure: none.
 */
export function useDragOverCell() {
  const [dragOver, setDragOver] = useState<CellRef | null>(null);
  const onDragOver = useCallback((cell: CellRef | null) => {
    setDragOver((current) =>
      current === cell ||
      (current && cell && current.laneId === cell.laneId && current.columnId === cell.columnId)
        ? current
        : cell,
    );
  }, []);
  return { dragOver, onDragOver };
}

/**
 * Two-stage card click (design P5): clicking a card whose cell is not
 * focused focuses that cell; clicking a card in the focused cell opens
 * its detail. The open card is tracked by id so the modal always shows
 * the freshest folded state.
 * Inputs: the focus-cell bundle (from useFocusCell) and the card states.
 * Output: the open card (or null), the click handler and close.
 * Failure: none — a vanished card id simply closes the modal.
 */
export function useCardDetail(
  focus: { focusCell: CellRef | null; onFocusCell: (cell: CellRef) => void },
  cards: CardState[],
) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailCard = detailId === null ? null : (cards.find((card) => card.id === detailId) ?? null);
  const close = useCallback(() => setDetailId(null), []);
  const onOpen = useCallback(
    (card: CardState) => {
      const focused = focus.focusCell;
      if (focused && focused.laneId === card.laneId && focused.columnId === card.columnId) {
        setDetailId(card.id);
        return;
      }
      focus.onFocusCell({ laneId: card.laneId, columnId: card.columnId });
    },
    [focus],
  );
  return { detailCard, onOpen, close };
}
