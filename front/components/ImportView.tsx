// Import from the tool (ADR 027): drop the PMO's CSV files, read the audit
// report, load. The files are read in the browser and sent base64 to the
// middle, which runs the same audit and load as the CLI. Nothing is written
// before « Charger », and a load never deletes a card (absentes are marked
// — ADR 026). The import targets ONE exercise (ADR 035): the current year
// by default, or a year in preparation; it never touches another year's
// cards. The audit's domain conflicts are decided one by one before the
// load (ADR 036, ./ImportConflicts.tsx). No authentication until RP3.
// The report reads as the PMO reads an import (ADR 055,
// ./ImportOutcome.tsx): what the load changes, which files it took, who
// enters or leaves and why; « Voir ce qui a changé depuis le dernier
// import » compares the board with the instantané of the last load.

import { useState } from "react";
import type { BoardConfig } from "../../core/types.ts";
import type { ImportFilePayload } from "../../core/import-types.ts";

import { ApiError, postImportAudit, postImportLoad } from "../api.ts";
import type { Decisions } from "./ImportConflicts.tsx";
import { ImportOutcome, type ImportPhase as Phase } from "./ImportOutcome.tsx";
import { ImportSince } from "./ImportSince.tsx";

interface Picked {
  name: string;
  size: number;
  base64: string;
}

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

/**
 * The import pane — ⚙ › Importer un export PPM (ADR 046/049; the admin
 * shell shows it alone, without the configuration's tabs).
 * Inputs: onLoaded (the board refetches after a load), the runtime config
 * (the current exercise, the domain labels), the exercise shown. Output:
 * the pane DOM. Failure modes: none — API refusals (400 files, wrong-year
 * files, closed year, undecided conflict, 500) show their French message
 * and keep the form.
 */
export function ImportPanel({ onLoaded, config, defaultYear }: {
  onLoaded: () => void; config: BoardConfig;
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
    <div className="import-pane">
      <div className="import-note">
        Déposer les CSV (Coût — l’export COUT PREV, le périmètre —, PARAM, Projets, ProjetsCdP, ProjetsJalons, SP,
        Ressources_PdC — reconnus par leurs en-têtes, pas par leur nom ; Ress.Profils facultatif). L’audit ne modifie
        rien ; le chargement n’efface jamais une carte. L’import ne touche que l’exercice choisi : un import 2027
        ne lit ni n’écrit une carte 2026 ; un même code PE y est une autre carte, avec son budget. Le domaine d’une
        carte déjà là n’est jamais remplacé sans votre décision, conflit par conflit.
      </div>
      <ImportSince key={`${exercise}:${phase.kind === "loaded" ? "chargé" : ""}`} config={config} exercise={exercise} />
      <ImportForm files={files} busy={phase.kind === "busy"} exercise={exercise} currentYear={currentYear}
        onYear={(year) => { setExercise(year); reset(); }}
        onPick={(list) => { void readFiles(list).then((picked) => { setFiles(picked); reset(); }); }}
        onAudit={() => { setAcknowledged(false); void run("audit"); }} />
      <ImportOutcome phase={phase} error={error} shown={shown} config={config} decisions={decisions} setDecisions={setDecisions}
        acknowledged={acknowledged} setAcknowledged={setAcknowledged} onLoad={() => void run("load")} />
    </div>
  );
}
