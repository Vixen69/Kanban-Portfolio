// Money and load read-outs worn by the column headers and the canal labels
// (design v12). All arithmetic comes from core/totals — this file only
// formats and lays out. fr-FR formatting lives HERE, never in core: the
// thousands separator is an ICU detail of the display, not of the domain.
//
// ADR 048: the reste à faire row wears its column's class — « RAF engagé »
// (ink), « RAF non engagé » (grey), « RAF hors calcul » (faded) — and
// counts the métiers of the lens only: « — » when none is counted, the
// accent colour and the scope in the tooltip while the lens narrows them.

import type { BoardConfig } from "../../core/types.ts";
import type { ColumnClass } from "../../core/column-class.ts";
import { rafRows, scopedRaf, type GroupTotals } from "../../core/totals.ts";
import { fmtUnit } from "../format.ts";
import { CLASS_LABEL, laneRafNote } from "../rafLabels.ts";

// Aggregates are read at portfolio scale: whole units (front/format.ts).
const fmt = fmtUnit;

/** How a totals block reads its reste à faire (ADR 048). */
export interface RafRead {
  /** The métiers counted. */
  counted: ReadonlySet<string>;
  /** True while the lens narrows the métiers. */
  active: boolean;
  /** The scope in words, the tooltip of a lensed value. */
  title: string;
}

/** The tone of a reste à faire row: its column's class, or the canal's own. */
export type RafTone = ColumnClass | "lane";

/**
 * One labelled figure of a totals block.
 * Inputs: the label, the value (null reads « — »), its unit, the row
 * modifiers (`cap` for the reste-à-faire row, `over` when past the
 * envelope), an extra class and a tooltip.
 * Output: the row element. Failure modes: none.
 */
export function TotalsRow({ label, value, unit, cap, over, extra, title }: {
  label: string;
  value: number | null;
  unit: string;
  cap?: boolean;
  over?: boolean;
  extra?: string;
  title?: string | undefined;
}) {
  const modifiers = (cap === true ? " cap" : "") + (over === true ? " over" : "") + (extra === undefined ? "" : " " + extra);
  return (
    <div className={"ct-row" + modifiers} title={title}>
      <span>{label}</span>
      <b>{value === null ? "—" : fmt(value)}<i>{unit}</i></b>
    </div>
  );
}

// The tooltip of a reste-à-faire figure: its note, then the lens scope.
function rafTitle(read: RafRead, note?: string): string | undefined {
  const parts = [note ?? "", read.active ? read.title : ""].filter((part) => part !== "");
  return parts.length === 0 ? undefined : parts.join(" · ");
}

// The reste à faire row of a block, on the counted métiers.
function RafRow({ totals, read, label, tone, note }: {
  totals: GroupTotals; read: RafRead; label: string; tone: RafTone; note?: string | undefined;
}) {
  const value = read.counted.size === 0 ? null : scopedRaf(totals, read.counted);
  return (
    <TotalsRow label={label} value={value} unit="j.h" cap extra={`raf-${tone}` + (read.active ? " lens-on" : "")}
      title={rafTitle(read, note)} />
  );
}

/**
 * The per-métier breakdown: reste à faire of each counted métier, largest
 * first, the métiers with nothing left dropped. The list is capped in
 * height and scrolls (see .ct-roles) so a 19-profile typology cannot push
 * the board off one screen.
 * Inputs: the aggregate, the board config, the counted métiers.
 * Output: the rows, or null when nothing is left. Failure: none.
 */
export function ProfileBreakdown({ totals, config, counted }: { totals: GroupTotals; config: BoardConfig; counted: ReadonlySet<string> }) {
  const rows = rafRows(totals, config, counted);
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
 * The full budget croisé + reste à faire read-out, shared by the unfolded
 * column header and the unfolded canal label.
 * Inputs: the money aggregate, the reste-à-faire aggregate (the canal's
 * leaves the out-of-count columns out), the config, the lens read, the
 * row's label and tone, an optional tooltip note, an extra class.
 * Output: the totals block. Failure modes: none.
 */
export function ExpandedTotals({ totals, rafTotals, config, read, label, tone, note, extraClass }: {
  totals: GroupTotals;
  rafTotals: GroupTotals;
  config: BoardConfig;
  read: RafRead;
  label: string;
  tone: RafTone;
  note?: string | undefined;
  extraClass?: string;
}) {
  return (
    <div
      className={"col-totals" + (extraClass === undefined ? "" : " " + extraClass)}
      title={totals.count + " sujet(s) affiché(s) · totaux filtrés"}
    >
      <TotalsRow label="Enveloppe RDLI" value={totals.rdli} unit="k€" />
      <TotalsRow label="Meilleur estimé" value={totals.estimated} unit="k€" />
      <TotalsRow label="Budget engagé" value={totals.engaged} unit="k€" />
      <TotalsRow label="Réalisé" value={totals.consumed} unit="k€" over={totals.consumed > totals.rdli} />
      <RafRow totals={rafTotals} read={read} label={label} tone={tone} note={note} />
      <ProfileBreakdown totals={rafTotals} config={config} counted={read.counted} />
    </div>
  );
}

/**
 * Column-header totals. Folded, the two figures a stage is read on
 * (estimé, reste à faire of its class); unfolded, the full budget croisé.
 * Inputs: the column aggregate, the config, the unfolded flag, the
 * column's class, the lens read. Output: the totals block. Failure: none.
 */
export function ColumnTotals({ totals, config, open, cls, read }: {
  totals: GroupTotals;
  config: BoardConfig;
  open: boolean;
  cls: ColumnClass;
  read: RafRead;
}) {
  const label = CLASS_LABEL[cls];
  if (open) return <ExpandedTotals totals={totals} rafTotals={totals} config={config} read={read} label={label} tone={cls} />;
  return (
    <div className="col-totals compact" title="Déplier les totaux (bouton Σ en haut à gauche)">
      <TotalsRow label="Estimé" value={totals.estimated} unit="k€" />
      <RafRow totals={totals} read={read} label={label} tone={cls} />
    </div>
  );
}

/**
 * Canal-label totals. Folded, a single inline pill inside the vertical
 * label; unfolded, the same block as the column headers (the label turns
 * horizontal — see .lane-label.expanded). The canal's reste à faire leaves
 * the out-of-count columns (Terminé and after) out (author, 2026-09-28).
 * Inputs: the canal's money aggregate, its reste-à-faire aggregate, the
 * config, the unfolded flag, the lane name (tooltip), the lens read.
 * Output: the read-out, or null when the canal shows nothing. Failure: none.
 */
export function LaneTotals({ totals, rafTotals, config, open, laneName, read }: {
  totals: GroupTotals;
  rafTotals: GroupTotals;
  config: BoardConfig;
  open: boolean;
  laneName: string;
  read: RafRead;
}) {
  const note = laneRafNote(config);
  if (open) {
    return <ExpandedTotals totals={totals} rafTotals={rafTotals} config={config} read={read}
      label="RAF" tone="lane" note={note} extraClass="lane-col-totals" />;
  }
  if (totals.count === 0) return null;
  const raf = read.counted.size === 0 ? "—" : fmt(scopedRaf(rafTotals, read.counted));
  const lensed = rafTitle(read, note);
  return (
    <span className={"lane-totals" + (read.active ? " lens-on" : "")}
      title={`${totals.count} sujet(s) · canal ${laneName}` + (lensed === undefined ? "" : " · " + lensed)}>
      <b>{fmt(totals.estimated)}</b>k€ · RAF <b className="raf">{raf}</b>j.h
    </span>
  );
}

/**
 * One Σ toggle: the per-column totals (grid corner, top left), the
 * per-canal totals (the lane gutter's head, ADR 039), or the board gutter
 * (ADR 048), each remembered across reloads.
 * Inputs: the open flag, its toggle, what it unfolds.
 * Output: the button. Failure modes: none.
 */
export function TotalsToggle({ open, onToggle, what }: { open: boolean; onToggle: () => void; what: "colonne" | "canal" | "tableau" }) {
  const verb = open ? "Replier" : "Déplier";
  const title = what === "tableau" ? `${verb} la gouttière du tableau` : `${verb} les totaux par ${what}`;
  return (
    <button className="totals-toggle" onClick={onToggle} title={title}>
      {open ? "▾" : "▸"} Σ
    </button>
  );
}
