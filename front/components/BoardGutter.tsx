// The board gutter, left of Demandes (ADR 039, ADR 048): the whole board
// shown, read for the arbitration session. Folded, a vertical strip —
// count, estimé k€, RAF engagé. Unfolded by its Σ in the grid's top-left
// corner (author, 2026-09-29: the button is not in the column), the
// read-out the room looks at: the caption
// and what bounds the figures (filters, exercise, métiers), the RAF engagé
// in large, the non-engaged and out-of-count RAF, the legend of the
// classes, the « sans ventilation » note, a k€ line, then the métier list
// (GutterMetiers). No persons figure (author, 2026-09-28): j.h ÷ working
// days is not a headcount the tool can stand behind. Only the list
// scrolls: nothing above it changes height while métiers are checked. No
// tooltip on the unfolded gutter — it is read on the projector.

import type { CSSProperties } from "react";
import type { BoardConfig } from "../../core/types.ts";
import { fmtUnit } from "../format.ts";
import { blindNote, classLegend, scopeLabel, scopeTitle } from "../rafLabels.ts";
import type { BoardTotals } from "../useBoardTotals.ts";
import type { BoardLens } from "../useRafLens.ts";
import { GutterMetiers } from "./GutterMetiers.tsx";

/** Props of the board gutter. */
export interface BoardGutterProps {
  totals: BoardTotals;
  config: BoardConfig;
  lens: BoardLens;
  open: boolean;
  onToggle: () => void;
  /** The lane rows the gutter spans. */
  rows: number;
  /** The cards of the exercise shown (the « filtré N/M » denominator). */
  all: number;
  /** True while the sidebar filters or the métier lens hide cards (ADR 031, 048). */
  narrowed: boolean;
}

// The gutter spans every lane row of the first grid column.
function spanStyle(rows: number): CSSProperties {
  return { gridColumn: 1, gridRow: `2 / span ${rows}` };
}

// A figure of the counted métiers, « — » when none is counted.
function rafText(value: number, lens: BoardLens): string {
  return lens.counted.size === 0 ? "—" : fmtUnit(value);
}

// Folded: the vertical strip. The corner's Σ unfolds it; a click on the
// strip does too, as a shortcut (the button stays the keyboard's way).
function FoldedGutter({ props }: { props: BoardGutterProps }) {
  const { totals, lens } = props;
  return (
    <div className="lane-label board-gutter" style={spanStyle(props.rows)} onClick={props.onToggle}
      title={`Déplier la colonne des totaux (Σ ▾ en haut à gauche) · ${scopeTitle(lens.scope, props.config)}`}>
      <span className="lane-name">Projets · {totals.board.count}</span>
      <span className={"lane-totals" + (lens.active ? " lens-on" : "")}>
        <b>{fmtUnit(totals.board.estimated)}</b>k€ · RAF engagé <b className="raf">{rafText(totals.split.engaged, lens)}</b>j.h
      </span>
    </div>
  );
}

// The caption: the count, then what bounds the figures — the filters (the
// lens's own included), an exercise other than the current one, the
// métiers counted; with « rien », the prompt, in the same two reserved
// lines so the list never moves under the hand.
function GutterCaption({ props }: { props: BoardGutterProps }) {
  const { totals, lens } = props;
  const prompt = lens.counted.size === 0 ? " — cochez un ou plusieurs métiers" : "";
  return (
    <>
      <div className="gut-caption">
        <span>Projets · {totals.board.count}</span>
        {props.narrowed && <span className="gut-flag">filtré {totals.board.count}/{props.all}</span>}
        {lens.status !== "current" && (
          <span className="gut-flag year">{lens.year} · {lens.status === "closed" ? "exercice clos" : "en préparation"}</span>
        )}
      </div>
      <div className={"gut-scope" + (lens.active ? " on" : "")}>Périmètre : {scopeLabel(lens.scope, props.config)}{prompt}</div>
    </>
  );
}

// The headline: the engaged RAF in large.
function GutterHeadline({ props }: { props: BoardGutterProps }) {
  const { totals, lens } = props;
  return (
    <div className="gut-headline">
      <div className="gut-label">RAF engagé</div>
      <div className={"gut-big" + (lens.active ? " on" : "")}>{rafText(totals.split.engaged, lens)}<i>j.h</i></div>
    </div>
  );
}

// One labelled figure of the gutter: label left, value and unit right.
function GutterLine({ label, value, unit, faded }: { label: string; value: string; unit: string; faded?: boolean }) {
  return <div className={"gut-line" + (faded === true ? " faded" : "")}><span>{label}</span><b>{value}<i>{unit}</i></b></div>;
}

// The other classes, the legend (the class word set off), the blind
// note, then the board's money on the same label/value lines.
function GutterFigures({ props }: { props: BoardGutterProps }) {
  const { totals, lens } = props;
  const note = blindNote(totals.split);
  return (
    <>
      <GutterLine label="RAF non engagé" value={rafText(totals.split.idle, lens)} unit="j.h" />
      <GutterLine label="RAF hors calcul" value={rafText(totals.split.excluded, lens)} unit="j.h" faded />
      <div className="gut-legend">
        {classLegend(props.config).map((line) => {
          const [word, names] = line.text.split(" : ");
          return <div key={line.cls}><b>{word}</b> : {names}</div>;
        })}
      </div>
      {note !== null && <div className="gut-note">{note}</div>}
      <div className="gut-money">
        <GutterLine label="Estimé" value={fmtUnit(totals.board.estimated)} unit="k€" />
        <GutterLine label="Budget engagé" value={fmtUnit(totals.board.engaged)} unit="k€" />
      </div>
    </>
  );
}

/**
 * The board gutter: folded strip or unfolded read-out with the métier lens.
 * Inputs: BoardGutterProps. Output: the gutter cell. Failure modes: none.
 */
export function BoardGutter(props: BoardGutterProps) {
  if (!props.open) return <FoldedGutter props={props} />;
  return (
    <div className="board-gutter-open" style={spanStyle(props.rows)}>
      <GutterCaption props={props} />
      <GutterHeadline props={props} />
      <GutterFigures props={props} />
      <GutterMetiers rows={props.totals.rows} lens={props.lens} />
    </div>
  );
}
