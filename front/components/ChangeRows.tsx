// One row of the grouped changes (ADR 053/055): code · titre · ancien →
// nouveau. A figure row adds its unit and its signed delta, marked ↑ or ↓
// in the sober warn / ok tones; a plan de charge row reads « prévu a → b
// j.h · RAF a → b j.h » and unfolds to the métiers that moved. Words and
// numbers come from ../changeGroups.ts; nothing here computes.

import type { BoardConfig } from "../../core/types.ts";
import type { CardChange, FigureChange, PlanChange } from "../../core/snapshot-diff.ts";
import {
  changeWords, fmtFigure, planDelta, planPair, planSummary, profileName, signedDelta,
} from "../changeGroups.ts";

/**
 * The direction of a change, sober: « ↑ +12,5 » in the warning tone, « ↓ −3 »
 * in the ok tone. Inputs: the delta (null when a side is missing), an
 * optional unit. Output: the mark, nothing when flat or unknown.
 * Failure modes: none.
 */
export function TrendMark({ delta, unit = "" }: { delta: number | null; unit?: string }) {
  const { trend, text } = signedDelta(delta);
  if (trend === null) return null;
  return (
    <span className={"chg-trend " + trend} title={trend === "up" ? "hausse" : "baisse"}>
      {trend === "up" ? "↑" : "↓"} {text}{unit === "" ? "" : ` ${unit}`}
    </span>
  );
}

function Who({ change, showYear }: { change: CardChange; showYear: boolean }) {
  return (
    <>
      {change.codename !== null && <span className="sd-code">{change.codename}</span>}
      <span className="sd-title">{change.title}</span>
      {showYear && change.exercise !== null && <span className="sd-year">{change.exercise}</span>}
    </>
  );
}

function FigureValues({ figure }: { figure: FigureChange }) {
  return (
    <span className="sd-move">
      {fmtFigure(figure.before)} → <b>{fmtFigure(figure.after)}</b> {figure.unit} <TrendMark delta={figure.delta} />
    </span>
  );
}

// The métiers that moved, one line each: prévu, fait, RAF — before → after.
function PlanProfiles({ plan, config }: { plan: PlanChange; config: BoardConfig }) {
  if (plan.profiles.length === 0) return <div className="m2-note">Aucun métier n’a bougé (seule la ventilation a changé).</div>;
  return (
    <table className="chg-metiers">
      <thead>
        <tr><th scope="col">Métier</th><th scope="col">Prévu j.h</th><th scope="col">Fait j.h</th><th scope="col">RAF j.h</th></tr>
      </thead>
      <tbody>
        {plan.profiles.map((line) => (
          <tr key={line.profileId}>
            <th scope="row">{profileName(config, line.profileId)}</th>
            <td>{planPair(line.before, line.after, "planned")}</td>
            <td>{planPair(line.before, line.after, "done")}</td>
            <td>{planPair(line.before, line.after, "raf")} <TrendMark delta={planDelta(line.before.raf, line.after.raf)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlanRow({ change, plan, config, showYear }: { change: CardChange; plan: PlanChange; config: BoardConfig; showYear: boolean }) {
  return (
    <li className="sd-item chg-plan">
      <details>
        <summary>
          <Who change={change} showYear={showYear} />
          <span className="sd-move">{planSummary(plan)}</span>
          <TrendMark delta={planDelta(plan.before.raf, plan.after.raf)} unit="j.h de RAF" />
        </summary>
        <PlanProfiles plan={plan} config={config} />
      </details>
    </li>
  );
}

/**
 * One change as a list row.
 * Inputs: the change, the config (column, canal, domain, type and métier
 * names), whether to show the card's exercise (the snapshot comparison
 * spans years; the import reads one). Output: the <li>. Failure modes:
 * none — an id the config no longer declares shows as is.
 */
export function ChangeRow({ change, config, showYear }: { change: CardChange; config: BoardConfig; showYear: boolean }) {
  if (change.kind === "plan") return <PlanRow change={change} plan={change.plan} config={config} showYear={showYear} />;
  const both = change.kind !== "figure" && (change.from !== null || change.to !== null);
  return (
    <li className="sd-item">
      <Who change={change} showYear={showYear} />
      {change.kind === "figure" && <FigureValues figure={change.figure} />}
      {both && (
        <span className="sd-move">{changeWords(config, change.kind, change.from)} → <b>{changeWords(config, change.kind, change.to)}</b></span>
      )}
    </li>
  );
}

