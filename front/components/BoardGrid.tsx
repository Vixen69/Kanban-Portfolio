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
// totals sit in a gutter left of Demandes (with the per-column Σ), the
// canals and their gutter (with the per-canal Σ) start after.

import { useMemo } from "react";
import type { DragEvent } from "react";
import type { BoardConfig, CardState, Column, Lane } from "../../core/types.ts";
import { cellCards } from "../../core/board.ts";
import { cellWipLimit } from "../../core/wip.ts";
import type { CardSort } from "../../core/card-sort.ts";
import { LANE_GUTTER, columnTemplate, rowTemplate, unifiedColumnIds } from "../../core/layout.ts";
import { columnTotals, emptyTotals, laneTotals, totalsOf, type GroupTotals } from "../../core/totals.ts";
import { COLUMN_TOTALS_KEY, LANE_TOTALS_KEY, useStoredFlag } from "../useUiPrefs.ts";
import { Cell } from "./Cell.tsx";
import { LaneTotals, TotalsToggle } from "./BoardTotals.tsx";
import { ColumnHeads, gateDefOf } from "./ColumnHeads.tsx";
import { CollapsedCell, CollapsedColCell } from "./CollapsedCells.tsx";
import { BoardGutter, LaneCorner, UnifiedCells } from "./UnifiedZone.tsx";

/**
 * Vertical lane label; clicking collapses the canal to a summary strip.
 * The last expanded lane is not collapsible (design v11): its label loses
 * the caret, the click and the hover affordance. When the per-canal totals
 * are unfolded the label turns horizontal and widens (design v12).
 * Inputs: the lane, its collapsed state, the disabled guard, the visible
 * totals of the canal and whether they are unfolded, the config, the
 * toggle. Output: the label. Failure modes: none.
 */
export function LaneLabel({ lane, collapsed, disabled, totals, totalsOpen, config, onToggle }: {
  lane: Lane;
  collapsed: boolean;
  disabled: boolean;
  totals: GroupTotals;
  totalsOpen: boolean;
  config: BoardConfig;
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
        <LaneTotals totals={totals} config={config} open={totalsOpen} laneName={lane.name} />
      )}
    </div>
  );
}

/** Props of the whole board grid (pinned build-spec contract). */
export interface BoardGridProps {
  config: BoardConfig;
  cards: CardState[];
  /** Ids of the cards the sidebar filters hide (ADR 031) — left off the cells. */
  hiddenIds: Set<string>;
  focusedColumn: string | null;
  collapsedLanes: Set<string>;
  collapsedCols: Set<string>;
  /** Epoch milliseconds of the shared "now" tick. */
  now: number;
  showCodes: boolean;
  showTypes: boolean;
  /** The board's sort (ADR 044), handed down to the expanded cards. */
  sort: CardSort;
  /** The cell a dragged card is currently over, or null. */
  dragOver: { laneId: string; columnId: string } | null;
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
  /** Id of the card currently marked as the insertion target, or null. */
  dropCardId: string | null;
}

// The expanded cell of one lane-column pair, wired to the grid callbacks.
function BoardCell({ lane, col, cards, props }: { lane: Lane; col: Column; cards: CardState[]; props: BoardGridProps }) {
  const over = props.dragOver;
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
      dragOver={over !== null && over.laneId === lane.id && over.columnId === col.id}
      gateDef={gateDefOf(props.config, col)}
      onOpen={props.onOpen}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      onDrop={props.onDrop}
      onDragOverCell={props.onDragOverCell}
      onDragLeaveCell={props.onDragLeaveCell}
      onCardOver={props.onCardOver}
      onCardDrop={props.onCardDrop}
      dropCardId={props.dropCardId}
    />
  );
}

// One board row: the lane label plus one cell per canal column. Lane
// collapse wins over column collapse (design grid.jsx render order). The
// label of the last expanded lane is disabled (counted against the CURRENT
// config lanes — collapsedLanes may hold stale ids after an admin edit).
// Every cell — expanded or collapsed — receives the retained cards only.
function LaneRow({ lane, columns, props, totals, totalsOpen }: {
  lane: Lane;
  columns: Column[];
  props: BoardGridProps;
  totals: GroupTotals;
  totalsOpen: boolean;
}) {
  const laneCollapsed = props.collapsedLanes.has(lane.id);
  const expandedCount = props.config.lanes.filter((entry) => !props.collapsedLanes.has(entry.id)).length;
  return (
    <>
      <LaneLabel lane={lane} collapsed={laneCollapsed} disabled={!laneCollapsed && expandedCount <= 1}
        totals={totals} totalsOpen={totalsOpen} config={props.config}
        onToggle={() => props.onToggleLane(lane.id)} />
      {columns.map((col) => {
        const inCell = cellCards(props.cards, lane.id, col.id).filter((card) => !props.hiddenIds.has(card.id));
        if (laneCollapsed) {
          return <CollapsedCell key={col.id} cards={inCell} config={props.config} now={props.now} onOpen={props.onOpen} />;
        }
        if (props.collapsedCols.has(col.id)) {
          return <CollapsedColCell key={col.id} cards={inCell} config={props.config} onOpen={props.onOpen} />;
        }
        return <BoardCell key={col.id} lane={lane} col={col} cards={inCell} props={props} />;
      })}
    </>
  );
}

// Per-column, per-canal and board-wide aggregates of the VISIBLE cards.
// The canal totals count the canal columns only (ADR 039: before the RDO
// a card's canal is not shown, so it is not counted there either); the
// board total counts everything shown. Recomputed on every filter
// keystroke (hiddenIds changes) but NOT on the one-minute now tick — the
// totals carry no time-dependent figure.
function useVisibleTotals(cards: CardState[], hidden: Set<string>, config: BoardConfig, unified: Set<string>) {
  const byColumn = useMemo(() => columnTotals(cards, hidden, config), [cards, hidden, config]);
  const byLane = useMemo(
    () => laneTotals(cards.filter((card) => !unified.has(card.columnId)), hidden, config),
    [cards, hidden, config, unified],
  );
  const board = useMemo(() => totalsOf(cards.filter((card) => !hidden.has(card.id))), [cards, hidden]);
  return { byColumn, byLane, board };
}

/**
 * The whole board: one CSS grid of column headers, gutters, lane labels
 * and cells. Focus widens a column (2.6fr), collapse shrinks a column to
 * a 30px strip or a lane to a 26px summary row — the grid templates come
 * from core/layout. Unfolding the per-canal totals widens the lane gutter,
 * unfolding the per-column totals widens the board gutter (ADR 039).
 * Inputs: BoardGridProps (config, folded cards, hidden/focus/collapse/drag
 * state and the interaction callbacks).
 * Output: the .board grid element. Failure modes: none.
 */
export function BoardGrid(props: BoardGridProps) {
  const { config } = props;
  const [columnsOpen, toggleColumns] = useStoredFlag(COLUMN_TOTALS_KEY, false);
  const [lanesOpen, toggleLanes] = useStoredFlag(LANE_TOTALS_KEY, false);
  const unified = useMemo(() => unifiedColumnIds(config), [config]);
  const totals = useVisibleTotals(props.cards, props.hiddenIds, config, unified);
  const laneWidth = lanesOpen ? LANE_GUTTER.expanded : LANE_GUTTER.compact;
  const boardWidth = columnsOpen ? LANE_GUTTER.expanded : LANE_GUTTER.compact;
  const unifiedCols = config.columns.filter((col) => unified.has(col.id));
  const laneCols = config.columns.filter((col) => !unified.has(col.id));
  const heads = { config, cards: props.cards, hiddenIds: props.hiddenIds, focusedColumn: props.focusedColumn,
    collapsedCols: props.collapsedCols, byColumn: totals.byColumn, totalsOpen: columnsOpen,
    onFocus: props.onFocusColumn, onToggleCollapse: props.onToggleColumnCollapse };
  return (
    <div
      className="board"
      style={{
        gridTemplateColumns: columnTemplate(config.columns, props.focusedColumn, props.collapsedCols, laneWidth, unified, boardWidth),
        gridTemplateRows: rowTemplate(config.lanes, props.collapsedLanes),
      }}
    >
      <div className="corner">
        <TotalsToggle open={columnsOpen} onToggle={toggleColumns} what="colonne" />
        {unified.size === 0 && <TotalsToggle open={lanesOpen} onToggle={toggleLanes} what="canal" />}
      </div>
      <ColumnHeads {...heads} columns={unifiedCols} />
      {unified.size > 0 && <LaneCorner open={lanesOpen} onToggle={toggleLanes} />}
      <ColumnHeads {...heads} columns={laneCols} />
      {unified.size > 0 && <BoardGutter totals={totals.board} config={config} open={columnsOpen} rows={config.lanes.length} />}
      <UnifiedCells columns={unifiedCols} props={props} rows={config.lanes.length} />
      {config.lanes.map((lane) => (
        <LaneRow key={lane.id} lane={lane} columns={laneCols} props={props}
          totals={totals.byLane[lane.id] ?? emptyTotals()} totalsOpen={lanesOpen} />
      ))}
    </div>
  );
}
