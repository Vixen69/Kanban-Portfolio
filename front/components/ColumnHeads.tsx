// Column headers of the board (design grid.jsx): click to focus a stage,
// caret to collapse it to a 30px strip, the v12 money/charge totals of the
// retained cards, and the stage's card count — « retenus/total » while the
// board is narrowed by the sidebar filters (ADR 031). Split from
// BoardGrid.tsx to respect the 300-line file cap.

import type { CSSProperties } from "react";
import type { BoardConfig, CardState, Column, GateDef } from "../../core/types.ts";
import { emptyTotals, type GroupTotals } from "../../core/totals.ts";
import { ColumnTotals } from "./BoardTotals.tsx";

/**
 * The gate definition of a column, or null when the column has no gate.
 * Inputs: the board config, the column. Output: the GateDef or null.
 * Failure modes: none.
 */
export function gateDefOf(config: BoardConfig, column: Column): GateDef | null {
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

// The stage's card count (ADR 031): the whole count, or « retenus/total »
// in the accent color while the board is narrowed by the filters.
function ColumnCount({ shown, all, narrowed }: { shown: number; all: number; narrowed: boolean }) {
  return (
    <span className={"col-count" + (narrowed ? " narrowed" : "")}
      title={narrowed ? `${shown} sujet(s) retenu(s) par les filtres sur ${all}` : `${all} sujet(s)`}>
      {narrowed ? `${shown}/${all}` : all}
    </span>
  );
}

/**
 * Column header. Clicking the body focuses the stage; the caret button
 * collapses the column to a 30px strip (design grid.jsx). The functional
 * note is carried by the tooltip since v12 gave its row to the totals.
 * Inputs: the column, its gate definition (null when ungated), focus and
 * collapse state, the visible totals of the column (its `count` is the
 * retained card count) and whether they are unfolded, the column's whole
 * card count and whether the board is narrowed by the filters, and the
 * callbacks (both receive the column id).
 * Output: the header element — a vertical label variant when collapsed.
 * Failure modes: none.
 */
export function ColumnHeader({ col, gateDef, focused, colCollapsed, totals, totalsOpen, all, narrowed, config, onFocus, onToggleCollapse }: {
  col: Column;
  gateDef: GateDef | null;
  focused: boolean;
  colCollapsed: boolean;
  totals: GroupTotals;
  totalsOpen: boolean;
  all: number;
  narrowed: boolean;
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
        <ColumnCount shown={totals.count} all={all} narrowed={narrowed} />
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
 * The row of column headers: per-column totals of the retained cards, the
 * whole card count of each column, and the narrowed flag (ADR 031).
 * Inputs: the config, all folded cards, the hidden id set, focus/collapse
 * state, the per-column totals, the unfolded flag, the callbacks.
 * Output: the header elements (a fragment). Failure modes: none.
 */
export function ColumnHeads({ config, cards, hiddenIds, focusedColumn, collapsedCols, byColumn, totalsOpen, onFocus, onToggleCollapse }: {
  config: BoardConfig;
  cards: CardState[];
  hiddenIds: Set<string>;
  focusedColumn: string | null;
  collapsedCols: Set<string>;
  byColumn: Record<string, GroupTotals>;
  totalsOpen: boolean;
  onFocus: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  const narrowed = hiddenIds.size > 0;
  return (
    <>
      {config.columns.map((col) => (
        <ColumnHeader
          key={col.id}
          col={col}
          gateDef={gateDefOf(config, col)}
          focused={focusedColumn === col.id}
          colCollapsed={collapsedCols.has(col.id)}
          totals={byColumn[col.id] ?? emptyTotals()}
          totalsOpen={totalsOpen}
          all={cards.filter((card) => card.columnId === col.id).length}
          narrowed={narrowed}
          config={config}
          onFocus={onFocus}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
    </>
  );
}
