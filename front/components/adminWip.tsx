// « Limites WIP » (ADR 046, author 2026-09-24): the WIP limit is set where
// it is read — per cell, canal by column. The columns without canal
// (ADR 039) have one cell. Empty = no limit. A limit warns at 80 %,
// reddens beyond, never blocks. Replaces the Structure pane: columns and
// canals are the versioned model's, which the importer knows.

import type { BoardConfig, Column, Lane } from "../../core/types.ts";
import { UNIFIED_LANE, unifiedColumnIds } from "../../core/layout.ts";
import { cellWipLimit, columnWipLimit, withCellWipLimit } from "../../core/wip.ts";
import type { TabProps } from "./adminTabs.tsx";

type SetLimit = (laneId: string, columnId: string, limit: number | null) => void;

// The typed value of one cell: an integer ≥ 1, or null for anything else.
function parseTyped(text: string): number | null {
  const value = Number(text);
  return text === "" || !Number.isInteger(value) || value < 1 ? null : value;
}

function LimitInput({ draft, laneId, column, laneName, onSet }: {
  draft: BoardConfig; laneId: string; column: Column; laneName: string; onSet: SetLimit;
}) {
  const value = cellWipLimit(draft, laneId, column.id);
  return (
    <input className="ainp wip-cell" type="number" min="1" step="1" placeholder="—"
      title={`Limite de ${column.name} · ${laneName} (vide = aucune)`}
      value={value ?? ""} onChange={(e) => onSet(laneId, column.id, parseTyped(e.target.value))} />
  );
}

// One row of the grid: a canal (or the row without canal), one input per
// column that has a cell there, a dash elsewhere.
function WipRow({ draft, laneId, laneName, unified, onSet }: {
  draft: BoardConfig; laneId: string; laneName: string; unified: ReadonlySet<string>; onSet: SetLimit;
}) {
  return (
    <tr>
      <th>{laneName}</th>
      {draft.columns.map((column) => (
        <td key={column.id}>
          {unified.has(column.id) === (laneId === UNIFIED_LANE)
            ? <LimitInput draft={draft} laneId={laneId} column={column} laneName={laneName} onSet={onSet} />
            : <span className="wip-na">—</span>}
        </td>
      ))}
    </tr>
  );
}

/**
 * The « Limites WIP » pane: a grid canal × column, the sum per column
 * underneath (what the Flux tab reads, only when every canal has one).
 * Inputs: TabProps (draft config + patch callback). Output: the pane DOM.
 * Failure modes: none — a non-integer or a zero clears the cell.
 */
export function WipTab({ draft, patch }: TabProps) {
  const unified = unifiedColumnIds(draft);
  const onSet: SetLimit = (laneId, columnId, limit) => patch({ wipLimits: withCellWipLimit(draft, laneId, columnId, limit).wipLimits });
  const lanes: Lane[] = draft.lanes;
  return (
    <div className="apane">
      <div className="import-note">
        Une limite par case, canal par colonne. Vide = aucune limite. Une limite avertit à 80 %, rougit au-delà et ne
        bloque jamais. L’onglet Flux des analytics lit la somme d’une colonne quand toutes ses cases en ont une.
        Les colonnes et les canaux eux-mêmes se règlent dans le modèle versionné (config/board.json), que l’importeur connaît.
      </div>
      <table className="wip-grid">
        <thead>
          <tr><th /> {draft.columns.map((column) => <th key={column.id}>{column.name}</th>)}</tr>
        </thead>
        <tbody>
          {unified.size > 0 && <WipRow draft={draft} laneId={UNIFIED_LANE} laneName="Sans canal" unified={unified} onSet={onSet} />}
          {lanes.map((lane) => <WipRow key={lane.id} draft={draft} laneId={lane.id} laneName={lane.name} unified={unified} onSet={onSet} />)}
          <tr className="wip-sum">
            <th>Colonne</th>
            {draft.columns.map((column) => <td key={column.id}>{columnWipLimit(draft, column.id) ?? "—"}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
