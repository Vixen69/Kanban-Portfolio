// « Comparer avec maintenant » (ADR 053, author 2026-09-30: « je tire les
// mêmes fichiers… mais ça bouge à chaque fois un petit peu ; j'ai vraiment
// la pétoche »): what changed on the board since an instantané, card by
// card — new projects, absent from the import, gone, back, and since ADR
// 055 the refreshed values (plan de charge, figures, chef de projet, date
// RDR) before type, title, domain, moves and archiving. The sections are
// the import report's (./ChangeSections.tsx). A read of the server's
// comparison; nothing is written. Restoring stays the « Restaurer… »
// button's job.

import type { BoardConfig } from "../../core/types.ts";
import type { CardChange } from "../../core/snapshot-diff.ts";
import type { SnapshotSummary } from "../../core/snapshot.ts";
import { ChangeSections } from "./ChangeSections.tsx";

/**
 * The comparison of one snapshot with the board now.
 * Inputs: the config (names), the snapshot, its changes, the close
 * callback. Output: the sections that hold changes, each with its count,
 * or a « rien n'a changé » line. Failure modes: none.
 */
export function SnapshotDiffView({ config, snapshot, changes, onClose }: {
  config: BoardConfig; snapshot: SnapshotSummary; changes: CardChange[]; onClose: () => void;
}) {
  return (
    <div className="sd">
      <div className="sd-head">
        <b>Depuis « {snapshot.label} »</b>
        <span className="snap-meta">{new Date(snapshot.ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · {changes.length} changement(s)</span>
        <span className="card-fill" />
        <button className="btn ghost" onClick={onClose}>Fermer la comparaison</button>
      </div>
      <ChangeSections config={config} changes={changes} scope="all" empty="Rien n’a changé sur le tableau depuis cet instantané." />
    </div>
  );
}
