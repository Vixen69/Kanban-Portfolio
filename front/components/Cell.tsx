// One lane-column cell (design board.jsx Cell): WIP heat + blocked count
// in the head, gate line on gated columns, then the cards — expanded when
// the column is focused, radiator bars otherwise. The cell is the drop
// target of the drag-and-drop flow.

import type { CSSProperties, DragEvent } from "react";
import type { BoardConfig, CardState, Column, GateDef, Lane } from "../../core/types.ts";
import { wipDisplay, wipState } from "../../core/board.ts";
import { FocusCard, MiniCard } from "./cards.tsx";

/** Props of one cell (pinned build-spec contract). */
export interface CellProps {
  lane: Lane;
  column: Column;
  /** The cards of THIS cell only (BoardGrid filters via core cellCards). */
  cards: CardState[];
  dimmedIds: Set<string>;
  focused: boolean;
  config: BoardConfig;
  /** Epoch milliseconds of the shared "now" tick. */
  now: number;
  showCodes: boolean;
  /** True when a dragged card is currently over this cell. */
  dragOver: boolean;
  /** The gate definition of the column, or null when ungated. */
  gateDef: GateDef | null;
  onOpen: (card: CardState) => void;
  onDragStart: (e: DragEvent, card: CardState) => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent, laneId: string, columnId: string) => void;
  onDragOverCell: (e: DragEvent, laneId: string, columnId: string) => void;
  onDragLeaveCell: () => void;
}

// The card stack of the cell; a focused column shows expanded cards. An
// empty cell keeps a filler so the drop target spans the full height.
function CellCardList({ props }: { props: CellProps }) {
  const shared = {
    now: props.now,
    config: props.config,
    showCodes: props.showCodes,
    onOpen: props.onOpen,
    onDragStart: props.onDragStart,
    onDragEnd: props.onDragEnd,
  };
  return (
    <div className="cell-cards">
      {props.cards.map((card) =>
        props.focused ? (
          <FocusCard key={card.id} card={card} dimmed={props.dimmedIds.has(card.id)} {...shared} />
        ) : (
          <MiniCard key={card.id} card={card} dimmed={props.dimmedIds.has(card.id)} {...shared} />
        ),
      )}
      {props.cards.length === 0 && <span className="cell-empty" />}
    </div>
  );
}

/**
 * One lane-column cell: drop target with WIP heat (data-wip attribute +
 * read-out via core/board), blocked count badge, gate line and the card
 * list (FocusCard when the column is focused, MiniCard otherwise).
 * Inputs: CellProps — cards come in already cell-filtered.
 * Output: the .cell element wired to the drag callbacks.
 * Failure modes: none.
 */
export function Cell(props: CellProps) {
  const { lane, column, cards, gateDef } = props;
  const wip = wipState(cards.length, column.wip);
  const blockedCount = cards.filter((card) => card.blocked).length;
  return (
    <div
      className={"cell" + (props.focused ? " focused" : "") + (props.dragOver ? " dragover" : "")}
      data-wip={wip}
      onDragOver={(e) => props.onDragOverCell(e, lane.id, column.id)}
      onDragLeave={props.onDragLeaveCell}
      onDrop={(e) => props.onDrop(e, lane.id, column.id)}
    >
      {gateDef !== null && column.gate !== null && (
        <span
          className="gate-line"
          style={{ "--gate": gateDef.color } as CSSProperties}
          title={`${column.gate} — ${gateDef.name}`}
        />
      )}
      <div className="cell-head">
        <span className={"wip " + wip}>{wipDisplay(cards.length, column.wip)}</span>
        {blockedCount > 0 && <span className="cell-blocked">{blockedCount}</span>}
      </div>
      <CellCardList props={props} />
    </div>
  );
}
