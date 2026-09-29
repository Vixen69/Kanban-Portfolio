// Root of the design v9 app shell: composes the store, filters, clock and
// interaction hooks, and wires every component through props (no context).
// All domain logic stays in core/; every write goes through the store.

import { useEffect, useMemo, useRef } from "react";
import type { BoardConfig, CardPatch, CardState } from "../core/types.ts";
import type { ResourceDraw } from "../core/filters.ts";
import type { MoveTarget } from "./api.ts";
import { columnById } from "./lookup.ts";
import { adminWrites } from "./adminWrites.ts";
import { useBoardStore, type BoardStore } from "./useBoardStore.ts";
import { useBoardCards, useDerived, useDisplayCards, useExerciseShown } from "./useDisplayCards.ts";
import { useCardSort, useSortPanel, type CardSorting, type SortPanel } from "./useCardSort.ts";
import { useDetailProjection } from "./useDetailProjection.ts";
import { useResourceDraw, type CapacityFetch } from "./useCapacity.ts";
import { useFilters, type Filters } from "./useFilters.ts";
import { useBoardHandlers, useShortcuts, useUiState, type UiState } from "./useInteractions.ts";
import { useBoardMoves, type BoardMoves } from "./useBoardMoves.ts";
import { DecisionDialog } from "./components/DecisionDialog.tsx";
import { useNow } from "./useNow.ts";
import { useCellNav } from "./cellNav.ts";
import { useFullscreen, type Fullscreen } from "./useFullscreen.ts";
import { MoveFlash } from "./components/MoveFlash.tsx";
import { useBoardLens, type BoardLens } from "./useRafLens.ts";
import { scopeLabel, scopeTitle } from "./rafLabels.ts";
import { AdminPanel } from "./components/AdminPanel.tsx";
import { ArchiveView } from "./components/ArchiveView.tsx";
import { BoardGrid } from "./components/BoardGrid.tsx";
import { CardDetail } from "./components/CardDetail.tsx";
import { CardEdit } from "./components/CardEdit.tsx";
import { Header } from "./components/Chrome.tsx";
import { EmptyOverlay } from "./components/EmptyOverlay.tsx";

import { AnalyticsView } from "./components/AnalyticsView.tsx";
import type { YearPickerProps } from "./components/YearPicker.tsx";
import { QuickAdd } from "./components/QuickAdd.tsx";
import { Sidebar } from "./components/Sidebar.tsx";

// Everything the screen pieces read, built once per render in Shell.
interface Ctx {
  store: BoardStore;
  config: BoardConfig;
  ui: UiState;
  nowMs: number;
  filters: Filters;
  /** The active (non-archived) cards, remapped for display — the board. */
  cards: CardState[];
  /** The archived cards (design v11 Archives view), remapped for display. */
  archivedCards: CardState[];
  derived: ReturnType<typeof useDerived>;
  /** Every move of the board: drag, decision gate (ADR 052), 4-second signal (ADR 050), edit save. */
  moves: BoardMoves;
  handlers: ReturnType<typeof useBoardHandlers>;
  searchRef: React.RefObject<HTMLInputElement>;
  detailCard: CardState | null;
  focusLabel: string | null;
  /** The exercise shown (ADR 035) and the header selector's data. */
  viewYear: number;
  exercise: YearPickerProps;
  /** The capacity snapshot of the exercise shown and the cards drawing on each transverse domain (ADR 041). */
  capacity: CapacityFetch;
  draw: ResourceDraw;
  /** Refetches the snapshot (after an import). */
  bumpCapacity: () => void;
  /** The board's sort (ADR 044) and its read-out for the sidebar and the header. */
  sorting: CardSorting;
  sortPanel: SortPanel;
  /** The métier lens of the reste à faire (ADR 048), a session state. */
  lens: BoardLens;
  /** Full screen for the meeting room (ADR 050). */
  fullscreen: Fullscreen;
}

function CardModals({ ctx }: { ctx: Ctx }) {
  const { store, config, ui, detailCard } = ctx;
  const { history, flow, anchors, undone } = useDetailProjection(store, config, detailCard, ctx.nowMs);
  // ← → move through the open card's cell (ADR 050); none while editing.
  const nav = useCellNav(ctx.cards, ctx.derived.hidden, config, ui.editing ? null : detailCard, ui.setDetailId);
  if (!detailCard) return null;

  const closeAll = () => { ui.setDetailId(null); ui.setEditing(false); };
  if (ui.editing) {
    return (
      <CardEdit card={detailCard} config={config}
        onClose={closeAll}
        onCancel={() => ui.setEditing(false)}
        onSave={(patch: CardPatch, move: MoveTarget | null) => {
          void ctx.moves.saveEdit(detailCard, patch, move); // the move passes the decision gate (ADR 052)
          ui.setEditing(false);
        }}
        onDelete={(id: string) => { void store.deleteCard(id); closeAll(); }} />
    );
  }
  return (
    <CardDetail card={detailCard} config={config} now={ctx.nowMs} history={history} undone={undone}
      flow={flow} anchors={anchors} nav={nav}
      onClose={closeAll}
      onEdit={() => ui.setEditing(true)}
      onPatch={(patch: CardPatch) => void store.editCard(detailCard.id, patch)}
      onBlock={(reason: string) => void store.blockCard(detailCard.id, reason)}
      onUnblock={() => void store.unblockCard(detailCard.id)}
      onComment={(text: string) => void store.commentCard(detailCard.id, text)}
      onTracePause={() => ctx.moves.gate.tracePause(detailCard)}
      onArchive={() => { void store.archiveCard(detailCard.id); closeAll(); }}
      onUnarchive={() => void store.unarchiveCard(detailCard.id)} />
  );
}


function ShellModals({ ctx }: { ctx: Ctx }) {
  const { store, config, ui } = ctx;
  return (
    <>
      {ui.adding && (
        <QuickAdd config={config} onClose={() => ui.setAdding(false)}
          onCreate={(input) => { void store.createCard({ ...input, exercise: ctx.viewYear }); ui.setAdding(false); }} />
      )}
      {ui.admin && (
        <AdminPanel config={config} cards={store.cards} {...adminWrites(store, ui, ctx.bumpCapacity)} onClose={() => ui.setAdmin(false)}
          initialTab={ui.adminTab} onImported={() => { void store.reload(); ctx.bumpCapacity(); }} defaultYear={ctx.viewYear} />
      )}
      {ui.metrics && (
        <AnalyticsView cards={ctx.cards} events={store.events} config={config} now={ctx.nowMs} year={ctx.viewYear} capacity={ctx.capacity}
          allCards={[...ctx.cards, ...ctx.archivedCards]} onOpenCard={(id) => { ui.setMetrics(false); ui.setDetailId(id); }}
          onClose={() => ui.setMetrics(false)} />
      )}
      {ctx.moves.gate.pending !== null && (
        <DecisionDialog key={ctx.moves.gate.pending.card.id + (ctx.moves.gate.pending.to?.columnId ?? "")} pending={ctx.moves.gate.pending}
          config={config} now={ctx.nowMs} error={store.lastError} onConfirm={ctx.moves.gate.confirm} onCancel={ctx.moves.gate.cancel} />
      )}
      {ui.archive && (
        <ArchiveView cards={ctx.archivedCards} config={config}
          onUnarchive={(id: string) => void store.unarchiveCard(id)}
          onOpen={(card: CardState) => { ui.setArchive(false); ui.setDetailId(card.id); }}
          onClose={() => ui.setArchive(false)} />
      )}
    </>
  );
}

function BoardArea({ ctx }: { ctx: Ctx }) {
  const { config, ui, derived, handlers } = ctx;
  const { drag } = ctx.moves;
  return (
    <div className="board-area">
      <BoardGrid config={config} cards={ctx.cards} hiddenIds={derived.hidden} filterHiddenIds={derived.filterHidden}
        focusedColumn={ui.focusCol} collapsedLanes={ui.collapsedLanes}
        collapsedCols={ui.collapsedCols} now={ctx.nowMs} showCodes={ui.showCodes} showTypes={ui.showTypes}
        sort={ctx.sorting.sort} lens={ctx.lens}
        dragHover={ui.dragHover}
        onFocusColumn={handlers.onFocusColumn} onToggleLane={handlers.onToggleLane}
        onToggleColumnCollapse={handlers.onToggleColumnCollapse}
        onOpen={handlers.onOpenCard}
        onDragStart={drag.onDragStart} onDragEnd={drag.onDragEnd}
        onDrop={drag.onDrop} onDragOverCell={drag.onDragOverCell}
        onDragLeaveCell={drag.onDragLeaveCell}
        onCardOver={drag.onCardOver} onCardDrop={drag.onCardDrop} />
      {derived.view.shown === 0 && <EmptyOverlay onReset={() => { ctx.filters.reset(); ctx.lens.all(); }} />}
      <MoveFlash current={ctx.moves.flash} />
    </div>
  );
}

// Enter in the search box: when exactly one card is shown, its fiche opens.
function openIfSingle(ctx: Ctx): void {
  const shown = ctx.cards.filter((card) => !ctx.derived.hidden.has(card.id));
  if (shown.length === 1 && shown[0] !== undefined) ctx.ui.setDetailId(shown[0].id);
}

function Screen({ ctx }: { ctx: Ctx }) {
  const { config, ui, filters, derived } = ctx;
  return (
    <div className={"app" + (ui.sidebar ? " sidebar-open" : "")}
      style={{ gridTemplateColumns: ui.sidebar ? "214px 1fr" : "0 1fr" }}>
      <Header config={config} stats={derived.stats} view={derived.view} exercise={ctx.exercise}
        filtersActive={filters.active} focusLabel={ctx.focusLabel}
        onResetFilters={filters.reset} onClearFocus={() => ui.setFocusCol(null)}
        sortLabel={ctx.sortPanel.chip} onClearSort={ctx.sorting.clear}
        lensLabel={ctx.lens.active ? `RAF : ${scopeLabel(ctx.lens.scope, config)}` : null}
        lensTitle={scopeTitle(ctx.lens.scope, config)} onClearLens={ctx.lens.all}
        onToggleSidebar={() => ui.setSidebar((open) => !open)}
        onMetrics={() => ui.setMetrics(true)} onAdmin={() => ui.openAdmin("wip")}
        onImport={() => ui.openAdmin("importer")} onExercise={() => ui.openAdmin("exercice")}
        onSnapshots={() => ui.openAdmin("instantanes")}
        onArchive={() => ui.setArchive(true)} archivedCount={ctx.archivedCards.length}
        fullscreen={ctx.fullscreen}
        onAdd={() => ui.setAdding(true)} />
      <Sidebar open={ui.sidebar} config={config} search={filters.state.search} draw={ctx.draw}
        setSearch={filters.setSearch} onSearchEnter={() => openIfSingle(ctx)} filters={filters.state} onToggle={filters.toggle}
        onToggleBlockedOnly={filters.toggleBlockedOnly}
        onToggleNoConstraint={filters.toggleNoConstraint}
        onSetGroup={filters.setGroup} stats={derived.all} view={derived.view}
        filtersActive={filters.active} narrowed={filters.active || ctx.lens.narrowing !== null}
        onReset={filters.reset} searchRef={ctx.searchRef}
        showCodes={ui.showCodes} setShowCodes={ui.setShowCodes}
        showTypes={ui.showTypes} setShowTypes={ui.setShowTypes}
        sorting={ctx.sorting} sortPanel={ctx.sortPanel} />
      <BoardArea ctx={ctx} />
      <CardModals ctx={ctx} />
      <ShellModals ctx={ctx} />
      {ctx.store.lastError !== null && (
        <div className="err-banner" role="alert">
          <span>{ctx.store.lastError}</span>
          <button onClick={ctx.store.dismissError} title="Fermer">✕</button>
        </div>
      )}
    </div>
  );
}

// The ready application: hooks are unconditional here (config is loaded).
function Shell({ store, config }: { store: BoardStore; config: BoardConfig }) {
  // One tick a minute: ages are in days; a 1 s clock re-rendered the whole board (perf pass, 2026-09-10).
  const nowMs = useNow(60_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const ui = useUiState();
  const searchRef = useRef<HTMLInputElement>(null);
  const filters = useFilters(config);
  const sorting = useCardSort();
  const { viewYear, exercise } = useExerciseShown(store.cards, config.exercise.year); // ADR 035: the year shown
  const lens = useBoardLens(config, viewYear); // ADR 048: session only, a reload returns to « tous métiers »
  const moves = useBoardMoves(store, config, ui, !sorting.active); // ADR 052 gate, ADR 050 signal; ADR 044: sorted = no insertion point
  const handlers = useBoardHandlers(ui, config.lanes);
  const fullscreen = useFullscreen(); // ADR 050: F or the header button
  useShortcuts(ui, searchRef, fullscreen.toggle);
  const allCards = useDisplayCards(store.cards, config, viewYear);
  // The detail lookup searches ALL cards so an archived fiche opens from the archive.
  const { cards, archivedCards } = useBoardCards(allCards, viewYear, config.exercise.year, sorting.sort, lens);
  const { capacity, draw, bumpCapacity } = useResourceDraw(viewYear, config); // ADR 041
  const derived = useDerived(cards, config, filters, now, draw, lens.narrowing); // the lens filters too (ADR 048)
  const sortPanel = useSortPanel(cards, derived.hidden, config, sorting.sort, lens);
  const detailCard = allCards.find((card) => card.id === ui.detailId) ?? null;
  // A card removed from the fold (deleted elsewhere) leaves detailId
  // dangling: clear it so Escape acts on the visible context again.
  const { detailId, setDetailId, setEditing } = ui;
  useEffect(() => {
    if (detailId !== null && !store.cards.some((card) => card.id === detailId)) {
      setDetailId(null);
      setEditing(false);
    }
  }, [detailId, setDetailId, setEditing, store.cards]);
  const focusLabel = ui.focusCol ? (columnById(config)[ui.focusCol]?.name ?? null) : null;
  const ctx: Ctx = {
    store, config, ui, nowMs, filters, cards, archivedCards, derived, moves,
    handlers, searchRef, detailCard, focusLabel, viewYear, exercise, capacity, draw, bumpCapacity, sorting, sortPanel, lens,
    fullscreen,
  };

  return <Screen ctx={ctx} />;
}

function AppStatus({ text, error }: { text: string; error: boolean }) {
  return (
    <div className={"app-status" + (error ? " app-status-error" : "")}
      style={{ padding: "40px", font: "500 14px/1.5 'DM Sans', sans-serif",
        color: error ? "#b91c1c" : "#475569" }}>
      {text}
    </div>
  );
}

/**
 * Root of the board UI. Fetches config + board through the store, then
 * renders the full application (header, sidebar, grid, modals).
 * Inputs: none — everything comes from the API via useBoardStore.
 * Output: the app, or a French loading / error screen until the initial
 * fetches resolve. Failure: none — load failures surface via the status.
 */
export function App() {
  const store = useBoardStore();
  if (store.status === "loading") {
    return <AppStatus text="Chargement du portefeuille…" error={false} />;
  }
  if (store.status === "error" || store.config === null) {
    return <AppStatus text={store.error ?? "Erreur inconnue."} error />;
  }
  return <Shell store={store} config={store.config} />;
}
