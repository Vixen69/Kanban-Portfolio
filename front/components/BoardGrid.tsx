// Board assembly (design grid.jsx): column headers (click to focus a
// stage, caret to collapse it to a strip), vertical lane labels (click to
// collapse a canal), collapsed summary cells, and the grid itself. The
// grid templates come from core/layout — the single source of truth for
// the focus/collapse geometry.

import type { CSSProperties, DragEvent } from "react";
import type { BoardConfig, CardState, Column, GateDef, Lane } from "../../core/types.ts";
import { isStale } from "../../core/aging.ts";
import { cellCards } from "../../core/board.ts";
import { columnTemplate, rowTemplate } from "../../core/layout.ts";
import { Cell } from "./Cell.tsx";

// The gate definition of a column, or null when the column has no gate.
function gateDefOf(config: BoardConfig, column: Column): GateDef | null {
  return column.gate === null ? null : config.gateDefs[column.gate];
}

/**
 * Column header. Clicking the body focuses the stage; the caret button
 * collapses the column to a 30px strip (design grid.jsx).
 * Inputs: the column, its gate definition (null when ungated), focus and
 * collapse state, and the callbacks (both receive the column id).
 * Output: the header element — a vertical label variant when collapsed.
 * Failure modes: none.
 */
export function ColumnHeader({ col, gateDef, focused, colCollapsed, onFocus, onToggleCollapse }: {
  col: Column;
  gateDef: GateDef | null;
  focused: boolean;
  colCollapsed: boolean;
  onFocus: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  if (colCollapsed) {
    return (
      <div className="col-head col-collapsed" onClick={() => onToggleCollapse(col.id)} title={"Déplier " + col.name}>
        <span className="collapse-caret">{"›"}</span>
        <span className="col-label-v">{col.name}</span>
      </div>
    );
  }
  return (
    <div
      className={"col-head" + (focused ? " focused" : "")}
      onClick={() => onFocus(col.id)}
      title="Cliquer pour focaliser ce stade"
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
      <span className="col-note">{col.note}</span>
    </div>
  );
}

/**
 * Vertical lane label; clicking collapses the canal to a summary strip.
 * Inputs: the lane, its collapsed state, the toggle callback.
 * Output: the rotated label with caret, lane name and nature subtitle
 * (the nature is hidden by CSS when collapsed). Failure modes: none.
 */
export function LaneLabel({ lane, collapsed, onToggle }: { lane: Lane; collapsed: boolean; onToggle: () => void }) {
  return (
    <div
      className={"lane-label" + (collapsed ? " collapsed" : "")}
      onClick={onToggle}
      title="Cliquer pour replier ce canal"
    >
      <span className="collapse-caret">{collapsed ? "▸" : "▾"}</span>
      <span className="lane-name">{lane.name}</span>
      <span className="lane-nature">{lane.nature}</span>
    </div>
  );
}

/**
 * Collapsed-lane summary cell: just the signals that matter at a glance.
 * Inputs: the cards of this cell (pre-filtered), the board config (stale
 * threshold), now in epoch milliseconds.
 * Output: count (empty when zero), blocked badge, stagnation dot.
 * Failure modes: none.
 */
export function CollapsedCell({ cards, config, now }: { cards: CardState[]; config: BoardConfig; now: number }) {
  const date = new Date(now);
  const blocked = cards.filter((card) => card.blocked).length;
  const stale = cards.filter((card) => isStale(card, config, date)).length;
  return (
    <div className="ccell">
      <span className="ccount">{cards.length || ""}</span>
      {blocked > 0 && <span className="cblk">{blocked}</span>}
      {stale > 0 && <span className="cstale" title={stale + " stagnant(s)"} />}
    </div>
  );
}

/**
 * Collapsed-column strip cell: count and blocked badge only.
 * Input: the cards of this cell (pre-filtered).
 * Output: the narrow strip content (count empty when zero).
 * Failure modes: none.
 */
export function CollapsedColCell({ cards }: { cards: CardState[] }) {
  const blocked = cards.filter((card) => card.blocked).length;
  return (
    <div className="ccol-cell">
      <span className="ccount">{cards.length || ""}</span>
      {blocked > 0 && <span className="cblk">{blocked}</span>}
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
    />
  );
}

// One board row: the lane label plus one cell per column. Lane collapse
// wins over column collapse (design grid.jsx render order).
function LaneRow({ lane, props }: { lane: Lane; props: BoardGridProps }) {
  const laneCollapsed = props.collapsedLanes.has(lane.id);
  return (
    <>
      <LaneLabel lane={lane} collapsed={laneCollapsed} onToggle={() => props.onToggleLane(lane.id)} />
      {props.config.columns.map((col) => {
        const inCell = cellCards(props.cards, lane.id, col.id);
        if (laneCollapsed) {
          return <CollapsedCell key={col.id} cards={inCell} config={props.config} now={props.now} />;
        }
        if (props.collapsedCols.has(col.id)) {
          return <CollapsedColCell key={col.id} cards={inCell} />;
        }
        return <BoardCell key={col.id} lane={lane} col={col} cards={inCell} props={props} />;
      })}
    </>
  );
}

/**
 * The whole board: one CSS grid of column headers, lane labels and cells.
 * Focus widens a column (2.6fr), collapse shrinks a column to a 30px
 * strip or a lane to a 26px summary row — the grid templates come from
 * core/layout columnTemplate/rowTemplate.
 * Inputs: BoardGridProps (config, folded cards, dim/focus/collapse/drag
 * state and the interaction callbacks).
 * Output: the .board grid element. Failure modes: none.
 */
export function BoardGrid(props: BoardGridProps) {
  const { config } = props;
  return (
    <div
      className="board"
      style={{
        gridTemplateColumns: columnTemplate(config.columns, props.focusedColumn, props.collapsedCols),
        gridTemplateRows: rowTemplate(config.lanes, props.collapsedLanes),
      }}
    >
      <div className="corner" />
      {config.columns.map((col) => (
        <ColumnHeader
          key={col.id}
          col={col}
          gateDef={gateDefOf(config, col)}
          focused={props.focusedColumn === col.id}
          colCollapsed={props.collapsedCols.has(col.id)}
          onFocus={props.onFocusColumn}
          onToggleCollapse={props.onToggleColumnCollapse}
        />
      ))}
      {config.lanes.map((lane) => (
        <LaneRow key={lane.id} lane={lane} props={props} />
      ))}
    </div>
  );
}
