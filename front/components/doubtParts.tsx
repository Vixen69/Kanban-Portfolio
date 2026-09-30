// The parts of the « Doutes à trancher » section (ADR 062): one row per
// doubt — the project, why it is doubtful, the choices as radio buttons
// with their consequence, the tool's choice marked, « Ne plus me demander
// pour ce projet (question) » — and one line per remembered doubt with
// why it was asked and its « Redemander ». A fieldset per doubt, its
// legend the project and the question (one project may raise several);
// every input sits inside its label; nothing hides in a tooltip.

import { useId } from "react";
import type { ImportDoubt } from "../../core/import-types.ts";
import type { DoubtAnswer } from "../importDoubts.ts";
import { askAgainLabel, rememberedLine, stickyLabel } from "../importDoubts.ts";

// The project and the question: « PE20001 Socle réseau — état ».
function Project({ doubt }: { doubt: ImportDoubt }) {
  return (
    <>
      {doubt.code !== null && <span className="sd-code">{doubt.code}</span>}
      <span className="doubt-title">{doubt.title}</span>
      <span className="doubt-subject"> — {doubt.subject}</span>
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
        {stickyLabel(doubt)}
      </label>
    </fieldset>
  );
}

// One remembered doubt: the project and the question, the choice, when,
// by whom, why it was asked (visible, and the description of its button).
function RememberedItem({ doubt, onAskAgain }: { doubt: ImportDoubt; onAskAgain: (doubt: ImportDoubt) => void }) {
  const whyId = useId();
  return (
    <li className="sd-item">
      <Project doubt={doubt} />
      <span className="sd-move">{rememberedLine(doubt)}</span>
      <button type="button" className="btn ghost" aria-label={askAgainLabel(doubt)} aria-describedby={whyId} onClick={() => onAskAgain(doubt)}>
        Redemander
      </button>
      <span className="doubt-why" id={whyId}>{doubt.why}</span>
    </li>
  );
}

/**
 * The doubts settled by a remembered choice, folded: the question, the
 * choice, when, by whom, why it was asked, and « Redemander ».
 * Inputs: the remembered doubts, onAskAgain. Output: the folded list,
 * nothing when none. Failure modes: none.
 */
export function RememberedDoubts({ doubts, onAskAgain }: { doubts: ImportDoubt[]; onAskAgain: (doubt: ImportDoubt) => void }) {
  if (doubts.length === 0) return null;
  return (
    <details className="sd-sec">
      <summary><b>Déjà tranchés</b> ({doubts.length}) — réappliqués sans rien demander tant que le doute reste le même</summary>
      <ul className="doubt-kept">
        {doubts.map((doubt) => <RememberedItem key={doubt.id} doubt={doubt} onAskAgain={onAskAgain} />)}
      </ul>
    </details>
  );
}
