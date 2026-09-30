// « Voir ce qui a changé depuis le dernier import » (ADR 055, author
// 2026-09-30: « une manière de voir pendant un temps qu'est-ce qui a
// changé depuis l'import »): the instantané the middle takes before every
// load (« avant chargement <année> », ADR 042) compared with the board
// now — the same comparison and sections as « Comparer avec maintenant »
// (ADR 053), whose head names the instantané and its date, so an older
// reference (a load that took none) shows. A read: nothing is written.

import { useState } from "react";
import type { BoardConfig } from "../../core/types.ts";
import { messageOf } from "../api.ts";
import { fetchSnapshotDiff, fetchSnapshots, type SnapshotDiffResult } from "../apiSnapshots.ts";
import { importSnapshotLabel, lastImportSnapshot, noImportSnapshotNote } from "../importReport.ts";
import { SnapshotDiffView } from "./SnapshotDiffView.tsx";

type Since =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "note"; text: string }
  | { kind: "shown"; result: SnapshotDiffResult };

// Finds the last load's instantané of the year, then its comparison.
async function sinceLastImport(year: number): Promise<Since> {
  const snapshot = lastImportSnapshot(await fetchSnapshots(), year);
  if (snapshot === null) return { kind: "note", text: noImportSnapshotNote(year) };
  return { kind: "shown", result: await fetchSnapshotDiff(snapshot.id) };
}

/**
 * The button and, once asked, the comparison of the board now with the
 * instantané taken before the last load of the exercise.
 * Inputs: the config (names), the exercise chosen in the import pane.
 * Output: the button, a note (searching, none found, the server's
 * refusal) or the comparison with its « Fermer » button. Failure modes:
 * none — an unreachable server shows its French message.
 */
export function ImportSince({ config, exercise }: { config: BoardConfig; exercise: number }) {
  const [since, setSince] = useState<Since>({ kind: "idle" });
  const show = () => {
    setSince({ kind: "busy" });
    sinceLastImport(exercise)
      .then(setSince)
      .catch((cause: unknown) => setSince({ kind: "note", text: messageOf(cause) }));
  };
  return (
    <div className="import-since">
      <div className="import-actions">
        <button className="btn ghost" disabled={since.kind === "busy"} onClick={show}
          title={`Compare le tableau d’aujourd’hui au dernier instantané « ${importSnapshotLabel(exercise)} » — sa date est rappelée en tête de la comparaison`}>
          Voir ce qui a changé depuis le dernier import
        </button>
        {since.kind === "busy" && <span className="m2-note">Comparaison en cours…</span>}
        {since.kind === "note" && <span className="m2-note">{since.text}</span>}
      </div>
      {since.kind === "shown" && (
        <SnapshotDiffView config={config} snapshot={since.result.snapshot} changes={since.result.changes}
          onClose={() => setSince({ kind: "idle" })} />
      )}
    </div>
  );
}
