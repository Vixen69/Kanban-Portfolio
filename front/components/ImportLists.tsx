// The project lists of the readable import report (ADR 055): who enters
// the board and why (with the « domaine par défaut » warning when nothing
// resolved the domain), who is absent from this import and why, who comes
// back; then the facts the files left blank, fact by fact, each with the
// cards that kept their value (ADR 054). Also what the hand did and the
// load met: the hand corrections the export's NEW value replaces and the
// hand placements a new jalon overtook (ADR 060), the hand-made cards
// adopted (ADR 059), the cards deleted on the board that the files still
// carry (ADR 058), the identity doubts. Short lists unfold, long ones stay
// folded behind their count (../importReport.ts).

import type { BoardConfig } from "../../core/types.ts";
import type { ImportCardRef, ImportChanges, ImportKeptFact } from "../../core/import-types.ts";
import { capitalized } from "../changeGroups.ts";
import { adoptedReason, advancedReason, listOpen } from "../importReport.ts";

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
// warn: a list the PMO must not miss — its title in the warning tone.
function RefList({ title, rows, warn = false }: { title: string; rows: Row[]; warn?: boolean }) {
  if (rows.length === 0) return null;
  const warned = rows.filter((row) => row.warning !== null).length;
  return (
    <details className={"sd-sec" + (warn ? " warn" : "")} open={listOpen(rows.length)}>
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

const plain = (ref: ImportCardRef): Row => ({ ref, reason: null, warning: null });

/**
 * The hand corrections the export's NEW value replaced (ADR 060), fact by
 * fact with the cards — the only values a load overwrites, shown next to
 * the refreshed values in the warning tone.
 * Inputs: the replaced facts, whether the load ran. Output: the lists,
 * nothing when none. Failure modes: none.
 */
export function ReplacedLists({ replaced, loaded }: { replaced: ImportKeptFact[]; loaded: boolean }) {
  if (replaced.length === 0) return null;
  return (
    <>
      <h3 className="chg-h">Corrections manuelles remplacées par la nouvelle valeur de l’export</h3>
      <div className="chg-line warn">
        L’export apporte une valeur qu’il ne donnait pas au dernier import : elle {loaded ? "a remplacé" : "remplacera"} la
        correction faite à la main. Les autres corrections à la main restent.
      </div>
      {replaced.map((fact) => <RefList key={fact.label} warn title={capitalized(fact.label)} rows={fact.cards.map(plain)} />)}
    </>
  );
}

/**
 * What the load met on the board beyond the refreshed values: hand
 * placements a new jalon overtook (from → to, ADR 060), hand-made cards
 * adopted by their code or name (ADR 059), cards deleted on the board
 * that the files still carry — ignored, never re-created (ADR 058) — and
 * the identity doubts the load could not settle alone, always unfolded.
 * Inputs: the report's changes, the config (column names). Output: the
 * non-empty lists, nothing when all are empty. Failure modes: none.
 */
export function HandLists({ changes, config }: { changes: ImportChanges; config: BoardConfig }) {
  const { advanced, adopted, deletedSkipped, identityDoubts } = changes;
  if (advanced.length + adopted.length + deletedSkipped.length + identityDoubts.length === 0) return null;
  return (
    <>
      <h3 className="chg-h">Gestes faits à la main, rencontrés par l’import</h3>
      {identityDoubts.length > 0 && (
        <details className="sd-sec warn" open>
          <summary><b>Doutes d’identité</b> · {identityDoubts.length}</summary>
          <ul>{identityDoubts.map((doubt, i) => <li key={i} className="sd-item chg-warn">{doubt}</li>)}</ul>
        </details>
      )}
      <RefList title="Placements à la main dépassés par un nouveau jalon"
        rows={advanced.map((entry) => ({ ref: entry, reason: advancedReason(config, entry), warning: null }))} />
      <RefList title="Cartes saisies à la main adoptées par l’export"
        rows={adopted.map((entry) => ({ ref: entry, reason: adoptedReason(entry), warning: null }))} />
      <RefList title="Supprimées du tableau, ignorées par l’import" rows={deletedSkipped.map(plain)} />
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
        <RefList key={fact.label} title={capitalized(fact.label)} rows={fact.cards.map(plain)} />
      ))}
    </>
  );
}
