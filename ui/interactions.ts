// Interaction hooks of the board: focus cell, lane collapse, card movement
// and the keyboard shortcuts. Split small so each stays a readable unit.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardConfig, CardState } from "../core/types.ts";
import { neighbourCell } from "../core/board.ts";
import type { BoardStore } from "./useBoardStore.ts";
import type { CellRef } from "./components/Cell.tsx";

/** The three keyboard-switchable view modes of CLAUDE.md section 5. */
export type ViewMode = "normal" | "radiator" | "focus";

const ARROW_DIRECTIONS: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

function refocusCard(cardId: string): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`)?.focus();
  });
}

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
 * Card movement: drop from drag & drop, and the Ctrl+arrow keyboard
 * fallback (moves to the neighbouring cell, then restores focus).
 * Inputs: the board config and the store. Output: onDrop and onMoveKey.
 * Failure: none — moves at the board edge are silently ignored.
 */
export function useCardMovement(config: BoardConfig, store: BoardStore) {
  const onDrop = useCallback(
    (cardId: string, to: CellRef) => store.moveCard(cardId, to),
    [store],
  );
  const onMoveKey = useCallback(
    (cardId: string, key: string) => {
      const direction = ARROW_DIRECTIONS[key];
      const card = store.cards.find((state) => state.id === cardId);
      if (!direction || !card) return;
      const target = neighbourCell(config, card.laneId, card.columnId, direction);
      if (!target) return;
      store.moveCard(cardId, target);
      refocusCard(cardId);
    },
    [config, store],
  );
  return { onDrop, onMoveKey };
}

/**
 * View-mode state: normal/radiator as the base, focus overlays it.
 * Inputs: enterFocus/clearFocus from useFocusCell, whether focus is active.
 * Output: baseMode, the effective mode, and the mode-switch action.
 * Failure: none.
 */
export function useViewMode(enterFocus: () => void, clearFocus: () => void, focusActive: boolean) {
  const [baseMode, setBaseMode] = useState<"normal" | "radiator">("radiator");
  const onMode = useCallback(
    (next: ViewMode) => {
      if (next === "focus") {
        enterFocus();
        return;
      }
      clearFocus();
      setBaseMode(next);
    },
    [enterFocus, clearFocus],
  );
  const mode: ViewMode = focusActive ? "focus" : baseMode;
  return { baseMode, mode, onMode };
}

/**
 * The clock the aging visuals read. Re-reads the time periodically so a
 * board left on a wall display keeps darkening across day boundaries.
 * Input: refresh interval in ms (default one hour — day-level visuals
 * need no finer grain). Output: the current Date. Failure: none.
 */
export function useNow(intervalMs = 3_600_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Boolean UI state with stable actions (sidebar, codes, metrics panels).
 * Input: the initial value. Output: { on, toggle, setOn, setOff }.
 * Failure: none.
 */
export function useToggle(initial: boolean) {
  const [on, set] = useState(initial);
  const toggle = useCallback(() => set((value) => !value), []);
  const setOn = useCallback(() => set(true), []);
  const setOff = useCallback(() => set(false), []);
  return { on, toggle, setOn, setOff };
}

/**
 * Global shortcuts: 1 normal, 2 radiateur, 3 focus, S sidebar, M metrics,
 * / search, Escape unwinds (the caller decides what Escape closes first —
 * it works even while typing, so the search box can be left with the
 * keyboard). Other keys are ignored while typing or with a modifier held
 * (Ctrl+1 must stay a browser shortcut). Inputs: the mode-switch action,
 * the Escape action, the sidebar toggle, the search-focus action and the
 * metrics toggle. Output: none (effect only). Failure: none.
 */
export function useModeShortcuts(
  onMode: (mode: ViewMode) => void,
  onEscape: () => void,
  onToggleSidebar: () => void,
  onSlash: () => void,
  onMetrics: () => void,
) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === "Escape") {
        onEscape();
        return;
      }
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase() ?? "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === "1") onMode("normal");
      else if (event.key === "2") onMode("radiator");
      else if (event.key === "3") onMode("focus");
      else if (event.key.toLowerCase() === "s") onToggleSidebar();
      else if (event.key.toLowerCase() === "m") onMetrics();
      else if (event.key === "/") {
        event.preventDefault();
        onSlash();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onMode, onEscape, onToggleSidebar, onSlash, onMetrics]);
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

function focusSiblingCard(card: HTMLElement, direction: "up" | "down"): void {
  const cell = card.closest(".cell");
  if (!cell) return;
  const all = [...cell.querySelectorAll<HTMLElement>("[data-card-id]")];
  const next = all[all.indexOf(card) + (direction === "down" ? 1 : -1)];
  next?.focus();
}

function focusNeighbourCellCard(
  config: BoardConfig,
  cards: CardState[],
  cardId: string,
  direction: "left" | "right",
): void {
  const card = cards.find((state) => state.id === cardId);
  if (!card) return;
  const target = neighbourCell(config, card.laneId, card.columnId, direction);
  if (!target) return;
  document
    .querySelector<HTMLElement>(
      `.cell[data-lane-id="${target.laneId}"][data-column-id="${target.columnId}"] [data-card-id]`,
    )
    ?.focus();
}

/**
 * Keyboard navigation between cards (Sprint 2): with a card focused,
 * plain arrows move the SELECTION — up/down within the cell, left/right
 * to the neighbouring column's first card (Ctrl+arrows still move the
 * card itself). Inputs: the board config and the current card states.
 * Output: none (effect only). Failure: none — edges and empty target
 * cells are silently ignored.
 */
export function useCardNavigation(config: BoardConfig, cards: CardState[]) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const direction = ARROW_DIRECTIONS[event.key];
      if (!direction) return;
      const active = document.activeElement as HTMLElement | null;
      const cardId = active?.dataset["cardId"];
      if (!active || !cardId) return;
      event.preventDefault();
      if (direction === "up" || direction === "down") focusSiblingCard(active, direction);
      else focusNeighbourCellCard(config, cards, cardId, direction);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [config, cards]);
}
