// Board assembly (design grid.jsx): column headers (click to focus a
// stage, caret to collapse it to a strip), vertical lane labels (click to
// collapse a canal — the last expanded lane refuses), collapsed summary
// cells with their one-click ticket popover (design v11), and the grid
// itself. The grid templates come from core/layout — the single source of
// truth for the focus/collapse geometry.
//
// Design v12: headers and canal labels wear the money/charge totals of the
// VISIBLE cards, folded or unfolded by the two Σ toggles in the corner.
// The column note moved to the header tooltip — the totals took its row,
// but the note stays configurable and admin-editable (ADR 020).

import { useMemo } from "react";
import type { CSSProperties, DragEvent } from "react";
import type { BoardConfig, CardState, Column, GateDef, Lane } from "../../core/types.ts";
import { cellCards } from "../../core/board.ts";
import { LANE_GUTTER, columnTemplate, rowTemplate } from "../../core/layout.ts";
import { columnTotals, emptyTotals, laneTotals, type GroupTotals } from "../../core/totals.ts";
import { COLUMN_TOTALS_KEY, LANE_TOTALS_KEY, useStoredFlag } from "../useUiPrefs.ts";
import { Cell } from "./Cell.tsx";
import { ColumnTotals, LaneTotals, TotalsToggles } from "./BoardTotals.tsx";
import { CollapsedCell, CollapsedColCell } from "./CollapsedCells.tsx";

// The gate definition of a column, or null when the column has no gate.
function gateDefOf(config: BoardConfig, column: Column): GateDef | null {
  return column.gate === null ? null : config.gateDefs[column.gate];
}

// Collapsed column: a 30px vertical strip, one click to unfold it again.
function CollapsedColumnHead({ col, onToggleCollapse }: { col: Column; onToggleCollapse: (id: string) => void }) {
  return (
    <div className="col-head col-collapsed" onClick={() => onToggleCollapse(col.id)} title={"Déplier " + col.name}>
      <span className="collapse-caret">{"›"}</span>
      <span className="col-label-v">{col.name}</span>
    </div>
  );
}

/**
 * Column header. Clicking the body focuses the stage; the caret button
 * collapses the column to a 30px strip (design grid.jsx). The functional
 * note is carried by the tooltip since v12 gave its row to the totals.
 * Inputs: the column, its gate definition (null when ungated), focus and
 * collapse state, the visible totals of the column and whether they are
 * unfolded, and the callbacks (both receive the column id).
 * Output: the header element — a vertical label variant when collapsed.
 * Failure modes: none.
 */
export function ColumnHeader({ col, gateDef, focused, colCollapsed, totals, totalsOpen, config, onFocus, onToggleCollapse }: {
  col: Column;
  gateDef: GateDef | null;
  focused: boolean;
  colCollapsed: boolean;
  totals: GroupTotals;
  totalsOpen: boolean;
  config: BoardConfig;
  onFocus: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  if (colCollapsed) return <CollapsedColumnHead col={col} onToggleCollapse={onToggleCollapse} />;
  return (
    <div
      className={"col-head" + (focused ? " focused" : "")}
      onClick={() => onFocus(col.id)}
      title={col.note === "" ? "Cliquer pour focaliser ce stade" : col.note}
    >
      <div className="col-head-top">
        <span className="col-label">{col.name}</span>
        {gateDef !== null && col.gate !== null && (
          <span className="gate-badge" style={{ "--gate": gateDef.color } as CSSProperties}>{col.gate}</span>
        )}
        <button
          className="col-collapse"
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(col.id); }}
          title={"Replier " + col.name}
        >
          {"‹"}
        </button>
      </div>
      <ColumnTotals totals={totals} config={config} open={totalsOpen} />
    </div>
  );
}

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
  /** Ids of the cards the sidebar filters dim (dimmed, never removed). */
  dimmedIds: Set<string>;
  focusedColumn: string | null;
  collapsedLanes: Set<string>;
  collapsedCols: Set<string>;
  /** Epoch milliseconds of the shared "now" tick. */
  now: number;
  showCodes: boolean;
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
      lane={lane}
      column={col}
      cards={cards}
      dimmedIds={props.dimmedIds}
      focused={props.focusedColumn === col.id}
      config={props.config}
      now={props.now}
      showCodes={props.showCodes}
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

// One board row: the lane label plus one cell per column. Lane collapse
// wins over column collapse (design grid.jsx render order). The label of
// the last expanded lane is disabled (counted against the CURRENT config
// lanes — collapsedLanes may hold stale ids after an admin edit).
function LaneRow({ lane, props, totals, totalsOpen }: {
  lane: Lane;
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
      {props.config.columns.map((col) => {
        const inCell = cellCards(props.cards, lane.id, col.id);
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

// Per-column and per-canal aggregates of the VISIBLE cards. Recomputed on
// every filter keystroke (dimmedIds changes) but NOT on the one-second now
// tick — the totals carry no time-dependent figure, so `now` is absent
// from the deps on purpose.
function useVisibleTotals(cards: CardState[], dimmed: Set<string>, config: BoardConfig) {
  const byColumn = useMemo(() => columnTotals(cards, dimmed, config), [cards, dimmed, config]);
  const byLane = useMemo(() => laneTotals(cards, dimmed, config), [cards, dimmed, config]);
  return { byColumn, byLane };
}

/**
 * The whole board: one CSS grid of column headers, lane labels and cells.
 * Focus widens a column (2.6fr), collapse shrinks a column to a 30px
 * strip or a lane to a 26px summary row — the grid templates come from
 * core/layout columnTemplate/rowTemplate. Unfolding the per-canal totals
 * widens the lane gutter to LANE_GUTTER.expanded.
 * Inputs: BoardGridProps (config, folded cards, dim/focus/collapse/drag
 * state and the interaction callbacks).
 * Output: the .board grid element. Failure modes: none.
 */
export function BoardGrid(props: BoardGridProps) {
  const { config } = props;
  const [columnsOpen, toggleColumns] = useStoredFlag(COLUMN_TOTALS_KEY, false);
  const [lanesOpen, toggleLanes] = useStoredFlag(LANE_TOTALS_KEY, false);
  const totals = useVisibleTotals(props.cards, props.dimmedIds, config);
  const laneWidth = lanesOpen ? LANE_GUTTER.expanded : LANE_GUTTER.compact;
  return (
    <div
      className="board"
      style={{
        gridTemplateColumns: columnTemplate(config.columns, props.focusedColumn, props.collapsedCols, laneWidth),
        gridTemplateRows: rowTemplate(config.lanes, props.collapsedLanes),
      }}
    >
      <div className="corner">
        <TotalsToggles columnsOpen={columnsOpen} lanesOpen={lanesOpen}
          onToggleColumns={toggleColumns} onToggleLanes={toggleLanes} />
      </div>
      {config.columns.map((col) => (
        <ColumnHeader
          key={col.id}
          col={col}
          gateDef={gateDefOf(config, col)}
          focused={props.focusedColumn === col.id}
          colCollapsed={props.collapsedCols.has(col.id)}
          totals={totals.byColumn[col.id] ?? emptyTotals()}
          totalsOpen={columnsOpen}
          config={config}
          onFocus={props.onFocusColumn}
          onToggleCollapse={props.onToggleColumnCollapse}
        />
      ))}
      {config.lanes.map((lane) => (
        <LaneRow key={lane.id} lane={lane} props={props}
          totals={totals.byLane[lane.id] ?? emptyTotals()} totalsOpen={lanesOpen} />
      ))}
    </div>
  );
}
