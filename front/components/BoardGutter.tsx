// The board gutter, left of Demandes (ADR 039, ADR 048): the whole board
// shown, read for the arbitration session. Folded, a vertical strip —
// count, estimé k€, RAF engagé — a click unfolds it. Unfolded (Σ tableau,
// its own toggle, remembered), the read-out the room looks at: the caption
// and what bounds the figures (filters, exercise, métiers), the RAF engagé
// in large with its persons, the non-engaged and out-of-count RAF, the
// legend of the classes and the divisor, the « sans ventilation » note, a
// k€ line, then the métier list (GutterMetiers). Only the list scrolls:
// nothing above it changes height while métiers are checked. No tooltip
// on the unfolded gutter — it is read on the projector, not hovered.

import type { CSSProperties, KeyboardEvent } from "react";
import type { BoardConfig } from "../../core/types.ts";
import { fmtUnit } from "../format.ts";
import { blindNote, classLegend, divisorLabel, personsLabel, scopeLabel, scopeTitle } from "../rafLabels.ts";
import type { BoardTotals } from "../useBoardTotals.ts";
import type { BoardLens } from "../useRafLens.ts";
import { TotalsToggle } from "./BoardTotals.tsx";
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
  /** True while the sidebar filters hide cards. */
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

// Folded: the vertical strip, one click (or Enter / Space) unfolds it —
// it is the only way to reach the métier lens.
function FoldedGutter({ props }: { props: BoardGutterProps }) {
  const { totals, lens } = props;
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    props.onToggle();
  };
  return (
    <div className="lane-label board-gutter" style={spanStyle(props.rows)} onClick={props.onToggle}
      role="button" tabIndex={0} onKeyDown={onKey}
      title={`Déplier la gouttière du tableau · ${scopeTitle(lens.scope, props.config)}`}>
      <span className="collapse-caret">▸</span>
      <span className="lane-name">Projets · {totals.board.count}</span>
      <span className={"lane-totals" + (lens.active ? " lens-on" : "")}>
        <b>{fmtUnit(totals.board.estimated)}</b>k€ · RAF engagé <b className="raf">{rafText(totals.split.engaged, lens)}</b>j.h
      </span>
    </div>
  );
}

// The caption: the count, then what bounds the figures — the filters, an
// exercise other than the current one, the métiers counted.
function GutterCaption({ props }: { props: BoardGutterProps }) {
  const { totals, lens } = props;
  return (
    <>
      <div className="gut-caption">
        <TotalsToggle open onToggle={props.onToggle} what="tableau" />
        <span>Projets · {totals.board.count}</span>
        {props.narrowed && <span className="gut-flag">filtré {totals.board.count}/{props.all}</span>}
        {lens.status !== "current" && (
          <span className="gut-flag year">{lens.year} · {lens.status === "closed" ? "exercice clos" : "en préparation"}</span>
        )}
      </div>
      <div className={"gut-scope" + (lens.active ? " on" : "")}>Périmètre : {scopeLabel(lens.scope, props.config)}</div>
    </>
  );
}

// The headline: the engaged RAF in large, its persons below (the line
// keeps its height, empty or not, so the list never moves under the hand).
function GutterHeadline({ props }: { props: BoardGutterProps }) {
  const { totals, lens } = props;
  const none = lens.counted.size === 0;
  const persons = none ? null : personsLabel(totals.split.engaged, lens.days);
  return (
    <div className="gut-headline">
      <div className="gut-label">RAF engagé</div>
      <div className={"gut-big" + (lens.active ? " on" : "")}>{rafText(totals.split.engaged, lens)}<i>j.h</i></div>
      <div className={"gut-pers" + (none ? " prompt" : "")}>
        {none ? "Cochez un ou plusieurs métiers" : persons === null ? "" : `${persons} d’ici le 31/12`}
      </div>
    </div>
  );
}

// The other classes, the legend and divisor, the blind note, the k€ line.
function GutterFigures({ props }: { props: BoardGutterProps }) {
  const { totals, lens } = props;
  const note = blindNote(totals.split);
  return (
    <>
      <div className="gut-line"><span>RAF non engagé</span><b>{rafText(totals.split.idle, lens)}<i>j.h</i></b></div>
      <div className="gut-line faded"><span>RAF hors calcul</span><b>{rafText(totals.split.excluded, lens)}<i>j.h</i></b></div>
      <div className="gut-legend">
        {classLegend(props.config).map((line) => <div key={line.cls}>{line.text}</div>)}
        {lens.days !== null && <div>{divisorLabel(lens.days, lens.year)}</div>}
      </div>
      {note !== null && <div className="gut-note">{note}</div>}
      <div className="gut-money">
        Estimé <b>{fmtUnit(totals.board.estimated)}</b> k€ · Budget engagé <b>{fmtUnit(totals.board.engaged)}</b> k€
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
