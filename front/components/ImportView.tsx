// Import from the tool (ADR 027): drop the PMO's CSV files, read the audit
// report, load. The files are read in the browser and sent base64 to the
// middle, which runs the same audit and load as the CLI. Nothing is written
// before « Charger », and a load never deletes a card (absentes are marked
// — ADR 026). No authentication until RP3, like the rest of the write API.

import { useState } from "react";
import type { ImportAuditResult, ImportFilePayload, ImportLoadResult } from "../../core/import-types.ts";
import { ApiError, postImportAudit, postImportLoad } from "../api.ts";

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
// a load fails so the report stays on screen with the error.
function useImport(files: Picked[], onLoaded: () => void) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const audited = phase.kind === "audited" ? phase.result : phase.kind === "busy" ? phase.previous : null;
  const run = async (what: "audit" | "load") => {
    const payload: ImportFilePayload[] = files.map(({ name, base64 }) => ({ name, base64 }));
    setError(null);
    setPhase({ kind: "busy", what, previous: audited });
    try {
      if (what === "audit") {
        setPhase({ kind: "audited", result: await postImportAudit(payload) });
      } else {
        setPhase({ kind: "loaded", result: await postImportLoad(payload) });
        onLoaded();
      }
    } catch (cause) {
      setError(messageOf(cause));
      setPhase(audited === null ? { kind: "idle" } : { kind: "audited", result: audited });
    }
  };
  return { phase, error, audited, run, reset: () => setPhase({ kind: "idle" }) };
}

function ImportForm({ files, onPick, busy, onAudit }: {
  files: Picked[]; onPick: (list: FileList) => void; busy: boolean; onAudit: () => void;
}) {
  return (
    <div className="import-form">
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
      <b>{s.received}</b> fichier(s) reçu(s), <b>{s.recognized}</b> reconnu(s) · pris {s.taken} · écartés {s.discarded} ·
      douteux {s.doubtful} · signalements {s.warnings}
      {s.missing.length > 0 && <> · manquants : {s.missing.join(", ")}</>}
      {" · "}{result.loadable ? "périmètre assemblé — chargement possible" : "périmètre non assemblé — chargement impossible"}
    </div>
  );
}

function LoadSummary({ result }: { result: ImportLoadResult }) {
  const l = result.load;
  return (
    <div className="import-summary ok">
      Chargé : {l.created} créée(s) · {l.updated} mise(s) à jour · {l.moved} déplacée(s) · {l.unlisted} absente(s) marquée(s) ·
      {" "}{l.relisted} de retour · {l.divergences} divergence(s) conservée(s) · {l.kept} position(s) conservée(s) (sans jalon)
      {l.capacity !== null && <> · capacité : {l.capacity.persons} personne(s), {l.capacity.assignments} affectation(s)</>}
    </div>
  );
}

function LoadControls({ result, acknowledged, setAcknowledged, busy, onLoad }: {
  result: ImportAuditResult; acknowledged: boolean; setAcknowledged: (v: boolean) => void; busy: boolean; onLoad: () => void;
}) {
  if (!result.loadable) return null;
  return (
    <div className="import-actions">
      <label className="dec-opt">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
        J’ai lu le rapport
      </label>
      <button className="btn" disabled={busy || !acknowledged} onClick={onLoad}>Charger dans le tableau</button>
      <span className="m2-note">Cartes et évènements en un lot ; rien n’est supprimé.</span>
    </div>
  );
}

// Everything under the form: the error, the busy note, the load and audit
// summaries, the load controls and the report itself.
function Outcome({ phase, error, shown, acknowledged, setAcknowledged, onLoad }: {
  phase: Phase; error: string | null; shown: ImportAuditResult | null;
  acknowledged: boolean; setAcknowledged: (v: boolean) => void; onLoad: () => void;
}) {
  const busy = phase.kind === "busy";
  return (
    <>
      {error !== null && <div className="import-error">{error}</div>}
      {busy && <div className="m2-note">{phase.what === "audit" ? "Audit en cours…" : "Chargement en cours…"}</div>}
      {phase.kind === "loaded" && <LoadSummary result={phase.result} />}
      {shown !== null && <Summary result={shown} />}
      {phase.kind === "audited" && (
        <LoadControls result={phase.result} acknowledged={acknowledged} setAcknowledged={setAcknowledged} busy={busy} onLoad={onLoad} />
      )}
      {shown !== null && <pre className="import-report">{shown.report}</pre>}
    </>
  );
}

/**
 * The import overlay (header ⬆).
 * Inputs: the close callback, and onLoaded (the board refetches after a
 * load). Output: the modal DOM. Failure modes: none — API refusals (400
 * files, 500) show their French message and keep the form.
 */
export function ImportView({ onClose, onLoaded }: { onClose: () => void; onLoaded: () => void }) {
  const [files, setFiles] = useState<Picked[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const { phase, error, audited, run, reset } = useImport(files, onLoaded);
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
            Déposer les CSV du classeur (PARAM, Projets, ProjetsCdP, ProjetsJalons, SP, Ressources_PdC — reconnus par
            leurs en-têtes, pas par leur nom ; Ress.Profils facultatif). L’audit ne modifie rien ; le chargement n’efface jamais une carte.
          </div>
          <ImportForm files={files} busy={phase.kind === "busy"}
            onPick={(list) => { void readFiles(list).then((picked) => { setFiles(picked); reset(); }); }}
            onAudit={() => { setAcknowledged(false); void run("audit"); }} />
          <Outcome phase={phase} error={error} shown={shown} acknowledged={acknowledged}
            setAcknowledged={setAcknowledged} onLoad={() => void run("load")} />
        </div>
      </div>
    </div>
  );
}
