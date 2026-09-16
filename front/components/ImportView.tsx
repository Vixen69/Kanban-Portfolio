// Import from the tool (ADR 027): drop the PMO's CSV files, read the audit
// report, load. The files are read in the browser and sent base64 to the
// middle, which runs the same audit and load as the CLI. Nothing is written
// before « Charger », and a load never deletes a card (absentes are marked
// — ADR 026). The import targets ONE exercise (ADR 035): the current year
// by default, or a year in preparation; it never touches another year's
// cards. The audit's domain conflicts are decided one by one before the
// load (ADR 036, ./ImportConflicts.tsx). No authentication until RP3.

import { useState } from "react";
import type { BoardConfig } from "../../core/types.ts";
import type { ImportAuditResult, ImportFilePayload, ImportLoadResult } from "../../core/import-types.ts";

import { ApiError, postImportAudit, postImportLoad } from "../api.ts";
import { ImportConflicts } from "./ImportConflicts.tsx";
import type { Decisions } from "./ImportConflicts.tsx";

interface Picked {
  name: string;
  size: number;
  base64: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "busy"; what: "audit" | "load"; previous: ImportAuditResult | null }
  | { kind: "audited"; result: ImportAuditResult }
  | { kind: "loaded"; result: ImportLoadResult };

const CHUNK = 0x8000;
/** Years offered by the selector: the current exercise and the next two. */
const YEARS_AHEAD = 2;

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += CHUNK) binary += String.fromCharCode(...view.subarray(i, i + CHUNK));
  return btoa(binary);
}

async function readFiles(list: FileList): Promise<Picked[]> {
  const picked: Picked[] = [];
  for (const file of Array.from(list)) {
    picked.push({ name: file.name, size: file.size, base64: toBase64(await file.arrayBuffer()) });
  }
  return picked;
}

function fmtSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function messageOf(cause: unknown): string {
  return cause instanceof ApiError || cause instanceof Error ? cause.message : "Erreur inconnue.";
}

// The audit / load cycle: one request at a time, the last audit kept when
// a load fails so the report stays on screen with the error. The domain
// decisions travel with the load and are wiped by every new audit.
function useImport(files: Picked[], exercise: number, onLoaded: () => void) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({});
  const audited = phase.kind === "audited" ? phase.result : phase.kind === "busy" ? phase.previous : null;
  const run = async (what: "audit" | "load") => {
    const payload: ImportFilePayload[] = files.map(({ name, base64 }) => ({ name, base64 }));
    setError(null);
    setPhase({ kind: "busy", what, previous: audited });
    try {
      if (what === "audit") {
        setDecisions({});
        setPhase({ kind: "audited", result: await postImportAudit(payload, exercise) });
      } else {
        setPhase({ kind: "loaded", result: await postImportLoad(payload, exercise, decisions) });
        onLoaded();
      }
    } catch (cause) {
      setError(messageOf(cause));
      setPhase(audited === null ? { kind: "idle" } : { kind: "audited", result: audited });
    }
  };
  const reset = () => { setPhase({ kind: "idle" }); setDecisions({}); };
  return { phase, error, audited, decisions, setDecisions, run, reset };
}

function ExerciseSelect({ exercise, currentYear, onChange }: {
  exercise: number; currentYear: number; onChange: (year: number) => void;
}) {
  const span = Math.max(YEARS_AHEAD, exercise - currentYear);
  const years = Array.from({ length: span + 1 }, (_, i) => currentYear + i);
  return (
    <label className="import-row">
      <span className="field-label">Exercice</span>
      <select className="inp" value={exercise} onChange={(e) => onChange(Number(e.target.value))}>
        {years.map((year) => (
          <option key={year} value={year}>{year}{year === currentYear ? " — en cours" : " — en préparation"}</option>
        ))}
      </select>
    </label>
  );
}

function ImportForm({ files, onPick, busy, onAudit, exercise, currentYear, onYear }: {
  files: Picked[]; onPick: (list: FileList) => void; busy: boolean; onAudit: () => void;
  exercise: number; currentYear: number; onYear: (year: number) => void;
}) {
  return (
    <div className="import-form">
      <ExerciseSelect exercise={exercise} currentYear={currentYear} onChange={onYear} />
      <label className="import-row">
        <span className="field-label">Fichiers CSV du classeur</span>
        <input className="inp" type="file" multiple accept=".csv,text/csv" onChange={(e) => { if (e.target.files) onPick(e.target.files); }} />
      </label>
      {files.length > 0 && (
        <ul className="import-files">
          {files.map((file) => <li key={file.name}>{file.name} <small>{fmtSize(file.size)}</small></li>)}
        </ul>
      )}
      <div className="import-actions">
        <button className="btn" disabled={busy || files.length === 0} onClick={onAudit}>Auditer</button>
        <span className="m2-note">L’audit ne modifie rien : il produit le rapport ci-dessous.</span>
      </div>
    </div>
  );
}

function Summary({ result }: { result: ImportAuditResult }) {
  const s = result.summary;
  return (
    <div className="import-summary">
      Exercice <b>{result.exercise}</b> · <b>{s.received}</b> fichier(s) reçu(s), <b>{s.recognized}</b> reconnu(s) · pris {s.taken} ·
      écartés {s.discarded} · douteux {s.doubtful} · signalements {s.warnings}
      {s.missing.length > 0 && <> · manquants : {s.missing.join(", ")}</>}
      {" · "}{result.loadable ? "périmètre assemblé — chargement possible" : "périmètre non assemblé — chargement impossible"}
    </div>
  );
}

function LoadSummary({ result }: { result: ImportLoadResult }) {
  const l = result.load;
  return (
    <div className="import-summary ok">
      Chargé dans l’exercice {result.exercise} : {l.created} créée(s) · {l.updated} mise(s) à jour · {l.moved} déplacée(s) ·
      {" "}{l.unlisted} absente(s) marquée(s) · {l.relisted} de retour · {l.divergences} divergence(s) conservée(s) ·
      {" "}{l.kept} position(s) conservée(s) (sans jalon) · domaines : {l.domainReplaced} remplacé(s), {l.domainKept} gardé(s)
      {l.domainKeptByPrior > 0 && <>, {l.domainKeptByPrior} déjà tranché(s)</>}
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

// Everything under the form: the error, the busy note, the load and audit
// summaries, the conflicts to decide, the load controls and the report.
function Outcome({ phase, error, shown, config, decisions, setDecisions, acknowledged, setAcknowledged, onLoad }: {
  phase: Phase; error: string | null; shown: ImportAuditResult | null; config: BoardConfig;
  decisions: Decisions; setDecisions: (d: Decisions) => void;
  acknowledged: boolean; setAcknowledged: (v: boolean) => void; onLoad: () => void;
}) {
  const busy = phase.kind === "busy";
  const conflicts = phase.kind === "audited" ? phase.result.conflicts : [];
  const pending = conflicts.filter((c) => decisions[c.cardId] === undefined).length;
  return (
    <>
      {error !== null && <div className="import-error">{error}</div>}
      {busy && <div className="m2-note">{phase.what === "audit" ? "Audit en cours…" : "Chargement en cours…"}</div>}
      {phase.kind === "loaded" && <LoadSummary result={phase.result} />}
      {shown !== null && <Summary result={shown} />}
      {phase.kind === "audited" && (
        <ImportConflicts conflicts={conflicts} decisions={decisions} config={config}
          onDecide={(cardId, decision) => setDecisions({ ...decisions, [cardId]: decision })}
          onDecideAll={(decision) => setDecisions(Object.fromEntries(conflicts.map((c) => [c.cardId, decision])))} />
      )}
      {phase.kind === "audited" && (
        <LoadControls result={phase.result} pending={pending} acknowledged={acknowledged} setAcknowledged={setAcknowledged}
          busy={busy} onLoad={onLoad} />
      )}
      {shown !== null && <pre className="import-report">{shown.report}</pre>}
    </>
  );
}

/**
 * The import overlay (header ⬆).
 * Inputs: the close callback, onLoaded (the board refetches after a load),
 * the runtime config (the current exercise, the domain labels). Output:
 * the modal DOM. Failure modes: none — API refusals (400 files, wrong-year
 * files, closed year, undecided conflict, 500) show their French message
 * and keep the form.
 */
export function ImportView({ onClose, onLoaded, config, defaultYear }: {
  onClose: () => void; onLoaded: () => void; config: BoardConfig;
  /** The exercise the header shows: preselected when it is not closed (ADR 035). */
  defaultYear?: number;
}) {
  const currentYear = config.exercise.year;
  const [files, setFiles] = useState<Picked[]>([]);
  const [exercise, setExercise] = useState(defaultYear !== undefined && defaultYear >= currentYear ? defaultYear : currentYear);
  const [acknowledged, setAcknowledged] = useState(false);
  const { phase, error, audited, decisions, setDecisions, run, reset } = useImport(files, exercise, onLoaded);
  const shown = phase.kind === "loaded" ? phase.result : audited;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={(event) => event.stopPropagation()}>
        <span className="modal-bar" style={{ background: "#0f766e" }} />
        <div className="modal-body">
          <div className="modal-top">
            <h2 className="modal-name">Importer un export PPM</h2>
            <button className="btn ghost" onClick={onClose}>Fermer ✕</button>
          </div>
          <div className="import-note">
            Déposer les CSV (Coût — l’export COUT PREV, le périmètre —, PARAM, Projets, ProjetsCdP, ProjetsJalons, SP,
            Ressources_PdC — reconnus par leurs en-têtes, pas par leur nom ; Ress.Profils facultatif). L’audit ne modifie
            rien ; le chargement n’efface jamais une carte. L’import ne touche que l’exercice choisi : un import 2027
            ne lit ni n’écrit une carte 2026 ; un même code PE y est une autre carte, avec son budget. Le domaine d’une
            carte déjà là n’est jamais remplacé sans votre décision, conflit par conflit.
          </div>
          <ImportForm files={files} busy={phase.kind === "busy"} exercise={exercise} currentYear={currentYear}
            onYear={(year) => { setExercise(year); reset(); }}
            onPick={(list) => { void readFiles(list).then((picked) => { setFiles(picked); reset(); }); }}
            onAudit={() => { setAcknowledged(false); void run("audit"); }} />
          <Outcome phase={phase} error={error} shown={shown} config={config} decisions={decisions} setDecisions={setDecisions}
            acknowledged={acknowledged} setAcknowledged={setAcknowledged} onLoad={() => void run("load")} />
        </div>
      </div>
    </div>
  );
}
