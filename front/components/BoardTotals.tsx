// Money and load read-outs worn by the column headers and the canal labels
// (design v12). All arithmetic comes from core/totals — this file only
// formats and lays out. fr-FR formatting lives HERE, never in core: the
// thousands separator is an ICU detail of the display, not of the domain.

import type { BoardConfig } from "../../core/types.ts";
import { profileLoadRows, remainingLoad, type GroupTotals } from "../../core/totals.ts";

// Whole units, French grouping. Money is k€ and load is j.h — decimals
// would be noise at portfolio scale.
function fmt(value: number): string {
  return Math.round(value).toLocaleString("fr-FR");
}

/**
 * One labelled figure of a totals block.
 * Inputs: the label, the formatted value, its unit, and the row modifiers
 * (`cap` for the plan-de-charge row, `over` when past the envelope).
 * Output: the row element. Failure modes: none.
 */
export function TotalsRow({ label, value, unit, cap, over }: {
  label: string;
  value: number;
  unit: string;
  cap?: boolean;
  over?: boolean;
}) {
  return (
    <div className={"ct-row" + (cap === true ? " cap" : "") + (over === true ? " over" : "")}>
      <span>{label}</span>
      <b>{fmt(value)}<i>{unit}</i></b>
    </div>
  );
}

/**
 * The per-profile breakdown: reste à faire per DSI profile, heaviest first.
 * The list is capped in height and scrolls (see .ct-roles) so a 19-profile
 * typology cannot push the board off one screen.
 * Inputs: the aggregate, the board config (profile names and colors).
 * Output: the rows, or null when no profile carries charge. Failure: none.
 */
export function ProfileBreakdown({ totals, config }: { totals: GroupTotals; config: BoardConfig }) {
  const rows = profileLoadRows(totals, config);
  if (rows.length === 0) return null;
  return (
    <div className="ct-roles">
      {rows.map((row) => (
        <div className="ct-role" key={row.id}>
          <span className="ct-role-name"><i style={{ background: row.color }} />{row.name}</span>
          <b>{fmt(row.remaining)}</b>
        </div>
      ))}
    </div>
  );
}

/**
 * The full budget croisé + plan de charge read-out, shared by the unfolded
 * column header and the unfolded canal label.
 * Inputs: the aggregate, the board config, an extra class for the canal
 * variant. Output: the totals block. Failure modes: none.
 */
export function ExpandedTotals({ totals, config, extraClass }: {
  totals: GroupTotals;
  config: BoardConfig;
  extraClass?: string;
}) {
  return (
    <div
      className={"col-totals" + (extraClass === undefined ? "" : " " + extraClass)}
      title={totals.count + " sujet(s) affiché(s) · totaux filtrés"}
    >
      <TotalsRow label="Enveloppe RDLI" value={totals.rdli} unit="k€" />
      <TotalsRow label="Meilleur estimé" value={totals.estimated} unit="k€" />
      <TotalsRow label="Engagé" value={totals.engaged} unit="k€" />
      <TotalsRow label="Réalisé" value={totals.consumed} unit="k€" over={totals.consumed > totals.rdli} />
      <TotalsRow label="Plan de charge" value={remainingLoad(totals)} unit="j.h RAF" cap />
      <ProfileBreakdown totals={totals} config={config} />
    </div>
  );
}

/**
 * Column-header totals. Folded, it keeps the two figures a stage is read
 * on (estimé, charge restante); unfolded, the full budget croisé.
 * Inputs: the column aggregate, the board config, the unfolded flag.
 * Output: the totals block. Failure modes: none.
 */
export function ColumnTotals({ totals, config, open }: {
  totals: GroupTotals;
  config: BoardConfig;
  open: boolean;
}) {
  if (open) return <ExpandedTotals totals={totals} config={config} />;
  return (
    <div className="col-totals compact" title="Déplier les totaux (bouton Σ en haut à gauche)">
      <TotalsRow label="Estimé" value={totals.estimated} unit="k€" />
      <TotalsRow label="Charge" value={remainingLoad(totals)} unit="j.h RAF" cap />
    </div>
  );
}

/**
 * Canal-label totals. Folded, a single inline pill inside the vertical
 * label; unfolded, the same block as the column headers (the label turns
 * horizontal — see .lane-label.expanded).
 * Inputs: the lane aggregate, the board config, the unfolded flag, the
 * lane name (tooltip). Output: the read-out, or null when the canal shows
 * nothing. Failure modes: none.
 */
export function LaneTotals({ totals, config, open, laneName }: {
  totals: GroupTotals;
  config: BoardConfig;
  open: boolean;
  laneName: string;
}) {
  if (open) return <ExpandedTotals totals={totals} config={config} extraClass="lane-col-totals" />;
  if (totals.count === 0) return null;
  return (
    <span className="lane-totals" title={totals.count + " sujet(s) · canal " + laneName}>
      <b>{fmt(totals.estimated)}</b>k€ · RAF <b>{fmt(remainingLoad(totals))}</b>j.h
    </span>
  );
}

/**
 * The two Σ toggles of the grid corner: per-column totals and per-canal
 * totals, each remembered across reloads.
 * Inputs: both open flags and their toggles.
 * Output: the corner cell content. Failure modes: none.
 */
export function TotalsToggles({ columnsOpen, lanesOpen, onToggleColumns, onToggleLanes }: {
  columnsOpen: boolean;
  lanesOpen: boolean;
  onToggleColumns: () => void;
  onToggleLanes: () => void;
}) {
  return (
    <>
      <button
        className="totals-toggle"
        onClick={onToggleColumns}
        title={(columnsOpen ? "Replier" : "Déplier") + " les totaux par colonne"}
      >
        {columnsOpen ? "▾" : "▸"} Σ
      </button>
      <button
        className="totals-toggle"
        onClick={onToggleLanes}
        title={(lanesOpen ? "Replier" : "Déplier") + " les totaux par canal"}
      >
        {lanesOpen ? "▾" : "▸"} Σ
      </button>
    </>
  );
}
