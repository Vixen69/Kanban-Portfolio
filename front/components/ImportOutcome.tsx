// Everything the import pane shows under its form (ADR 027/055): the
// error, the busy note, what the load wrote beyond the report's numbers,
// the readable report (./ImportChanges.tsx), the « Doutes à trancher »
// (ADR 062, ./DoubtsSection.tsx), the domain conflicts to decide one by
// one (ADR 036, ./ImportConflicts.tsx) and the load controls — the load
// waits for a new audit when a doubt's choice changed since the report —
// then the technical report (the Markdown of the audit), folded at the
// bottom. While « Revoir le rapport avec ces choix » runs, the doubts,
// conflicts and controls of the previous audit stay mounted (disabled).

import type { BoardConfig } from "../../core/types.ts";
import type { ImportAuditResult, ImportLoadResult } from "../../core/import-types.ts";
import type { DoubtState } from "../importDoubts.ts";
import { auditedOnScreen, staleCount } from "../importDoubts.ts";
import { loadOutcomes } from "../importReport.ts";
import { DoubtsSection } from "./DoubtsSection.tsx";
import { ImportChanges } from "./ImportChanges.tsx";
import { ImportConflicts } from "./ImportConflicts.tsx";
import type { Decisions } from "./ImportConflicts.tsx";

/** Where the audit / load cycle stands. */
export type ImportPhase =
  | { kind: "idle" }
  | { kind: "busy"; what: "audit" | "preview" | "load"; previous: ImportAuditResult | null }
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

// Why « Charger » waits, or what it writes.
function loadNote(pending: number, stale: number): string {
  if (pending > 0) return `${pending} conflit(s) de domaine à trancher avant de charger.`;
  if (stale > 0) return "Des choix de doute ne sont pas encore dans le rapport : « Revoir le rapport avec ces choix » avant de charger.";
  return "Cartes et évènements en un lot ; rien n’est supprimé ; les autres exercices ne sont pas touchés.";
}

function LoadControls({ result, pending, stale, acknowledged, setAcknowledged, busy, onLoad }: {
  result: ImportAuditResult; pending: number; stale: number; acknowledged: boolean; setAcknowledged: (v: boolean) => void;
  busy: boolean; onLoad: () => void;
}) {
  if (!result.loadable) return null;
  return (
    <div className="import-actions">
      <label className="dec-opt">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
        J’ai lu le rapport
      </label>
      <button className="btn" disabled={busy || !acknowledged || pending > 0 || stale > 0} onClick={onLoad}>Charger dans le tableau {result.exercise}</button>
      <span className="m2-note">{loadNote(pending, stale)}</span>
    </div>
  );
}

const BUSY: Record<"audit" | "preview" | "load", string> = {
  audit: "Audit en cours…", preview: "Nouvel audit avec vos choix…", load: "Chargement en cours…",
};

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
  /** The answers to the « Doutes à trancher » (ADR 062). */
  doubts: DoubtState;
  setDoubts: (s: DoubtState) => void;
  /** A new audit with the answers (« Revoir le rapport avec ces choix »). */
  onPreview: () => void;
  acknowledged: boolean;
  setAcknowledged: (v: boolean) => void;
  onLoad: () => void;
}

/**
 * Everything under the import form.
 * Inputs: ImportOutcomeProps. Output: the error, the busy note, the load
 * summary, the readable report, the doubts, the conflicts and load
 * controls (after an audit only), the folded technical report. Failure
 * modes: none.
 */
export function ImportOutcome(props: ImportOutcomeProps) {
  const { phase, error, shown, config, decisions, setDecisions } = props;
  const busy = phase.kind === "busy";
  const current = auditedOnScreen(phase);
  const conflicts = current?.conflicts ?? [];
  const pending = conflicts.filter((c) => decisions[c.cardId] === undefined).length;
  const doubts = current?.doubts ?? [];
  return (
    <>
      {error !== null && <div className="import-error">{error}</div>}
      {busy && <div className="m2-note">{BUSY[phase.what]}</div>}
      {phase.kind === "loaded" && <LoadSummary result={phase.result} />}
      {shown !== null && <ImportChanges result={shown} loaded={phase.kind === "loaded"} config={config} />}
      {current !== null && (
        <DoubtsSection doubts={doubts} state={props.doubts} onChange={props.setDoubts} onPreview={props.onPreview} busy={busy}
          ignored={current.ignoredChoices?.length ?? 0} />
      )}
      {current !== null && (
        <ImportConflicts conflicts={conflicts} decisions={decisions} config={config}
          onDecide={(cardId, decision) => setDecisions({ ...decisions, [cardId]: decision })}
          onDecideAll={(decision) => setDecisions(Object.fromEntries(conflicts.map((c) => [c.cardId, decision])))} />
      )}
      {current !== null && (
        <LoadControls result={current} pending={pending} stale={staleCount(doubts, props.doubts)} acknowledged={props.acknowledged}
          setAcknowledged={props.setAcknowledged} busy={busy} onLoad={props.onLoad} />
      )}
      {shown !== null && <TechnicalReport report={shown.report} />}
    </>
  );
}
