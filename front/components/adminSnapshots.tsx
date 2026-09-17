// « Instantanés » (ADR 042, author 2026-09-17: « prendre un snapshot parce
// qu'on sait qu'on va faire des réimports… un garde-fou pour les personnes
// qui vont le reprendre »). Take a snapshot of the board as stored (cards,
// capacity, applied config, current year, log position); restore one after
// an explicit confirmation — one `restored` event, nothing deleted. One is
// taken automatically before each import load and each year switch.

import { useCallback, useEffect, useState } from "react";
import type { SnapshotSummary } from "../../core/snapshot.ts";
import { messageOf } from "../api.ts";
import { fetchSnapshots } from "../apiSnapshots.ts";

/** Props of the snapshots tab. */
export interface SnapshotsTabProps {
  /** Takes a snapshot; resolves null on success, the French message otherwise. */
  onTake: (label: string) => Promise<string | null>;
  /** Restores one; same contract. The panel closes on success. */
  onRestore: (id: string) => Promise<string | null>;
}

function frDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

// The stored snapshots, fetched on mount and on demand.
function useSnapshotList(): { list: SnapshotSummary[] | null; error: string | null; refresh: () => Promise<void> } {
  const [list, setList] = useState<SnapshotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(
    () => fetchSnapshots()
      .then((entries) => { setList(entries); setError(null); })
      .catch((cause: unknown) => setError(messageOf(cause))),
    [],
  );
  useEffect(() => { void refresh(); }, [refresh]);
  return { list, error, refresh };
}

// « Prendre un instantané » with its label — required: the why is the point.
function TakeForm({ busy, onTake }: { busy: boolean; onTake: (label: string) => Promise<boolean> }) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const take = () => {
    setNote(null);
    void onTake(label.trim()).then((taken) => {
      if (!taken) return;
      setLabel("");
      setNote("Instantané pris.");
    });
  };
  return (
    <div className="snap-take">
      <input className="snap-label" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)}
        placeholder="Pourquoi cet instantané (ex. avant le réimport du 20/09)" />
      <button className="btn primary" disabled={busy || label.trim() === ""} onClick={take}>Prendre un instantané</button>
      {note && <span className="m2-note">{note}</span>}
    </div>
  );
}

interface RowProps {
  entry: SnapshotSummary;
  armed: boolean;
  busy: boolean;
  onArm: (id: string | null) => void;
  onRestore: (id: string) => void;
}

// One snapshot: its label and facts; « Restaurer… » arms the explicit
// confirmation, which alone posts the restore.
function SnapshotRow({ entry, armed, busy, onArm, onRestore }: RowProps) {
  const facts = [
    frDateTime(entry.ts), `${entry.cardCount} carte(s)`, `exercice ${entry.exerciseYear}`, `journal à ${entry.logSeq}`,
    entry.hasOverride ? "config appliquée" : "modèle versionné",
  ];
  return (
    <div className={"snap-row" + (armed ? " armed" : "")}>
      <div className="snap-main">
        <b>{entry.label}</b>
        <span className="snap-meta">{facts.join(" · ")}</span>
      </div>
      {armed ? (
        <span className="snap-actions">
          <button className="btn primary" disabled={busy} onClick={() => onRestore(entry.id)}>Confirmer : revenir à cet état</button>
          <button className="btn" disabled={busy} onClick={() => onArm(null)}>Annuler</button>
        </span>
      ) : (
        <button className="btn" disabled={busy} onClick={() => onArm(entry.id)}>Restaurer…</button>
      )}
    </div>
  );
}

interface ListProps {
  list: SnapshotSummary[] | null;
  error: string | null;
  armed: string | null;
  busy: boolean;
  onArm: (id: string | null) => void;
  onRestore: (id: string) => void;
}

function SnapshotList({ list, error, armed, busy, onArm, onRestore }: ListProps) {
  if (error !== null) return <div className="snap-error">{error}</div>;
  if (list === null) return <div className="m2-note">Chargement…</div>;
  if (list.length === 0) return <div className="m2-note">Aucun instantané encore.</div>;
  return (
    <div className="snap-list">
      {list.map((entry) => (
        <SnapshotRow key={entry.id} entry={entry} armed={armed === entry.id} busy={busy} onArm={onArm} onRestore={onRestore} />
      ))}
    </div>
  );
}

/**
 * The « Instantanés » tab of the admin panel.
 * Inputs: SnapshotsTabProps. Output: the tab DOM. Failure modes: none — a
 * refused take or restore shows through the panel's error line; an
 * unreachable list shows its message in place.
 */
export function SnapshotsTab({ onTake, onRestore }: SnapshotsTabProps) {
  const { list, error, refresh } = useSnapshotList();
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const take = async (label: string): Promise<boolean> => {
    setBusy(true);
    try {
      const failure = await onTake(label);
      if (failure === null) await refresh();
      return failure === null;
    } finally {
      setBusy(false);
    }
  };
  const restore = (id: string) => {
    setBusy(true);
    void onRestore(id).finally(() => setBusy(false));
  };
  return (
    <div className="a-exercise">
      <div className="import-note">
        Un instantané fige le tableau tel qu’il est stocké : les cartes, la capacité de chaque exercice, la configuration
        appliquée et l’année en cours, avec la position du journal. Restaurer n’efface rien : un évènement de restauration
        ramène le tableau à cette position ; les gestes faits depuis restent dans le journal, annulés. Un instantané est pris
        automatiquement avant chaque chargement d’import et avant chaque bascule d’année.
      </div>
      <TakeForm busy={busy} onTake={take} />
      <SnapshotList list={list} error={error} armed={armed} busy={busy} onArm={setArmed} onRestore={restore} />
    </div>
  );
}
