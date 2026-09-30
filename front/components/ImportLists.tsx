// The project lists of the readable import report (ADR 055): who enters
// the board and why (with the « domaine par défaut » warning when nothing
// resolved the domain), who is absent from this import and why, who comes
// back; then the facts the files left blank, fact by fact, each with the
// cards that kept their value (ADR 054). Short lists unfold, long ones
// stay folded behind their count (../importReport.ts).

import type { ImportCardRef, ImportChanges, ImportKeptFact } from "../../core/import-types.ts";
import { capitalized } from "../changeGroups.ts";
import { listOpen } from "../importReport.ts";

interface Row {
  ref: ImportCardRef;
  reason: string | null;
  warning: string | null;
}

function RefItem({ row }: { row: Row }) {
  return (
    <li className="sd-item">
      {row.ref.code !== null && <span className="sd-code">{row.ref.code}</span>}
      <span className="sd-title">{row.ref.title}</span>
      {row.reason !== null && <span className="sd-move">{row.reason}</span>}
      {row.warning !== null && <span className="chg-warn">⚠ {row.warning}</span>}
    </li>
  );
}

// One folding list with its count; the warnings counted in the summary.
function RefList({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  const warned = rows.filter((row) => row.warning !== null).length;
  return (
    <details className="sd-sec" open={listOpen(rows.length)}>
      <summary>
        <b>{title}</b> · {rows.length}
        {warned > 0 && <span className="chg-warn"> · {warned} domaine(s) par défaut, à corriger</span>}
      </summary>
      <ul>{rows.map((row) => <RefItem key={row.ref.cardId} row={row} />)}</ul>
    </details>
  );
}

/**
 * The projects that enter, are absent from this import (∅, never deleted)
 * or come back, each with its reason.
 * Input: the report's changes. Output: the non-empty lists, nothing when
 * all three are empty. Failure modes: none.
 */
export function PresenceLists({ changes }: { changes: ImportChanges }) {
  const { entered, left, back } = changes;
  if (entered.length + left.length + back.length === 0) return null;
  return (
    <>
      <h3 className="chg-h">Projets qui entrent, sortent ou reviennent</h3>
      <RefList title="Nouveaux projets" rows={entered.map((ref) => ({ ref, reason: ref.reason, warning: ref.domainWarning }))} />
      <RefList title="Absents de cet import (gardés, marqués ∅)" rows={left.map((ref) => ({ ref, reason: ref.reason, warning: null }))} />
      <RefList title="De retour" rows={back.map((ref) => ({ ref, reason: ref.reason, warning: null }))} />
    </>
  );
}

/**
 * The facts the files left blank on cards already on the board, fact by
 * fact with the cards: the stored value stands (ADR 054).
 * Inputs: the kept facts, whether the load ran (« seront » / « ont été »).
 * Output: the lists, nothing when no fact was missing. Failure modes: none.
 */
export function KeptLists({ kept, loaded }: { kept: ImportKeptFact[]; loaded: boolean }) {
  if (kept.length === 0) return null;
  return (
    <>
      <h3 className="chg-h">Gardées, absentes des fichiers</h3>
      <div className="chg-line">
        Les fichiers ne disent rien de ces valeurs : celles du tableau {loaded ? "ont été gardées" : "seront gardées"}, jamais effacées.
      </div>
      {kept.map((fact) => (
        <RefList key={fact.label} title={capitalized(fact.label)} rows={fact.cards.map((ref) => ({ ref, reason: null, warning: null }))} />
      ))}
    </>
  );
}
