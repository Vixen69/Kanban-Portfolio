// Root of the design v9 app shell: composes the store, filters, clock and
// interaction hooks, and wires every component through props (no context).
// All domain logic stays in core/; every write goes through the store.

import { useEffect, useMemo, useRef } from "react";
import type { BoardConfig, CardPatch, CardState } from "../core/types.ts";
import { portfolioStats } from "../core/board.ts";
import { reconcileCardRefs } from "../core/config.ts";
import { dimmedCardIds, portfolioCounts, viewCounts } from "../core/filters.ts";
import { cardHistory } from "../core/history.ts";
import type { MoveTarget } from "./api.ts";
import { columnById } from "./lookup.ts";
import { useBoardStore, type BoardStore } from "./useBoardStore.ts";
import { useFilters, type Filters } from "./useFilters.ts";
import {
  useBoardHandlers,
  useDragHandlers,
  useShortcuts,
  useUiState,
  type UiState,
} from "./useInteractions.ts";
import { useNow } from "./useNow.ts";
import { AdminPanel } from "./components/AdminPanel.tsx";
import { BoardGrid } from "./components/BoardGrid.tsx";
import { CardDetail } from "./components/CardDetail.tsx";
import { CardEdit } from "./components/CardEdit.tsx";
import { Header } from "./components/Chrome.tsx";
import { EmptyOverlay } from "./components/EmptyOverlay.tsx";
import { MetricsView } from "./components/MetricsView.tsx";
import { QuickAdd } from "./components/QuickAdd.tsx";
import { Sidebar } from "./components/Sidebar.tsx";

/** The blocked-state change a CardEdit save may carry (null = untouched). */
export interface BlockIntent {
  blocked: boolean;
  reason: string;
}

// Everything the screen pieces read, built once per render in Shell.
interface Ctx {
  store: BoardStore;
  config: BoardConfig;
  ui: UiState;
  nowMs: number;
  filters: Filters;
  /** Folded cards remapped for display (reconcileCardRefs) — what renders. */
  cards: CardState[];
  derived: ReturnType<typeof useDerived>;
  drag: ReturnType<typeof useDragHandlers>;
  handlers: ReturnType<typeof useBoardHandlers>;
  searchRef: React.RefObject<HTMLInputElement>;
  detailCard: CardState | null;
  focusLabel: string | null;
}

// Display-level remap (ADR 013): a card whose lane/column/domain/type was
// removed by an admin edit is shown against the first config entry, so the
// whole portfolio stays visible. Never writes an event — the fold keeps the
// original references (reconcileCardRefs is display-only).
function useDisplayCards(cards: CardState[], config: BoardConfig): CardState[] {
  return useMemo(
    () =>
      cards.map((card) => {
        const refs = reconcileCardRefs(card, config);
        const unchanged =
          refs.laneId === card.laneId && refs.columnId === card.columnId &&
          refs.domain === card.domain && refs.typeId === card.typeId;
        return unchanged ? card : { ...card, ...refs };
      }),
    [cards, config],
  );
}

// Filter/count projections over the folded cards (all from core/).
function useDerived(cards: CardState[], config: BoardConfig, filters: Filters, now: Date) {
  const dimmed = useMemo(() => dimmedCardIds(cards, filters.state), [cards, filters.state]);
  const view = useMemo(
    () => viewCounts(cards, dimmed, config, now),
    [cards, dimmed, config, now],
  );
  const all = useMemo(() => portfolioCounts(cards, config, now), [cards, config, now]);
  const stats = useMemo(() => portfolioStats(cards), [cards]);
  return { dimmed, view, all, stats };
}

// One edit-form save, decomposed into its API intents in order: field
// patch, then move, then the blocked-state delta (a flag flip, or a fresh
// blocked intent when only the reason changed — CardEdit builds it). The
// sequence stops at the first refused intent so a failed patch never lets
// the move/block half-apply; the store surfaces the failure via lastError.
async function saveEdit(
  store: BoardStore,
  card: CardState,
  patch: CardPatch,
  move: MoveTarget | null,
  block: BlockIntent | null,
): Promise<void> {
  if (Object.keys(patch).length > 0 && !(await store.editCard(card.id, patch))) return;
  if (move && !(await store.moveCard(card.id, move))) return;
  if (!block) return;
  if (block.blocked) await store.blockCard(card.id, block.reason);
  else if (card.blocked) await store.unblockCard(card.id);
}

function CardModals({ ctx }: { ctx: Ctx }) {
  const { store, config, ui, detailCard } = ctx;
  const history = useMemo(
    () => (detailCard ? cardHistory(store.events, detailCard.id, config) : []),
    [store.events, detailCard, config],
  );
  if (!detailCard) return null;
  const closeAll = () => { ui.setDetailId(null); ui.setEditing(false); };
  if (ui.editing) {
    return (
      <CardEdit card={detailCard} config={config}
        onClose={closeAll}
        onCancel={() => ui.setEditing(false)}
        onSave={(patch: CardPatch, move: MoveTarget | null, block?: BlockIntent | null) => {
          void saveEdit(store, detailCard, patch, move, block ?? null);
          ui.setEditing(false);
        }}
        onDelete={(id: string) => { void store.deleteCard(id); closeAll(); }} />
    );
  }
  return (
    <CardDetail card={detailCard} config={config} now={ctx.nowMs} history={history}
      onClose={closeAll}
      onEdit={() => ui.setEditing(true)}
      onBlock={(reason: string) => void store.blockCard(detailCard.id, reason)}
      onUnblock={() => void store.unblockCard(detailCard.id)}
      onComment={(text: string) => void store.commentCard(detailCard.id, text)} />
  );
}

function ShellModals({ ctx }: { ctx: Ctx }) {
  const { store, config, ui } = ctx;
  return (
    <>
      {ui.adding && (
        <QuickAdd config={config} onClose={() => ui.setAdding(false)}
          onCreate={(input) => { void store.createCard(input); ui.setAdding(false); }} />
      )}
      {ui.admin && (
        <AdminPanel config={config}
          onApply={async (next: BoardConfig) => {
            const failure = await store.saveConfig(next);
            if (failure === null) ui.setAdmin(false);
            return failure;
          }}
          onReset={async () => {
            const failure = await store.resetConfig();
            if (failure === null) ui.setAdmin(false);
            return failure;
          }}
          onClose={() => ui.setAdmin(false)} />
      )}
      {ui.metrics && (
        <MetricsView cards={ctx.cards} events={store.events} config={config}
          now={ctx.nowMs} onClose={() => ui.setMetrics(false)} />
      )}
    </>
  );
}

function BoardArea({ ctx }: { ctx: Ctx }) {
  const { config, ui, derived, drag, handlers } = ctx;
  return (
    <div className="board-area">
      <BoardGrid config={config} cards={ctx.cards} dimmedIds={derived.dimmed}
        focusedColumn={ui.focusCol} collapsedLanes={ui.collapsedLanes}
        collapsedCols={ui.collapsedCols} now={ctx.nowMs} showCodes={ui.showCodes}
        dragOver={ui.dragOver}
        onFocusColumn={handlers.onFocusColumn} onToggleLane={handlers.onToggleLane}
        onToggleColumnCollapse={handlers.onToggleColumnCollapse}
        onOpen={handlers.onOpenCard}
        onDragStart={drag.onDragStart} onDragEnd={drag.onDragEnd}
        onDrop={drag.onDrop} onDragOverCell={drag.onDragOverCell}
        onDragLeaveCell={drag.onDragLeaveCell} />
      {derived.view.shown === 0 && <EmptyOverlay onReset={ctx.filters.reset} />}
    </div>
  );
}

function Screen({ ctx }: { ctx: Ctx }) {
  const { config, ui, filters, derived } = ctx;
  return (
    <div className={"app" + (ui.sidebar ? " sidebar-open" : "")}
      style={{ gridTemplateColumns: ui.sidebar ? "214px 1fr" : "0 1fr" }}>
      <Header config={config} stats={derived.stats} view={derived.view}
        filtersActive={filters.active} focusLabel={ctx.focusLabel}
        onResetFilters={filters.reset} onClearFocus={() => ui.setFocusCol(null)}
        onToggleSidebar={() => ui.setSidebar((open) => !open)}
        onMetrics={() => ui.setMetrics(true)} onAdmin={() => ui.setAdmin(true)}
        onAdd={() => ui.setAdding(true)} />
      <Sidebar open={ui.sidebar} config={config} search={filters.state.search}
        setSearch={filters.setSearch} filters={filters.state} onToggle={filters.toggle}
        onSetGroup={filters.setGroup} stats={derived.all} view={derived.view}
        filtersActive={filters.active} onReset={filters.reset} searchRef={ctx.searchRef}
        showCodes={ui.showCodes} setShowCodes={ui.setShowCodes} />
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
  const nowMs = useNow(1000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const ui = useUiState();
  const searchRef = useRef<HTMLInputElement>(null);
  const filters = useFilters(config);
  const drag = useDragHandlers(store, ui);
  const handlers = useBoardHandlers(ui);
  useShortcuts(ui, searchRef);
  const cards = useDisplayCards(store.cards, config);
  const derived = useDerived(cards, config, filters, now);
  const detailCard = cards.find((card) => card.id === ui.detailId) ?? null;
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
    store, config, ui, nowMs, filters, cards, derived, drag, handlers,
    searchRef, detailCard, focusLabel,
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
