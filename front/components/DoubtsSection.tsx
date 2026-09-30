// « Doutes à trancher » (ADR 062, author 2026-09-30: « me dire pourquoi
// c'est douteux, est-ce qu'on le prend, est-ce qu'on le prend pas »): in
// the import pane, after the readable report and before the domain
// conflicts and « Charger ». One row per decidable doubt, grouped by kind,
// the tool's choice pre-selected — never blocking: loading without
// touching anything applies the tool's choices. « Ne plus me demander pour
// ce projet » keeps the choice for later imports while the doubt is the
// same; without it the question comes back at the next import. The
// remembered choices are listed folded, each with « Redemander ». A choice
// changed since the report was made asks for a new audit « avec ces
// choix » before the load, so that what is read is what is loaded.
// Nothing is written before « Charger »; each answer is then traced in the
// log.

import type { ImportDoubt } from "../../core/import-types.ts";
import type { DoubtState } from "../importDoubts.ts";
import { answerOf, doubtsHeader, groupDoubts, splitDoubts, staleCount, withAnswer, withForgotten } from "../importDoubts.ts";
import { listOpen } from "../importReport.ts";
import { DoubtRow, RememberedDoubts } from "./doubtParts.tsx";

function Groups({ open, state, onChange }: { open: ImportDoubt[]; state: DoubtState; onChange: (state: DoubtState) => void }) {
  return (
    <>
      {groupDoubts(open).map((group) => (
        <details key={group.kind} className="sd-sec" open={listOpen(group.doubts.length)}>
          <summary><b>{group.title}</b> · {group.doubts.length}</summary>
          {group.doubts.map((doubt) => (
            <DoubtRow key={doubt.id} doubt={doubt} answer={answerOf(doubt, state)}
              onAnswer={(answer) => onChange(withAnswer(state, doubt.id, answer))} />
          ))}
        </details>
      ))}
    </>
  );
}

// Whether the report above follows the answers; else the new audit that makes it so.
function PreviewLine({ stale, busy, onPreview }: { stale: number; busy: boolean; onPreview: () => void }) {
  if (stale === 0) return <div className="m2-note">Le rapport ci-dessus suit ces choix.</div>;
  return (
    <div className="import-actions">
      <span className="chg-line warn">{stale} choix pas encore dans le rapport ci-dessus.</span>
      <button type="button" className="btn" disabled={busy} onClick={onPreview}>Revoir le rapport avec ces choix</button>
    </div>
  );
}

/**
 * The « Doutes à trancher » section of an audit.
 * Inputs: the audit's doubts (absent from a middle older than ADR 062),
 * the answers so far, onChange (the new answers), onPreview (a new audit
 * with the answers), busy. Output: nothing when the audit raised no
 * doubt; else the header line, the rows by kind, the remembered ones
 * folded, the report's state. Failure modes: none.
 */
export function DoubtsSection({ doubts, state, onChange, onPreview, busy }: {
  doubts: readonly ImportDoubt[]; state: DoubtState; onChange: (state: DoubtState) => void; onPreview: () => void; busy: boolean;
}) {
  if (doubts.length === 0) return null;
  const { open, remembered } = splitDoubts(doubts, state);
  return (
    <section className="doubts" aria-label="Doutes à trancher">
      <h3 className="chg-h">Doutes à trancher</h3>
      <div className="doubts-head">{doubtsHeader(open.length)}</div>
      <div className="m2-note">
        Jamais bloquant : sans rien toucher, le chargement applique les choix de l’outil. Un choix vaut pour ce chargement,
        et la question reviendra au prochain import ; « Ne plus me demander pour ce projet » le garde tant que le doute
        reste le même. Chaque réponse est tracée dans le journal au chargement.
      </div>
      <Groups open={open} state={state} onChange={onChange} />
      <RememberedDoubts doubts={remembered} onAskAgain={(doubt) => onChange(withForgotten(state, doubt))} />
      <PreviewLine stale={staleCount(doubts, state)} busy={busy} onPreview={onPreview} />
    </section>
  );
}
