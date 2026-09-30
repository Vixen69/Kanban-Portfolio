// Everything the import pane shows under its form (ADR 027/055): the
// error, the busy note, what the load wrote beyond the report's numbers,
// the readable report (./ImportChanges.tsx), the domain conflicts to
// decide one by one (ADR 036, ./ImportConflicts.tsx) and the load
// controls — unchanged in behaviour — then the technical report (the
// Markdown of the audit), folded at the bottom.

import type { BoardConfig } from "../../core/types.ts";
import type { ImportAuditResult, ImportLoadResult } from "../../core/import-types.ts";
import { loadOutcomes } from "../importReport.ts";
import { ImportChanges } from "./ImportChanges.tsx";
import { ImportConflicts } from "./ImportConflicts.tsx";
import type { Decisions } from "./ImportConflicts.tsx";

/** Where the audit / load cycle stands. */
export type ImportPhase =
  | { kind: "idle" }
  | { kind: "busy"; what: "audit" | "load"; previous: ImportAuditResult | null }
  | { kind: "audited"; result: ImportAuditResult }
  | { kind: "loaded"; result: ImportLoadResult };

// What the load wrote that the key numbers do not say: the placements and
// domains left alone, the domain decisions, the hand corrections and
// placements the export's new information replaced, the adoptions, the
// deleted cards ignored (ADR 058/059/060), the capacity stored.
function LoadSummary({ result }: { result: ImportLoadResult }) {
  const l = result.load;
  const outcomes = loadOutcomes(l);
  return (
    <div className="import-summary ok">
      Chargé dans l’exercice {result.exercise} (cartes et évènements en un lot) · {l.divergences} divergence(s) conservée(s) ·
      {" "}{l.kept} position(s) conservée(s) (sans jalon) · domaines : {l.domainReplaced} remplacé(s), {l.domainKept} gardé(s)
      {l.domainKeptByPrior > 0 && <>, {l.domainKeptByPrior} déjà tranché(s)</>}
      {outcomes.length > 0 && <> · {outcomes.join(" · ")}</>}
      {l.capacity !== null && <> · capacité : {l.capacity.persons} personne(s), {l.capacity.assignments} affectation(s)</>}
    </div>
  );
}

function LoadControls({ result, pending, acknowledged, setAcknowledged, busy, onLoad }: {
  result: ImportAuditResult; pending: number; acknowledged: boolean; setAcknowledged: (v: boolean) => void;
  busy: boolean; onLoad: () => void;
}) {
  if (!result.loadable) return null;
  return (
    <div className="import-actions">
      <label className="dec-opt">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
        J’ai lu le rapport
      </label>
      <button className="btn" disabled={busy || !acknowledged || pending > 0} onClick={onLoad}>Charger dans le tableau {result.exercise}</button>
      <span className="m2-note">
        {pending > 0 ? `${pending} conflit(s) de domaine à trancher avant de charger.` : "Cartes et évènements en un lot ; rien n’est supprimé ; les autres exercices ne sont pas touchés."}
      </span>
    </div>
  );
}

// The Markdown report of the audit, kept whole for the details — folded.
function TechnicalReport({ report }: { report: string }) {
  return (
    <details className="import-tech">
      <summary>Rapport technique complet</summary>
      <pre className="import-report">{report}</pre>
    </details>
  );
}

/** Props of the pane's outcome. */
export interface ImportOutcomeProps {
  phase: ImportPhase;
  error: string | null;
  /** The result on screen: the load's, else the last audit's (kept while a new request runs). */
  shown: ImportAuditResult | null;
  config: BoardConfig;
  decisions: Decisions;
  setDecisions: (d: Decisions) => void;
  acknowledged: boolean;
  setAcknowledged: (v: boolean) => void;
  onLoad: () => void;
}

/**
 * Everything under the import form.
 * Inputs: ImportOutcomeProps. Output: the error, the busy note, the load
 * summary, the readable report, the conflicts and load controls (after an
 * audit only), the folded technical report. Failure modes: none.
 */
export function ImportOutcome(props: ImportOutcomeProps) {
  const { phase, error, shown, config, decisions, setDecisions } = props;
  const busy = phase.kind === "busy";
  const conflicts = phase.kind === "audited" ? phase.result.conflicts : [];
  const pending = conflicts.filter((c) => decisions[c.cardId] === undefined).length;
  return (
    <>
      {error !== null && <div className="import-error">{error}</div>}
      {busy && <div className="m2-note">{phase.what === "audit" ? "Audit en cours…" : "Chargement en cours…"}</div>}
      {phase.kind === "loaded" && <LoadSummary result={phase.result} />}
      {shown !== null && <ImportChanges result={shown} loaded={phase.kind === "loaded"} config={config} />}
      {phase.kind === "audited" && (
        <ImportConflicts conflicts={conflicts} decisions={decisions} config={config}
          onDecide={(cardId, decision) => setDecisions({ ...decisions, [cardId]: decision })}
          onDecideAll={(decision) => setDecisions(Object.fromEntries(conflicts.map((c) => [c.cardId, decision])))} />
      )}
      {phase.kind === "audited" && (
        <LoadControls result={phase.result} pending={pending} acknowledged={props.acknowledged}
          setAcknowledged={props.setAcknowledged} busy={busy} onLoad={props.onLoad} />
      )}
      {shown !== null && <TechnicalReport report={shown.report} />}
    </>
  );
}
