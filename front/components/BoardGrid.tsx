// Board assembly (design grid.jsx): column headers (click to focus a
// stage, caret to collapse it to a strip), vertical lane labels (click to
// collapse a canal — the last expanded lane refuses), collapsed summary
// cells with their one-click ticket popover (design v11), and the grid
// itself. The grid templates come from core/layout — the single source of
// truth for the focus/collapse geometry.

import { useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import type { BoardConfig, CardState, Column, GateDef, Lane } from "../../core/types.ts";
import { isStale } from "../../core/aging.ts";
import { cellCards } from "../../core/board.ts";
import { columnTemplate, rowTemplate } from "../../core/layout.ts";
import { Cell } from "./Cell.tsx";
import { CollapsedTicketList } from "./CollapsedTicketList.tsx";

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
 * The last expanded lane is not collapsible (design v11): its label loses
 * the caret, the click and the hover affordance.
 * Inputs: the lane, its collapsed state, the disabled guard, the toggle.
 * Output: the rotated label with caret, lane name and nature subtitle
 * (the nature is hidden by CSS when collapsed). Failure modes: none.
 */
export function LaneLabel({ lane, collapsed, disabled, onToggle }: {
  lane: Lane;
  collapsed: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={"lane-label" + (collapsed ? " collapsed" : "") + (disabled ? " no-collapse" : "")}
      onClick={disabled ? undefined : onToggle}
      title={disabled ? "Au moins une ligne doit rester dépliée" : (collapsed ? "Déplier " : "Replier ") + lane.name}
    >
      {!disabled && <span className="collapse-caret">{collapsed ? "▸" : "▾"}</span>}
      <span className="lane-name">{lane.name}</span>
      <span className="lane-nature">{lane.nature}</span>
    </div>
  );
}

// Rect state + open handler shared by the two collapsed-cell variants:
// hover or click anchors the ticket popover on the cell (design v11).
function useCellPopover(count: number) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const open = (event: React.MouseEvent<HTMLDivElement>) => {
    if (count > 0) setRect(event.currentTarget.getBoundingClientRect());
  };
  return { rect, open, close: () => setRect(null) };
}

/**
 * Collapsed-lane summary cell: the signals that matter at a glance, plus
 * the one-click ticket popover on hover/click (design v11).
 * Inputs: the cards of this cell (pre-filtered), the config (stale
 * threshold + type badges), now in epoch ms, the open-card callback.
 * Output: count (empty when zero), blocked badge, stagnation dot.
 * Failure modes: none.
 */
export function CollapsedCell({ cards, config, now, onOpen }: {
  cards: CardState[];
  config: BoardConfig;
  now: number;
  onOpen: (card: CardState) => void;
}) {
  const date = new Date(now);
  const blocked = cards.filter((card) => card.blocked).length;
  const stale = cards.filter((card) => isStale(card, config, date)).length;
  const pop = useCellPopover(cards.length);
  return (
    <div className={"ccell" + (cards.length ? " has" : "")} onMouseEnter={pop.open} onClick={pop.open}>
      <span className="ccount">{cards.length || ""}</span>
      {blocked > 0 && <span className="cblk">{blocked}</span>}
      {stale > 0 && <span className="cstale" title={stale + " stagnant(s)"} />}
      {pop.rect && <CollapsedTicketList anchorRect={pop.rect} list={cards} config={config} onOpen={onOpen} onClose={pop.close} />}
    </div>
  );
}

/**
 * Collapsed-column strip cell: count and blocked badge, plus the same
 * one-click ticket popover (design v11).
 * Inputs: the cards of this cell (pre-filtered), the config, the
 * open-card callback. Output: the narrow strip content.
 * Failure modes: none.
 */
export function CollapsedColCell({ cards, config, onOpen }: {
  cards: CardState[];
  config: BoardConfig;
  onOpen: (card: CardState) => void;
}) {
  const blocked = cards.filter((card) => card.blocked).length;
  const pop = useCellPopover(cards.length);
  return (
    <div className={"ccol-cell" + (cards.length ? " has" : "")} onMouseEnter={pop.open} onClick={pop.open}>
      <span className="ccount">{cards.length || ""}</span>
      {blocked > 0 && <span className="cblk">{blocked}</span>}
      {pop.rect && <CollapsedTicketList anchorRect={pop.rect} list={cards} config={config} onOpen={onOpen} onClose={pop.close} />}
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
function LaneRow({ lane, props }: { lane: Lane; props: BoardGridProps }) {
  const laneCollapsed = props.collapsedLanes.has(lane.id);
  const expandedCount = props.config.lanes.filter((entry) => !props.collapsedLanes.has(entry.id)).length;
  return (
    <>
      <LaneLabel lane={lane} collapsed={laneCollapsed} disabled={!laneCollapsed && expandedCount <= 1}
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
