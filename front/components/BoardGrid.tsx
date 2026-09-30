// Board assembly (design grid.jsx): column headers (ColumnHeads.tsx —
// click to focus a stage, caret to collapse it to a strip), vertical lane
// labels (click to collapse a canal — the last expanded lane refuses),
// collapsed summary cells with their one-click ticket popover (design
// v11), and the grid itself. The grid templates come from core/layout —
// the single source of truth for the focus/collapse geometry.
//
// Design v12: headers and canal labels wear the money/charge totals of the
// VISIBLE cards, folded or unfolded by the two Σ toggles. The column note
// moved to the header tooltip (ADR 020).
//
// ADR 031 (author, 2026-09-11): the sidebar filters HIDE the cards they
// exclude — cells receive the retained cards only — and each column
// header counts them (« retenus/total » while the board is narrowed).
//
// ADR 039 (author, 2026-09-16): the intake columns up to the RDO have no
// canal — one cell tall as the board each (UnifiedZone.tsx); the board
// totals sit in a gutter left of Demandes, the canals and their gutter
// (with the per-canal Σ) start after.
//
// ADR 048: the board gutter has its own Σ (« tableau ») and holds the
// métier lens; every reste à faire of the grid reads it. Its Σ sits in the
// top-left corner under the header-totals one, pointing down to the
// gutter it unfolds (author, 2026-09-29) — not inside the gutter.

import { memo, useMemo } from "react";
import type { DragEvent } from "react";
import type { BoardConfig, CardState, Column, Lane } from "../../core/types.ts";
import { cellCards } from "../../core/board.ts";
import { cellWipLimit } from "../../core/wip.ts";
import type { CardSort } from "../../core/card-sort.ts";
import { BOARD_GUTTER, LANE_GUTTER, columnTemplate, rowTemplate, unifiedColumnIds } from "../../core/layout.ts";
import { emptyTotals, type GroupTotals } from "../../core/totals.ts";
import { scopeTitle } from "../rafLabels.ts";
import { useBoardTotals, type BoardTotals } from "../useBoardTotals.ts";
import type { DragHoverStore } from "../dragHover.ts";
import type { BoardLens, RafRead } from "../useRafLens.ts";
import { BOARD_TOTALS_KEY, COLUMN_TOTALS_KEY, LANE_TOTALS_KEY, useStoredFlag } from "../useUiPrefs.ts";
import { Cell } from "./Cell.tsx";
import { LaneTotals, TotalsToggle } from "./BoardTotals.tsx";
import { BoardGutter } from "./BoardGutter.tsx";
import { ColumnHeads, gateDefOf } from "./ColumnHeads.tsx";
import { CollapsedCell, CollapsedColCell } from "./CollapsedCells.tsx";
import { LaneCorner, UnifiedCells } from "./UnifiedZone.tsx";

/**
 * Vertical lane label; clicking collapses the canal to a summary strip.
 * The last expanded lane is not collapsible (design v11): its label loses
 * the caret, the click and the hover affordance. When the per-canal totals
 * are unfolded the label turns horizontal and widens (design v12).
 * Inputs: the lane, its collapsed state, the disabled guard, the visible
 * totals of the canal (money, and reste à faire without the out-of-count
 * columns) and whether they are unfolded, the config, the lens read, the
 * toggle. Output: the label. Failure modes: none.
 */
export function LaneLabel({ lane, collapsed, disabled, totals, rafTotals, totalsOpen, config, read, onToggle }: {
  lane: Lane;
  collapsed: boolean;
  disabled: boolean;
  totals: GroupTotals;
  rafTotals: GroupTotals;
  totalsOpen: boolean;
  config: BoardConfig;
  read: RafRead;
  onToggle: () => void;
}) {
  const expanded = !collapsed && totalsOpen;
  return (
    <div
      className={"lane-label" + (collapsed ? " collapsed" : "") + (disabled ? " no-collapse" : "") + (expanded ? " expanded" : "")}
      onClick={disabled ? undefined : onToggle}
      title={disabled ? "Au moins une ligne doit rester dépliée" : (collapsed ? "Déplier " : "Replier ") + lane.name}
    >
      {!disabled && <span className="collapse-caret">{collapsed ? "▸" : "▾"}</span>}
      <span className="lane-name">{lane.name}</span>
      {!collapsed && !totalsOpen && <span className="lane-nature">{lane.nature}</span>}
      {!collapsed && (
        <LaneTotals totals={totals} rafTotals={rafTotals} config={config} open={totalsOpen} laneName={lane.name} read={read} />
      )}
    </div>
  );
}

/** Props of the whole board grid (pinned build-spec contract). */
export interface BoardGridProps {
  config: BoardConfig;
  cards: CardState[];
  /** Ids of the cards the sidebar filters and the métier lens hide (ADR 031, 048) — left off the cells. */
  hiddenIds: Set<string>;
  /** Ids the sidebar filters alone hide: the lens list and its « sans ventilation » note read the board without the lens's own filtering. */
  filterHiddenIds: Set<string>;
  focusedColumn: string | null;
  collapsedLanes: Set<string>;
  collapsedCols: Set<string>;
  /** Epoch milliseconds of the shared "now" tick. */
  now: number;
  showCodes: boolean;
  showTypes: boolean;
  /** The board's sort (ADR 044), handed down to the expanded cards. */
  sort: CardSort;
  /** The métier lens (ADR 048): the métiers every reste à faire counts; while it narrows, the cards it filters out are in hiddenIds. */
  lens: BoardLens;
  /** Where a dragged card hovers (the cell, the insertion target) — read by the cells alone. */
  dragHover: DragHoverStore;
  onFocusColumn: (id: string) => void;
  onToggleLane: (id: string) => void;
  onToggleColumnCollapse: (id: string) => void;
  onOpen: (card: CardState) => void;
  onDragStart: (e: DragEvent, card: CardState) => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent, laneId: string, columnId: string) => void;
  onDragOverCell: (e: DragEvent, laneId: string, columnId: string) => void;
  onDragLeaveCell: () => void;
  /** Card-level drag plumbing (insert-before reorder, ADR 019). */
  onCardOver: (e: DragEvent, card: CardState) => void;
  onCardDrop: (e: DragEvent, card: CardState) => void;
}

// The expanded cell of one lane-column pair, wired to the grid callbacks.
function BoardCell({ lane, col, cards, props, read }: { lane: Lane; col: Column; cards: CardState[]; props: BoardGridProps; read: RafRead }) {
  return (
    <Cell
      laneId={lane.id}
      column={col}
      cards={cards}
      wipLimit={cellWipLimit(props.config, lane.id, col.id)}
      focused={props.focusedColumn === col.id}
      config={props.config}
      now={props.now}
      showCodes={props.showCodes}
      showTypes={props.showTypes}
      sort={props.sort}
      read={read}
      dragHover={props.dragHover}
      gateDef={gateDefOf(props.config, col)}
      onOpen={props.onOpen}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      onDrop={props.onDrop}
      onDragOverCell={props.onDragOverCell}
      onDragLeaveCell={props.onDragLeaveCell}
      onCardOver={props.onCardOver}
      onCardDrop={props.onCardDrop}
    />
  );
}

// One board row: the lane label plus one cell per canal column. Lane
// collapse wins over column collapse (design grid.jsx render order). The
// label of the last expanded lane is disabled (counted against the CURRENT
// config lanes — collapsedLanes may hold stale ids after an admin edit).
// Every cell — expanded or collapsed — receives the retained cards only.
function LaneRow({ lane, columns, props, totals, totalsOpen, read }: {
  lane: Lane;
  columns: Column[];
  props: BoardGridProps;
  totals: BoardTotals;
  totalsOpen: boolean;
  read: RafRead;
}) {
  const laneCollapsed = props.collapsedLanes.has(lane.id);
  const expandedCount = props.config.lanes.filter((entry) => !props.collapsedLanes.has(entry.id)).length;
  return (
    <>
      <LaneLabel lane={lane} collapsed={laneCollapsed} disabled={!laneCollapsed && expandedCount <= 1}
        totals={totals.byLane[lane.id] ?? emptyTotals()} rafTotals={totals.byLaneRaf[lane.id] ?? emptyTotals()}
        totalsOpen={totalsOpen} config={props.config} read={read}
        onToggle={() => props.onToggleLane(lane.id)} />
      {columns.map((col) => {
        const inCell = cellCards(props.cards, lane.id, col.id).filter((card) => !props.hiddenIds.has(card.id));
        if (laneCollapsed) {
          return <CollapsedCell key={col.id} cards={inCell} config={props.config} now={props.now} onOpen={props.onOpen} />;
        }
        if (props.collapsedCols.has(col.id)) {
          return <CollapsedColCell key={col.id} cards={inCell} config={props.config} onOpen={props.onOpen}
            onDragOver={(event) => props.onDragOverCell(event, lane.id, col.id)} onDrop={(event) => props.onDrop(event, lane.id, col.id)} />;
        }
        return <BoardCell key={col.id} lane={lane} col={col} cards={inCell} props={props} read={read} />;
      })}
    </>
  );
}

// How every totals block reads its reste à faire: the lens's métiers.
function useRafRead(lens: BoardLens, config: BoardConfig): RafRead {
  return useMemo(
    () => ({ counted: lens.counted, active: lens.active, title: scopeTitle(lens.scope, config) }),
    [lens.counted, lens.active, lens.scope, config],
  );
}

// The props shared by the two header rows (canal-less and canal columns).
function headProps(props: BoardGridProps, totals: BoardTotals, totalsOpen: boolean, read: RafRead) {
  return { config: props.config, cards: props.cards, hiddenIds: props.hiddenIds, focusedColumn: props.focusedColumn,
    collapsedCols: props.collapsedCols, byColumn: totals.byColumn, totalsOpen, classes: totals.classes, read,
    onFocus: props.onFocusColumn, onToggleCollapse: props.onToggleColumnCollapse };
}

// The top-left corner: the header-totals Σ, then under it the Σ of the
// board gutter pointing down to it (ADR 048) — or, on a board without
// canal-less columns, the canal totals Σ.
function GridCorner({ columns, second, secondWhat }: {
  columns: [boolean, () => void]; second: [boolean, () => void]; secondWhat: "tableau" | "canal";
}) {
  return (
    <div className="corner grid-corner">
      <TotalsToggle open={columns[0]} onToggle={columns[1]} what="colonne" />
      <TotalsToggle open={second[0]} onToggle={second[1]} what={secondWhat} />
    </div>
  );
}

/**
 * The whole board: one CSS grid of column headers, gutters, lane labels
 * and cells. Focus widens a column (2.6fr), collapse shrinks a column to
 * a 30px strip or a lane to a 26px summary row — the grid templates come
 * from core/layout. Unfolding the per-canal totals widens the lane gutter;
 * the board gutter has its own Σ (ADR 048).
 * Inputs: BoardGridProps (config, folded cards, hidden/focus/collapse/drag
 * state and the interaction callbacks).
 * Output: the .board grid element. Failure modes: none.
 */
function BoardGridBody(props: BoardGridProps) {
  const { config } = props;
  const [columnsOpen, toggleColumns] = useStoredFlag(COLUMN_TOTALS_KEY, false);
  const [lanesOpen, toggleLanes] = useStoredFlag(LANE_TOTALS_KEY, false);
  const [boardOpen, toggleBoard] = useStoredFlag(BOARD_TOTALS_KEY, false);
  const unified = useMemo(() => unifiedColumnIds(config), [config]);
  const totals = useBoardTotals(props.cards, { shown: props.hiddenIds, lensBase: props.filterHiddenIds }, config, unified, props.lens);

  const read = useRafRead(props.lens, config);
  const laneWidth = lanesOpen ? LANE_GUTTER.expanded : LANE_GUTTER.compact;
  const boardWidth = boardOpen ? BOARD_GUTTER.expanded : BOARD_GUTTER.compact;
  const unifiedCols = config.columns.filter((col) => unified.has(col.id));
  const laneCols = config.columns.filter((col) => !unified.has(col.id));
  const heads = headProps(props, totals, columnsOpen, read);
  return (
    <div
      className="board"
      style={{
        gridTemplateColumns: columnTemplate(config.columns, props.focusedColumn, props.collapsedCols, laneWidth, unified, boardWidth),
        gridTemplateRows: rowTemplate(config.lanes, props.collapsedLanes),
      }}
    >
      <GridCorner columns={[columnsOpen, toggleColumns]} second={unified.size > 0 ? [boardOpen, toggleBoard] : [lanesOpen, toggleLanes]}
        secondWhat={unified.size > 0 ? "tableau" : "canal"} />
      <ColumnHeads {...heads} columns={unifiedCols} />
      {unified.size > 0 && <LaneCorner open={lanesOpen} onToggle={toggleLanes} />}
      <ColumnHeads {...heads} columns={laneCols} />
      {unified.size > 0 && (
        <BoardGutter totals={totals} config={config} lens={props.lens} open={boardOpen} onToggle={toggleBoard}
          rows={config.lanes.length} all={props.cards.length} narrowed={props.hiddenIds.size > 0} />
      )}
      <UnifiedCells columns={unifiedCols} props={props} rows={config.lanes.length} read={read} />
      {config.lanes.map((lane) => (
        <LaneRow key={lane.id} lane={lane} columns={laneCols} props={props} totals={totals} totalsOpen={lanesOpen} read={read} />
      ))}
    </div>
  );
}

/** The grid, memoised (ADR 051): a keystroke or a fiche opened re-renders it only when its props change. */
export const BoardGrid = memo(BoardGridBody);
