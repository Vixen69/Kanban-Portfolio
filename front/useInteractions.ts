// View-state hooks of the app shell (design v9 app.jsx): panel/modal state,
// focus and collapse, keyboard shortcuts (/ N S Esc) and HTML5 drag & drop.
// No domain logic here — moves go through the store, which POSTs intents.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, RefObject } from "react";
import type { CardState } from "../core/types.ts";
import type { MoveTarget } from "./api.ts";
import type { BoardStore } from "./useBoardStore.ts";

/**
 * The app shell's view state: sidebar, focused column, collapsed lanes and
 * columns (Pause starts collapsed, per the design), the open modal flags,
 * the codes-projet toggle and the drag-over cell.
 * Output: state values + setters, one object per render. Failure: none.
 */
export function useUiState() {
  const [sidebar, setSidebar] = useState(false);
  const [focusCol, setFocusCol] = useState<string | null>(null);
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(() => new Set());
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(() => new Set(["pause"]));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [metrics, setMetrics] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [dragOver, setDragOver] = useState<MoveTarget | null>(null);
  return {
    sidebar, setSidebar, focusCol, setFocusCol,
    collapsedLanes, setCollapsedLanes, collapsedCols, setCollapsedCols,
    detailId, setDetailId, editing, setEditing, adding, setAdding,
    admin, setAdmin, metrics, setMetrics, showCodes, setShowCodes,
    dragOver, setDragOver,
  };
}

/** The bundle useUiState returns (state + setters of the app shell). */
export type UiState = ReturnType<typeof useUiState>;

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Focus / collapse / two-stage open handlers over the UI state.
 * Input: the UiState. Output: stable-ish callbacks for BoardGrid.
 * Two-stage click (design P5): a click on a card in a non-focused column
 * focuses that stage; a second click opens the detail. Failure: none.
 */
export function useBoardHandlers(ui: UiState) {
  const { focusCol, setFocusCol, setCollapsedLanes, setCollapsedCols, setDetailId } = ui;
  const onFocusColumn = useCallback(
    (id: string) => setFocusCol((current) => (current === id ? null : id)),
    [setFocusCol],
  );
  const onToggleLane = useCallback(
    (id: string) => setCollapsedLanes((current) => toggled(current, id)),
    [setCollapsedLanes],
  );
  const onToggleColumnCollapse = useCallback(
    (id: string) => {
      setCollapsedCols((current) => toggled(current, id));
      setFocusCol((current) => (current === id ? null : current));
    },
    [setCollapsedCols, setFocusCol],
  );
  const onOpenCard = useCallback(
    (card: CardState) => {
      if (focusCol !== card.columnId) setFocusCol(card.columnId);
      else setDetailId(card.id);
    },
    [focusCol, setFocusCol, setDetailId],
  );
  return { onFocusColumn, onToggleLane, onToggleColumnCollapse, onOpenCard };
}

/**
 * Keyboard shortcuts: / focuses the search (opening the sidebar), N opens
 * QuickAdd, S toggles the sidebar; Escape unwinds one level of context per
 * press in the design's exact order: detail → adding → sidebar → focused
 * column → collapsed lanes. While typing in a field, only Escape acts.
 * Inputs: the UiState and the sidebar search input ref. Failure: none.
 */
export function useShortcuts(ui: UiState, searchRef: RefObject<HTMLInputElement | null>): void {
  const { detailId, adding, sidebar, focusCol, collapsedLanes, setDetailId, setEditing,
    setAdding, setSidebar, setFocusCol, setCollapsedLanes } = ui;
  useEffect(() => {
    const unwind = () => {
      if (detailId) { setDetailId(null); setEditing(false); }
      else if (adding) setAdding(false);
      else if (sidebar) setSidebar(false);
      else if (focusCol) setFocusCol(null);
      else if (collapsedLanes.size) setCollapsedLanes(new Set());
    };
    const onKey = (event: KeyboardEvent) => {
      const tag = event.target instanceof Element ? event.target.tagName.toLowerCase() : "";
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (event.key === "Escape") { unwind(); return; }
      if (typing) return;
      if (event.key === "/") {
        event.preventDefault();
        setSidebar(true);
        setTimeout(() => searchRef.current?.focus(), 60);
      } else if (event.key.toLowerCase() === "n") { event.preventDefault(); setAdding(true); }
      else if (event.key.toLowerCase() === "s") setSidebar((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailId, adding, sidebar, focusCol, collapsedLanes, setDetailId, setEditing,
    setAdding, setSidebar, setFocusCol, setCollapsedLanes, searchRef]);
}

/**
 * Native HTML5 drag & drop of cards between cells. The dragged id rides in
 * a ref (and dataTransfer as a fallback); a drop on a different cell POSTs
 * a move intent through the store — the server records the event.
 * Inputs: the board store, the UiState (dragOver highlight).
 * Output: the five handlers BoardGrid expects. Failure: a refused move is
 * logged by the store; the board simply does not change.
 */
export function useDragHandlers(store: BoardStore, ui: UiState) {
  const dragId = useRef<string | null>(null);
  const { setDragOver } = ui;
  const { cards, moveCard } = store;
  const onDragStart = useCallback((event: DragEvent, card: CardState) => {
    dragId.current = card.id;
    event.dataTransfer.effectAllowed = "move";
    try { event.dataTransfer.setData("text/plain", card.id); } catch { /* older engines */ }
  }, []);
  const onDragEnd = useCallback(() => {
    dragId.current = null;
    setDragOver(null);
  }, [setDragOver]);
  const onDragOverCell = useCallback((event: DragEvent, laneId: string, columnId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOver((current) =>
      current && current.laneId === laneId && current.columnId === columnId
        ? current
        : { laneId, columnId },
    );
  }, [setDragOver]);
  const onDragLeaveCell = useCallback(() => {
    // Design no-op: the next dragover repaints the highlighted cell.
  }, []);
  const onDrop = useCallback((event: DragEvent, laneId: string, columnId: string) => {
    event.preventDefault();
    const id = dragId.current ?? event.dataTransfer.getData("text/plain");
    dragId.current = null;
    setDragOver(null);
    if (!id) return;
    const card = cards.find((candidate) => candidate.id === id);
    if (!card || (card.laneId === laneId && card.columnId === columnId)) return;
    void moveCard(id, { laneId, columnId });
  }, [cards, moveCard, setDragOver]);
  return { onDragStart, onDragEnd, onDragOverCell, onDragLeaveCell, onDrop };
}
