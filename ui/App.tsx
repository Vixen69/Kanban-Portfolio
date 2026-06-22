// Root component: composes the interaction hooks and renders the frame.
// All domain logic stays in core/ — this file only wires intent to state.

import { useCallback, useMemo, useRef } from "react";
import type { BoardConfig } from "../core/types.ts";
import { portfolioStats } from "../core/board.ts";
import { dimmedCardIds } from "../core/filters.ts";
import { LAYOUT } from "../core/layout.ts";
import { useBoardStore } from "./useBoardStore.ts";
import { useFilters, type Filters } from "./useFilters.ts";
import {
  useCardDetail,
  useCardMovement,
  useCardNavigation,
  useCollapsedLanes,
  useDragOverCell,
  useFocusCell,
  useModeShortcuts,
  useNow,
  useToggle,
  useViewMode,
} from "./interactions.ts";
import { BoardGrid } from "./components/BoardGrid.tsx";
import { CardDetail } from "./components/CardDetail.tsx";
import { Footer, Header } from "./components/Chrome.tsx";
import { MetricsView } from "./components/MetricsView.tsx";
import { Sidebar } from "./components/Sidebar.tsx";

// The layout constants double as CSS custom properties (single source of
// truth with the one-screen acceptance test).
const LAYOUT_VARS = {
  "--header-h": `${LAYOUT.headerHeight}px`,
  "--footer-h": `${LAYOUT.footerHeight}px`,
  "--colhead-h": `${LAYOUT.columnHeadHeight}px`,
  "--bar-h": `${LAYOUT.radiatorBarHeight}px`,
  "--bar-gap": `${LAYOUT.radiatorGap}px`,
} as React.CSSProperties;

type Toggle = ReturnType<typeof useToggle>;

interface AppContext {
  config: BoardConfig;
  now: Date;
  store: ReturnType<typeof useBoardStore>;
  focus: ReturnType<typeof useFocusCell>;
  lanes: ReturnType<typeof useCollapsedLanes>;
  drag: ReturnType<typeof useDragOverCell>;
  movement: ReturnType<typeof useCardMovement>;
  view: ReturnType<typeof useViewMode>;
  filters: Filters;
  detail: ReturnType<typeof useCardDetail>;
  dimmed: ReadonlySet<string>;
  sidebar: Toggle;
  codes: Toggle;
  metrics: Toggle;
  searchRef: React.RefObject<HTMLInputElement | null>;
}

function Board({ app }: { app: AppContext }) {
  return (
    <main className="board-area">
      <BoardGrid
        config={app.config}
        cards={app.store.cards}
        now={app.now}
        mode={app.view.baseMode}
        focusCell={app.focus.focusCell}
        collapsedLanes={app.lanes.collapsedLanes}
        dragOver={app.drag.dragOver}
        dimmedIds={app.dimmed}
        showCodes={app.codes.on}
        onFocus={app.focus.onFocusCell}
        onOpenCard={app.detail.onOpen}
        onToggleLane={app.lanes.onToggleLane}
        onDrop={app.movement.onDrop}
        onDragOver={app.drag.onDragOver}
        onMoveKey={app.movement.onMoveKey}
      />
    </main>
  );
}

function Overlays({ app }: { app: AppContext }) {
  return (
    <>
      {app.detail.detailCard && (
        <CardDetail
          card={app.detail.detailCard}
          config={app.config}
          now={app.now}
          events={app.store.events}
          cards={app.store.cards}
          onClose={app.detail.close}
          onBlock={app.store.blockCard}
          onUnblock={app.store.unblockCard}
          onEdit={app.store.editCard}
        />
      )}
      {app.metrics.on && (
        <MetricsView
          config={app.config}
          cards={app.store.cards}
          events={app.store.events}
          now={app.now}
          onClose={app.metrics.setOff}
        />
      )}
    </>
  );
}

// The loading / error screen shown until the board fetch resolves, or null
// once the store is ready (kept out of App to stay under the line cap).
function statusScreen(store: AppContext["store"]): React.JSX.Element | null {
  if (store.status === "loading") {
    return <div className="app-status">Chargement du portefeuille…</div>;
  }
  if (store.status === "error") {
    return <div className="app-status app-status--error">{store.error}</div>;
  }
  return null;
}

function Screen({ app }: { app: AppContext }) {
  const stats = portfolioStats(app.store.cards);
  return (
    <div
      className="app"
      style={{ ...LAYOUT_VARS, gridTemplateColumns: app.sidebar.on ? "216px 1fr" : "0 1fr" }}
    >
      <Header
        config={app.config}
        stats={stats}
        mode={app.view.mode}
        shown={stats.total - app.dimmed.size}
        filtersActive={app.filters.active}
        onMode={app.view.onMode}
        onResetFilters={app.filters.reset}
        onToggleSidebar={app.sidebar.toggle}
        onMetrics={app.metrics.setOn}
      />
      <Sidebar
        open={app.sidebar.on}
        config={app.config}
        cards={app.store.cards}
        now={app.now}
        filters={app.filters}
        dimmed={app.dimmed}
        showCodes={app.codes.on}
        onToggleCodes={app.codes.toggle}
        searchRef={app.searchRef}
      />
      <Board app={app} />
      <Footer />
      <Overlays app={app} />
    </div>
  );
}

/**
 * Root of the board UI.
 * Input: the validated board topology (props.config).
 * Output: the full application (header, sidebar, grid, detail modal,
 * metrics view, footer) bound to the API-backed board store; a loading or
 * French error screen while the board is fetched.
 * Failure: none — config errors are caught before this component renders
 * (see main.tsx); board fetch failures surface via the store status.
 */
export function App({ config }: { config: BoardConfig }) {
  const now = useNow();
  const store = useBoardStore();
  const focus = useFocusCell(store.cards);
  const lanes = useCollapsedLanes(focus.focusCell?.laneId ?? null, focus.clearFocus);
  const drag = useDragOverCell();
  const movement = useCardMovement(config, store);
  const view = useViewMode(focus.enterFocus, focus.clearFocus, focus.focusCell !== null);
  const filters = useFilters(config);
  const detail = useCardDetail(focus, store.cards);
  const sidebar = useToggle(false);
  const codes = useToggle(false);
  const metrics = useToggle(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const dimmed = useMemo(
    () => dimmedCardIds(store.cards, filters.state, config, now),
    [store.cards, filters.state, config, now],
  );
  const onSlash = useCallback(() => {
    sidebar.setOn();
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [sidebar]);
  // Escape unwinds the most transient state first.
  const onEscape = useCallback(() => {
    if (metrics.on) metrics.setOff();
    else if (detail.detailCard) detail.close();
    else if (focus.focusCell) focus.clearFocus();
    else sidebar.setOff();
  }, [metrics, detail, focus, sidebar]);
  useModeShortcuts(view.onMode, onEscape, sidebar.toggle, onSlash, metrics.toggle);
  useCardNavigation(config, store.cards);

  const app: AppContext = {
    config, now, store, focus, lanes, drag, movement, view, filters, detail,
    dimmed, sidebar, codes, metrics, searchRef,
  };
  return statusScreen(store) ?? <Screen app={app} />;
}
