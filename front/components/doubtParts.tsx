// The parts of the « Doutes à trancher » section (ADR 062): one row per
// doubt — the project, why it is doubtful, the choices as radio buttons
// with their consequence, the tool's choice marked, « Ne plus me demander
// pour ce projet » — and one line per remembered doubt with its
// « Redemander ». A fieldset per doubt, its legend the project; every
// input sits inside its label.

import { useId } from "react";
import type { ImportDoubt } from "../../core/import-types.ts";
import type { DoubtAnswer } from "../importDoubts.ts";
import { rememberedLine } from "../importDoubts.ts";

function Project({ doubt }: { doubt: ImportDoubt }) {
  return (
    <>
      {doubt.code !== null && <span className="sd-code">{doubt.code}</span>}
      <span className="doubt-title">{doubt.title}</span>
    </>
  );
}

/**
 * One doubt to decide.
 * Inputs: the doubt, the answer shown (the tool's choice until changed),
 * onAnswer (a new option or sticky flag). Output: the fieldset. Failure
 * modes: none.
 */
export function DoubtRow({ doubt, answer, onAnswer }: {
  doubt: ImportDoubt; answer: DoubtAnswer; onAnswer: (answer: DoubtAnswer) => void;
}) {
  const name = useId();
  return (
    <fieldset className="doubt">
      <legend><Project doubt={doubt} /></legend>
      <p className="doubt-why">{doubt.why}</p>
      <div className="doubt-opts">
        {doubt.options.map((option) => (
          <label key={option.id} className={"doubt-opt" + (answer.option === option.id ? " on" : "")}>
            <input type="radio" name={name} value={option.id} checked={answer.option === option.id}
              onChange={() => onAnswer({ ...answer, option: option.id })} />
            <span>{option.label}</span>
            {option.id === doubt.proposed && <span className="doubt-tool">choix de l’outil</span>}
            {option.consequence !== null && <span className="doubt-csq">→ {option.consequence}</span>}
          </label>
        ))}
      </div>
      <label className="doubt-sticky">
        <input type="checkbox" checked={answer.sticky} onChange={(e) => onAnswer({ ...answer, sticky: e.target.checked })} />
        Ne plus me demander pour ce projet
      </label>
    </fieldset>
  );
}

/**
 * The doubts settled by a remembered choice, folded: the choice, when, by
 * whom (the why in the tooltip), and « Redemander ».
 * Inputs: the remembered doubts, onAskAgain. Output: the folded list,
 * nothing when none. Failure modes: none.
 */
export function RememberedDoubts({ doubts, onAskAgain }: { doubts: ImportDoubt[]; onAskAgain: (doubt: ImportDoubt) => void }) {
  if (doubts.length === 0) return null;
  return (
    <details className="sd-sec">
      <summary><b>Déjà tranchés</b> ({doubts.length}) — réappliqués sans rien demander tant que le doute reste le même</summary>
      <ul className="doubt-kept">
        {doubts.map((doubt) => (
          <li key={doubt.id} className="sd-item" title={doubt.why}>
            <Project doubt={doubt} />
            <span className="sd-move">{rememberedLine(doubt)}</span>
            <button type="button" className="btn ghost" aria-label={`Redemander : ${doubt.title}`} onClick={() => onAskAgain(doubt)}>
              Redemander
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
