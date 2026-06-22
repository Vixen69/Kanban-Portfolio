// One lane-column cell: drop target, blocked badge, cards in the rendering
// the current view mode dictates. Clicking the cell focuses it.

import type { BoardConfig, CardState, Column, Lane } from "../../core/types.ts";
import { cellCards } from "../../core/board.ts";
import { CardNormal, CardRadiator } from "./cards.tsx";

/** A lane-column coordinate. */
export interface CellRef {
  laneId: string;
  columnId: string;
}

export interface CellProps {
  lane: Lane;
  column: Column;
  cards: CardState[];
  config: BoardConfig;
  now: Date;
  /** Base view mode: "normal" or "radiator". */
  mode: "normal" | "radiator";
  /** The focused cell, when focus view is active. */
  focusCell: CellRef | null;
  dragOver: CellRef | null;
  /** Ids of the cards the sidebar filters dim. */
  dimmedIds: ReadonlySet<string>;
  /** Show the code projet on cards (sidebar toggle). */
  showCodes: boolean;
  onFocus: (cell: CellRef) => void;
  /** Two-stage card click (focus the cell, then open the detail). */
  onOpenCard: (card: CardState) => void;
  onDrop: (cardId: string, to: CellRef) => void;
  onDragOver: (cell: CellRef | null) => void;
  onMoveKey: (cardId: string, key: string) => void;
}

function sameCell(a: CellRef | null, b: CellRef): boolean {
  return a !== null && a.laneId === b.laneId && a.columnId === b.columnId;
}

function dropHandlers(props: CellProps, here: CellRef) {
  return {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      props.onDragOver(here);
    },
    onDragLeave: () => props.onDragOver(null),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      const cardId = event.dataTransfer.getData("text/plain");
      props.onDragOver(null);
      if (cardId) props.onDrop(cardId, here);
    },
  };
}

function CellCards({ cards, asNormal, props }: { cards: CardState[]; asNormal: boolean; props: CellProps }) {
  // Cards handle their own clicks (two-stage open, with stopPropagation);
  // clicks on the empty space between cards bubble up and focus the cell.
  const shared = {
    config: props.config,
    now: props.now,
    showCodes: props.showCodes,
    onOpen: props.onOpenCard,
    onMoveKey: props.onMoveKey,
  };
  return (
    <div className="cell-cards">
      {cards.map((card) =>
        asNormal ? (
          <CardNormal key={card.id} card={card} dimmed={props.dimmedIds.has(card.id)} {...shared} />
        ) : (
          <CardRadiator key={card.id} card={card} dimmed={props.dimmedIds.has(card.id)} {...shared} />
        ),
      )}
    </div>
  );
}

/**
 * One lane-column cell: drop target, blocked badge, click-to-focus.
 * Inputs: CellProps (lane, column, all cards, config, now, view mode,
 * focus/drag state and the interaction callbacks).
 * Output: the cell element; renders full cards when itself focused or in
 * normal mode, radiator bars otherwise; dimmed when another cell is
 * focused. Failure: none.
 */
export function Cell(props: CellProps) {
  const here: CellRef = { laneId: props.lane.id, columnId: props.column.id };
  const inCell = cellCards(props.cards, here.laneId, here.columnId);
  const blockedCount = inCell.filter((card) => card.blocked).length;
  const focused = sameCell(props.focusCell, here);
  const dimmed = props.focusCell !== null && !focused;
  const asNormal = focused || (props.mode === "normal" && props.focusCell === null);
  const className =
    "cell" +
    (focused ? " focused" : "") +
    (dimmed ? " dimmed" : "") +
    (sameCell(props.dragOver, here) ? " dragover" : "") +
    (asNormal ? " mode-normal" : " mode-radiator");

  return (
    <div
      className={className}
      data-lane-id={here.laneId}
      data-column-id={here.columnId}
      onClick={() => props.onFocus(here)}
      {...dropHandlers(props, here)}
    >
      <div className="cell-head">
        {blockedCount > 0 && <span className="cell-blocked">{blockedCount}</span>}
        <span className="cell-count">{inCell.length || ""}</span>
      </div>
      <CellCards cards={inCell} asNormal={asNormal} props={props} />
    </div>
  );
}

/**
 * Summary strip shown in place of the cells of a collapsed lane.
 * Inputs: the lane, the column, the cards of this cell, blocked and
 * stagnant counts. Output: count + blocked badge + stagnation dot.
 * Failure: none.
 */
export function CollapsedCell(props: {
  lane: Lane;
  column: Column;
  cards: CardState[];
  blockedCount: number;
  staleCount: number;
}) {
  const count = props.cards.length;
  return (
    <div className="ccell">
      <span className="ccount">{count || ""}</span>
      {props.blockedCount > 0 && <span className="cblk">{props.blockedCount}</span>}
      {props.staleCount > 0 && (
        <span className="cstale" title={`${props.staleCount} stagnant(s)`} />
      )}
    </div>
  );
}
