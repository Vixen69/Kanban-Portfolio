// The métier list of the board gutter (ADR 048): every métier of the
// config with its engaged reste à faire over the cards the sidebar
// filters keep, and a checkbox to count it or not — « tout · rien » like the sidebar's
// filters. Names wrap, never cut (the three « CdP INFRA … » differ only by
// their last word); while the lens narrows the métiers, a checked one
// shows its figure in the accent. The figures read the board as the
// sidebar filters leave it — the lens's own filtering aside —, so an
// unchecked métier still says what it would add. The rows
// come in a stable order while the lens is on (useBoardTotals), so a drag
// between columns never makes them jump.

import type { LensRow } from "../../core/raf.ts";
import { fmtUnit } from "../format.ts";
import type { BoardLens } from "../useRafLens.ts";
import { CatHead } from "./sidebarParts.tsx";

// One métier: its checkbox, its name, its engaged RAF.
function MetierRow({ row, lens }: { row: LensRow; lens: BoardLens }) {
  const on = lens.counted.has(row.profile.id);
  return (
    <label className={"gm-row" + (on ? " on" : "")}>
      <input type="checkbox" checked={on} onChange={() => lens.toggle(row.profile.id)} />
      <span className="gm-name"><i style={{ background: row.profile.color }} />{row.profile.name}</span>
      <b>{fmtUnit(row.engaged)}</b>
    </label>
  );
}

/**
 * The métier list with its « tout · rien » head; only the list scrolls.
 * Inputs: the métier rows (core lensRows), the board lens.
 * Output: the list block. Failure modes: none.
 */
export function GutterMetiers({ rows, lens }: { rows: LensRow[]; lens: BoardLens }) {
  return (
    <div className={"gm" + (lens.active ? " active" : "")}>
      <CatHead label="Métiers · RAF engagé j.h" allOn={!lens.active} noneOn={lens.counted.size === 0}
        onAll={lens.all} onNone={lens.none} />
      <div className="gm-list">
        {rows.map((row) => <MetierRow key={row.profile.id} row={row} lens={lens} />)}
      </div>
    </div>
  );
}
