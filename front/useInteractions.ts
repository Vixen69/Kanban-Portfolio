// View-state hooks of the app shell (design v9 app.jsx): panel/modal state,
// focus and collapse, keyboard shortcuts (/ N S F Esc) and HTML5 drag & drop.
// No domain logic here — moves go through the store, which POSTs intents.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, RefObject } from "react";
import type { CardState, Lane } from "../core/types.ts";
import { UNIFIED_LANE, unifiedColumnIds } from "../core/layout.ts";

import type { MoveTarget } from "./api.ts";
import type { BoardStore } from "./useBoardStore.ts";
import { createDragHoverStore } from "./dragHover.ts";

/** What the admin shell opens on: a configuration tab (wip, categories, champs), or the import / exercise / snapshots gesture shown alone from the gear menu (ADR 046/049). */
export type AdminTab = "wip" | "categories" | "champs" | "importer" | "exercice" | "instantanes";

/**
 * The app shell's view state: sidebar, focused column, collapsed lanes and
 * columns (Pause starts collapsed, per the design), the open modal flags,
 * the codes-projet and types toggles and the drag-over cell.
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
  const [archive, setArchive] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>("wip");
  const [metrics, setMetrics] = useState(false);
  // Opens the admin shell on a configuration tab, or on one gesture shown alone (gear menu, ADR 049).
  const openAdmin = useCallback((tab: AdminTab = "wip") => { setAdminTab(tab); setAdmin(true); }, []);
  const [showCodes, setShowCodes] = useState(false);
  const [showTypes, setShowTypes] = useState(true);
  const [dragHover] = useState(createDragHoverStore); // outside React state: a hover change re-renders two cells, not the shell
  return {
    sidebar, setSidebar, focusCol, setFocusCol,
    collapsedLanes, setCollapsedLanes, collapsedCols, setCollapsedCols,
    detailId, setDetailId, editing, setEditing, adding, setAdding,
    archive, setArchive, admin, setAdmin, adminTab, openAdmin, metrics, setMetrics,
    showCodes, setShowCodes, showTypes, setShowTypes, dragHover,
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
 * Focus / collapse / open handlers over the UI state.
 * Inputs: the UiState and the CURRENT config lanes (the last-expanded-lane
 * guard counts against them — collapsedLanes may hold stale ids after an
 * admin removed a lane). Output: stable-ish callbacks for BoardGrid.
 * One click on a card opens its detail (design v11 — the two-stage
 * focus-then-open is gone; focusing a stage is a column-header click).
 * Failure: none.
 */
export function useBoardHandlers(ui: UiState, lanes: Lane[]) {
  const { setFocusCol, setCollapsedLanes, setCollapsedCols, setDetailId } = ui;
  const onFocusColumn = useCallback(
    (id: string) => setFocusCol((current) => (current === id ? null : id)),
    [setFocusCol],
  );
  const onToggleLane = useCallback(
    (id: string) => setCollapsedLanes((current) => {
      // Guard (design v11): the last expanded lane cannot collapse.
      if (!current.has(id) && lanes.filter((lane) => !current.has(lane.id)).length <= 1) {
        return current;
      }
      return toggled(current, id);
    }),
    [setCollapsedLanes, lanes],
  );
  const onToggleColumnCollapse = useCallback(
    (id: string) => {
      setCollapsedCols((current) => toggled(current, id));
      setFocusCol((current) => (current === id ? null : current));
    },
    [setCollapsedCols, setFocusCol],
  );
  const onOpenCard = useCallback((card: CardState) => setDetailId(card.id), [setDetailId]);
  return { onFocusColumn, onToggleLane, onToggleColumnCollapse, onOpenCard };
}

/**
 * Keyboard shortcuts: / focuses the search (opening the sidebar), N opens
 * QuickAdd, S toggles the sidebar, F toggles full screen (ADR 050); Escape
 * unwinds one level of context per press in the design's exact order:
 * detail → adding → archives → sidebar → focused column → collapsed lanes
 * (in full screen the browser keeps the first Escape to leave it). While
 * typing in a field, only Escape acts; a key held with Ctrl, Cmd or Alt is
 * left to the browser (Ctrl+F finds, Ctrl+S saves).
 * Inputs: the UiState, the sidebar search input ref, the full-screen
 * toggle. Failure: none.
 */
export function useShortcuts(ui: UiState, searchRef: RefObject<HTMLInputElement | null>, onFullscreen: () => void): void {
  const { detailId, adding, archive, sidebar, focusCol, collapsedLanes, setDetailId, setEditing,
    setAdding, setArchive, setSidebar, setFocusCol, setCollapsedLanes } = ui;
  useEffect(() => {
    const unwind = () => {
      if (detailId) { setDetailId(null); setEditing(false); }
      else if (adding) setAdding(false);
      else if (archive) setArchive(false);
      else if (sidebar) setSidebar(false);
      else if (focusCol) setFocusCol(null);
      else if (collapsedLanes.size) setCollapsedLanes(new Set());
    };
    const onKey = (event: KeyboardEvent) => {
      const tag = event.target instanceof Element ? event.target.tagName.toLowerCase() : "";
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (event.key === "Escape") { unwind(); return; }
      if (typing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return; // Ctrl+F, Cmd+F, Ctrl+S… stay the browser's
      if (event.key === "/") {
        event.preventDefault();
        setSidebar(true);
        setTimeout(() => searchRef.current?.focus(), 60);
      } else if (event.key.toLowerCase() === "n") { event.preventDefault(); setAdding(true); }
      else if (event.key.toLowerCase() === "s") setSidebar((open) => !open);
      else if (event.key.toLowerCase() === "f" && !event.repeat) { event.preventDefault(); onFullscreen(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailId, adding, archive, sidebar, focusCol, collapsedLanes, setDetailId, setEditing,
    setAdding, setArchive, setSidebar, setFocusCol, setCollapsedLanes, searchRef, onFullscreen]);
}

/**
 * Native HTML5 drag & drop of cards between cells — and onto other cards
 * (ADR 019): dropping on a card inserts the dragged one just before it in
 * that card's cell. The dragged id rides in a ref (and dataTransfer as a
 * fallback); every drop POSTs a move intent through the store — the server
 * records the event.
 * Inputs: the board store, the UiState (dragOver highlight + dropCardId),
 * reorder: false while the board is sorted (ADR 044) — a drop onto a card
 * is then a plain move into that card's cell, with no beforeId and no
 * insertion mark; onMoved: called with the card as it was and its target
 * once the move is written (the 4-second signal, ADR 050).
 * Output: the seven handlers BoardGrid expects. Failure: a refused move is
 * logged by the store; the board simply does not change.
 */
export function useDragHandlers(store: BoardStore, ui: UiState, reorder: boolean, onMoved: (card: CardState, to: MoveTarget) => void) {
  const dragId = useRef<string | null>(null);
  const { dragHover } = ui;
  const { cards, moveCard } = store;
  const onDragStart = useCallback((event: DragEvent, card: CardState) => {
    dragId.current = card.id;
    event.dataTransfer.effectAllowed = "move";
    try { event.dataTransfer.setData("text/plain", card.id); } catch { /* older engines */ }
  }, []);
  const onDragEnd = useCallback(() => {
    dragId.current = null;
    dragHover.set({ over: null, dropCardId: null });
  }, [dragHover]);
  const onDrop = useCallback((event: DragEvent, laneId: string, columnId: string) => {
    event.preventDefault();
    const id = dragId.current ?? event.dataTransfer.getData("text/plain");
    dragId.current = null;
    dragHover.set({ over: null, dropCardId: null });
    if (!id) return;
    const card = cards.find((candidate) => candidate.id === id);
    if (!card) return;
    // A unified cell (before the RDO, ADR 039) has no canal: the card keeps its own.
    const target = laneId === UNIFIED_LANE ? card.laneId : laneId;
    if (card.laneId === target && card.columnId === columnId) return;
    const to = { laneId: target, columnId };
    void moveCard(id, to).then((ok) => { if (ok) onMoved(card, to); });
  }, [cards, moveCard, dragHover, onMoved]);
  const cellHover = useCellHoverHandlers(ui);
  const cardLevel = useCardDropHandlers(dragId, store, ui, reorder, onMoved);
  return { onDragStart, onDragEnd, onDrop, ...cellHover, ...cardLevel };
}

// Cell-level hover half of the drag flow: highlight the hovered cell and
// clear any card insertion marker (cards stop propagation, so this only
// fires over cell background).
function useCellHoverHandlers(ui: UiState) {
  const { dragHover } = ui;
  const onDragOverCell = useCallback((event: DragEvent, laneId: string, columnId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    dragHover.set({ over: { laneId, columnId }, dropCardId: null });
  }, [dragHover]);
  const onDragLeaveCell = useCallback(() => {
    // Design no-op: the next dragover repaints the highlighted cell.
  }, []);
  return { onDragOverCell, onDragLeaveCell };
}

// The card-level half of the drag flow (ADR 019): hovering a card marks it
// as the insertion target; dropping on it moves the dragged card into ITS
// cell, inserted just before it (the move intent carries beforeId).
// Where a card dropped ONTO another goes. In a unified cell (ADR 039) the
// dragged card keeps its own canal — a lane change there would count as a
// stage entry (ADR 019). With the manual order in force the move inserts
// before the target; on a SORTED board (ADR 044) there is no insertion
// point: the drop is a plain move into the target's cell, or nothing when
// the card is already there. The métier lens hides cards like any filter
// (ADR 048, ADR 031): the manual order of the visible ones stays in force.
function cardDropMove(id: string, target: CardState, store: BoardStore, reorder: boolean): MoveTarget | null {
  const unified = store.config === null ? new Set<string>() : unifiedColumnIds(store.config);
  const dragged = store.cards.find((candidate) => candidate.id === id);
  const laneId = unified.has(target.columnId) && dragged !== undefined ? dragged.laneId : target.laneId;
  if (reorder) return { laneId, columnId: target.columnId, beforeId: target.id };
  if (dragged === undefined || (dragged.laneId === laneId && dragged.columnId === target.columnId)) return null;
  return { laneId, columnId: target.columnId };
}

function useCardDropHandlers(
  dragId: React.MutableRefObject<string | null>,
  store: BoardStore,
  ui: UiState,
  reorder: boolean,
  onMoved: (card: CardState, to: MoveTarget) => void,
) {
  const { dragHover } = ui;
  const { moveCard } = store;
  const onCardOver = useCallback((event: DragEvent, card: CardState) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const id = dragId.current;
    const next = reorder && id !== null && id !== card.id ? card.id : null; // no insertion mark on a sorted board
    // stopPropagation keeps onDragOverCell from firing: refresh the cell
    // highlight from the hovered card so it never lags a cell behind.
    dragHover.set({ over: { laneId: card.laneId, columnId: card.columnId }, dropCardId: next });
  }, [dragId, reorder, dragHover]);
  const onCardDrop = useCallback((event: DragEvent, target: CardState) => {
    event.preventDefault();
    event.stopPropagation();
    const id = dragId.current ?? event.dataTransfer.getData("text/plain");
    dragId.current = null;
    dragHover.set({ over: null, dropCardId: null });
    if (!id || id === target.id) return;
    const move = cardDropMove(id, target, store, reorder);
    const dragged = store.cards.find((candidate) => candidate.id === id);
    if (move !== null) void moveCard(id, move).then((ok) => { if (ok && dragged !== undefined) onMoved(dragged, move); });
  }, [dragId, moveCard, reorder, dragHover, store, onMoved]);
  return { onCardOver, onCardDrop };
}
