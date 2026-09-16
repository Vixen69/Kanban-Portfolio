// The part of the board WITHOUT canals (ADR 039, author 2026-09-16): before
// the RDO a project is neither small nor complex, so Demandes and
// Qualification are one cell tall as the board — the canals start at
// Études. To their left, the board-totals gutter (every card of the board
// shown, Demandes to Exploitation, filters applied); between them and
// Études, the lane gutter with its own Σ. Qualification IS the gesture:
// dragging a card from a unified cell into a canal of Études.

import type { CSSProperties } from "react";
import type { BoardConfig, CardState, Column } from "../../core/types.ts";
import { UNIFIED_LANE } from "../../core/layout.ts";
import type { GroupTotals } from "../../core/totals.ts";
import type { BoardGridProps } from "./BoardGrid.tsx";
import { LaneTotals, TotalsToggle } from "./BoardTotals.tsx";
import { Cell } from "./Cell.tsx";
import { gateDefOf } from "./ColumnHeads.tsx";
import { CollapsedColCell } from "./CollapsedCells.tsx";

// The lane rows a unified element spans, at the given grid column (1-based).
function span(gridColumn: number, rows: number): CSSProperties {
  return { gridColumn, gridRow: `2 / span ${rows}` };
}

/**
 * The Σ head of the lane gutter (ADR 039): unfolds the per-canal totals.
 * Inputs: the open flag, its toggle. Output: the corner cell. Failure: none.
 */
export function LaneCorner({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="corner lane-corner">
      <TotalsToggle open={open} onToggle={onToggle} what="canal" />
    </div>
  );
}

/**
 * The board-totals gutter, left of Demandes: the whole board shown —
 * Demandes, Qualification and every canal after — count, estimé and RAF,
 * folded as a vertical label or unfolded as the full budget block (it
 * follows the per-column Σ). Never a list of projects: cards start in
 * Demandes.
 * Inputs: the totals of the visible cards, the config, the unfolded flag,
 * the number of lane rows to span. Output: the gutter cell. Failure: none.
 */
export function BoardGutter({ totals, config, open, rows }: { totals: GroupTotals; config: BoardConfig; open: boolean; rows: number }) {
  return (
    <div className={"lane-label no-collapse board-gutter" + (open ? " expanded" : "")} style={span(1, rows)}
      title={`${totals.count} sujet(s) sur le tableau · totaux filtrés`}>
      <span className="lane-name">Projets · {totals.count}</span>
      <LaneTotals totals={totals} config={config} open={open} laneName="tableau entier" />
    </div>
  );
}

// One unified column: the whole column's cards in one cell spanning the
// lane rows, or its collapsed strip. Any lane hovered inside it is the
// same drop target (the cell has no canal).
function UnifiedColumn({ col, index, cards, rows, props }: {
  col: Column; index: number; cards: CardState[]; rows: number; props: BoardGridProps;
}) {
  const style = span(index + 2, rows);
  if (props.collapsedCols.has(col.id)) {
    return <CollapsedColCell cards={cards} config={props.config} onOpen={props.onOpen} style={style} />;
  }
  const wipLimit = col.wip === null ? null : col.wip * props.config.lanes.length;
  return (
    <Cell
      laneId={UNIFIED_LANE}
      column={col}
      cards={cards}
      wipLimit={wipLimit}
      style={style}
      focused={props.focusedColumn === col.id}
      config={props.config}
      now={props.now}
      showCodes={props.showCodes}
      showTypes={props.showTypes}
      dragOver={props.dragOver !== null && props.dragOver.columnId === col.id}
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

/**
 * The unified cells, one per intake column, each spanning every lane row
 * (grid columns 2…, right after the board gutter).
 * Inputs: the unified columns in board order, the board props (cards,
 * hidden ids, state, callbacks), the number of lane rows.
 * Output: the cells. Failure modes: none.
 */
export function UnifiedCells({ columns, props, rows }: { columns: Column[]; props: BoardGridProps; rows: number }) {
  return (
    <>
      {columns.map((col, index) => {
        const inColumn = props.cards.filter((card) => card.columnId === col.id && !props.hiddenIds.has(card.id));
        return <UnifiedColumn key={col.id} col={col} index={index} cards={inColumn} rows={rows} props={props} />;
      })}
    </>
  );
}
