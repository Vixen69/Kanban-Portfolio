// « Comparer avec maintenant » (ADR 053, author 2026-09-30: « je tire les
// mêmes fichiers… mais ça bouge à chaque fois un petit peu ; j'ai vraiment
// la pétoche »): what changed on the board since an instantané, card by
// card — new projects, absent from the import, gone, back, moved, domain,
// type, title, archived. A read of the server's comparison; nothing is
// written. Restoring stays the « Restaurer… » button's job.

import type { BoardConfig } from "../../core/types.ts";
import type { CardChange, ChangeKind } from "../../core/snapshot-diff.ts";
import type { SnapshotSummary } from "../../core/snapshot.ts";

const SECTIONS: Array<[ChangeKind, string]> = [
  ["added", "Nouveaux projets"],
  ["absent", "Absents du dernier import (gardés, marqués ∅)"],
  ["removed", "Disparus du tableau"],
  ["back", "De retour dans l’import"],
  ["moved", "Déplacés"],
  ["domain", "Domaine changé"],
  ["type", "Type changé"],
  ["title", "Titre changé"],
  ["archived", "Archivés"],
  ["unarchived", "Désarchivés"],
];

// Ids into the config's words: « Actifs · Projets », a domain, a type.
function words(config: BoardConfig, kind: ChangeKind, value: string | null): string {
  if (value === null) return "—";
  if (kind === "domain") return config.domains.find((d) => d.id === value)?.name ?? value;
  if (kind === "type") return config.types.find((t) => t.id === value)?.name ?? value;
  if (kind !== "moved") return value;
  const [columnId, laneId] = value.split("|");
  const column = config.columns.find((c) => c.id === columnId)?.name ?? columnId ?? "?";
  return laneId === undefined ? column : `${column} · ${config.lanes.find((l) => l.id === laneId)?.name ?? laneId}`;
}

function Item({ change, config }: { change: CardChange; config: BoardConfig }) {
  const both = change.from !== null || change.to !== null;
  return (
    <li className="sd-item">
      {change.codename !== null && <span className="sd-code">{change.codename}</span>}
      <span className="sd-title">{change.title}</span>
      {change.exercise !== null && <span className="sd-year">{change.exercise}</span>}
      {both && <span className="sd-move">{words(config, change.kind, change.from)} → <b>{words(config, change.kind, change.to)}</b></span>}
    </li>
  );
}

/**
 * The comparison of one snapshot with the board now.
 * Inputs: the config (names), the snapshot, its changes, the close
 * callback. Output: the sections that hold changes, each with its count,
 * or a « rien n'a changé » line. Failure modes: none.
 */
export function SnapshotDiffView({ config, snapshot, changes, onClose }: {
  config: BoardConfig; snapshot: SnapshotSummary; changes: CardChange[]; onClose: () => void;
}) {
  const sections = SECTIONS.map(([kind, label]) => ({ kind, label, items: changes.filter((c) => c.kind === kind) })).filter((s) => s.items.length > 0);
  return (
    <div className="sd">
      <div className="sd-head">
        <b>Depuis « {snapshot.label} »</b>
        <span className="snap-meta">{new Date(snapshot.ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · {changes.length} changement(s)</span>
        <span className="card-fill" />
        <button className="btn ghost" onClick={onClose}>Fermer la comparaison</button>
      </div>
      {sections.length === 0 && <div className="m2-note">Rien n’a changé sur le tableau depuis cet instantané.</div>}
      {sections.map((section) => (
        <details key={section.kind} className="sd-sec" open={section.items.length <= 30}>
          <summary><b>{section.label}</b> · {section.items.length}</summary>
          <ul>{section.items.map((change) => <Item key={change.kind + change.cardId} change={change} config={config} />)}</ul>
        </details>
      ))}
    </div>
  );
}
