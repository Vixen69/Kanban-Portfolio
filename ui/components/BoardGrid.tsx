// The board grid: column headers (WIP read-outs), vertical lane labels
// (click to collapse), and the lane-column cells.

import { Fragment } from "react";
import type { BoardConfig, CardState, Column, Lane } from "../../core/types.ts";
import { cellCards, cellSummary, wipStatus } from "../../core/board.ts";
import { Cell, CollapsedCell, type CellRef } from "./Cell.tsx";

export interface BoardGridProps {
  config: BoardConfig;
  cards: CardState[];
  now: Date;
  mode: "normal" | "radiator";
  focusCell: CellRef | null;
  collapsedLanes: ReadonlySet<string>;
  dragOver: CellRef | null;
  /** Ids of the cards the sidebar filters dim. */
  dimmedIds: ReadonlySet<string>;
  /** Show the code projet on cards (sidebar toggle). */
  showCodes: boolean;
  onFocus: (cell: CellRef) => void;
  /** Two-stage card click (focus the cell, then open the detail). */
  onOpenCard: (card: CardState) => void;
  onToggleLane: (laneId: string) => void;
  onDrop: (cardId: string, to: CellRef) => void;
  onDragOver: (cell: CellRef | null) => void;
  onMoveKey: (cardId: string, key: string) => void;
}

function ColumnHead({ column, cards, focusedColumn }: { column: Column; cards: CardState[]; focusedColumn: boolean }) {
  const wip = wipStatus(cards, column.id, column.wipLimit);
  return (
    <div className={"col-head" + (wip.exceeded ? " over" : "") + (focusedColumn ? " focused" : "")}>
      <span className="col-name">{column.name}</span>
      <span className="col-wip">{wip.display}</span>
    </div>
  );
}

function LaneLabel({ lane, collapsed, onToggle }: { lane: Lane; collapsed: boolean; onToggle: () => void }) {
  return (
    <div
      className={"lane-label" + (collapsed ? " collapsed" : "")}
      onClick={onToggle}
      title={collapsed ? `Déplier ${lane.name}` : `Replier ${lane.name}`}
    >
      <span className="caret">{collapsed ? "▸" : "▾"}</span>
      <span className="lane-name">{lane.name}</span>
      {!collapsed && lane.nature && <span className="lane-nature">{lane.nature}</span>}
    </div>
  );
}

function gridTemplateColumns(config: BoardConfig, focusCell: CellRef | null): string {
  const weights = config.columns.map((column) => {
    if (focusCell === null) return "1fr";
    return column.id === focusCell.columnId ? "2.6fr" : "0.62fr";
  });
  return `var(--lane-w) ${weights.join(" ")}`;
}

function gridTemplateRows(config: BoardConfig, focusCell: CellRef | null, collapsed: ReadonlySet<string>): string {
  const weights = config.lanes.map((lane) => {
    if (collapsed.has(lane.id)) return "26px";
    if (focusCell === null) return "1fr";
    return lane.id === focusCell.laneId ? "2.2fr" : "0.7fr";
  });
  return `var(--colhead-h) ${weights.join(" ")}`;
}

function LaneCells({ lane, props }: { lane: Lane; props: BoardGridProps }) {
  const collapsed = props.collapsedLanes.has(lane.id);
  return (
    <Fragment>
      <LaneLabel lane={lane} collapsed={collapsed} onToggle={() => props.onToggleLane(lane.id)} />
      {props.config.columns.map((column) => {
        if (!collapsed) {
          return <Cell key={column.id} lane={lane} column={column} {...props} />;
        }
        const summary = cellSummary(props.cards, lane.id, column.id, props.config, props.now);
        return (
          <CollapsedCell
            key={column.id}
            lane={lane}
            column={column}
            cards={cellCards(props.cards, lane.id, column.id)}
            blockedCount={summary.blockedCount}
            staleCount={summary.staleCount}
          />
        );
      })}
    </Fragment>
  );
}

/**
 * The board grid: one CSS grid of column headers, lane labels and cells.
 * Inputs: BoardGridProps (config, card states, now, view mode, focus and
 * collapse state, drag state, interaction callbacks).
 * Output: the grid element; a focused cell widens its column and heightens
 * its lane, collapsed lanes shrink to summary rows. Failure: none.
 */
export function BoardGrid(props: BoardGridProps) {
  const { config } = props;
  return (
    <div
      className="board"
      style={{
        gridTemplateColumns: gridTemplateColumns(config, props.focusCell),
        gridTemplateRows: gridTemplateRows(config, props.focusCell, props.collapsedLanes),
      }}
    >
      <div className="corner" />
      {config.columns.map((column) => (
        <ColumnHead
          key={column.id}
          column={column}
          cards={props.cards}
          focusedColumn={props.focusCell?.columnId === column.id}
        />
      ))}
      {config.lanes.map((lane) => (
        <LaneCells key={lane.id} lane={lane} props={props} />
      ))}
    </div>
  );
}
