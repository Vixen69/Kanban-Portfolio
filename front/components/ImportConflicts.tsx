// The domain conflicts of an audit, decided ONE BY ONE (ADR 036, author's
// call 2026-09-16): the stepper shows one card at a time — the board's
// domain, the export's proposal, the rule that proposed it, what the log
// already says — with « Garder » / « Remplacer »; « Tout remplacer » and
// « Tout garder » are shortcuts; every decided line stays listed below and
// can be reopened. Nothing is written before « Charger ».

import { useState } from "react";
import type { BoardConfig } from "../../core/types.ts";
import type { DomainConflict, DomainDecision, DomainRef } from "../../core/import-types.ts";

/** Decisions taken so far, by card id. */
export type Decisions = Readonly<Record<string, DomainDecision>>;

function domainLabel(config: BoardConfig, ref: DomainRef): string {
  const domain = config.domains.find((d) => d.id === ref.domain);
  const sub = domain?.subDomains?.find((s) => s.id === ref.subDomain);
  return `${domain?.name ?? ref.domain}${sub === undefined ? "" : ` / ${sub.name}`}`;
}

function frenchDay(ts: string): string {
  return ts.slice(0, 10).split("-").reverse().join("/");
}

function priorLabel(prior: DomainConflict["prior"]): string | null {
  if (prior === null) return null;
  if (prior.kind === "main") return `domaine posé à la main dans la fiche le ${frenchDay(prior.ts)}`;
  return `${prior.kind === "garder" ? "gardé" : "remplacé"} à un import précédent, le ${frenchDay(prior.ts)}`;
}

function Current({ conflict, index, total, config, onDecide }: {
  conflict: DomainConflict; index: number; total: number; config: BoardConfig; onDecide: (decision: DomainDecision) => void;
}) {
  const prior = priorLabel(conflict.prior);
  const board = domainLabel(config, conflict.board);
  const proposed = domainLabel(config, conflict.proposed);
  return (
    <div className="conflict">
      <div className="conflict-head">Conflit {index + 1} / {total}</div>
      <div className="conflict-title">{conflict.title}{conflict.codename !== null && <small>{conflict.codename}</small>}</div>
      <div className="conflict-row"><span className="conflict-k">Tableau</span><b>{board}</b></div>
      <div className="conflict-row"><span className="conflict-k">Export</span><b>{proposed}</b><small>{conflict.rule}</small></div>
      {prior !== null && <div className="conflict-row"><span className="conflict-k">Journal</span><span>{prior}</span></div>}
      <div className="import-actions">
        <button className="btn" onClick={() => onDecide("garder")}>Garder {board}</button>
        <button className="btn" onClick={() => onDecide("remplacer")}>Remplacer par {proposed}</button>
      </div>
    </div>
  );
}

function Recap({ conflicts, decisions, config, onReopen }: {
  conflicts: DomainConflict[]; decisions: Decisions; config: BoardConfig; onReopen: (cardId: string) => void;
}) {
  const decided = conflicts.filter((c) => decisions[c.cardId] !== undefined);
  if (decided.length === 0) return null;
  return (
    <ul className="conflict-list">
      {decided.map((c) => (
        <li key={c.cardId}>
          <span>{c.title}</span>
          <b>{decisions[c.cardId] === "remplacer" ? `→ ${domainLabel(config, c.proposed)}` : `garde ${domainLabel(config, c.board)}`}</b>
          <button className="btn ghost" onClick={() => onReopen(c.cardId)}>modifier</button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The conflict panel of an audit (ADR 036).
 * Inputs: the conflicts, the decisions so far, the config (domain labels),
 * onDecide (one card), onDecideAll (the shortcuts). Output: nothing when
 * there is no conflict; else the counts, the shortcuts, the current
 * conflict and the recap of the decided ones. Failure modes: none.
 */
export function ImportConflicts({ conflicts, decisions, config, onDecide, onDecideAll }: {
  conflicts: DomainConflict[]; decisions: Decisions; config: BoardConfig;
  onDecide: (cardId: string, decision: DomainDecision) => void; onDecideAll: (decision: DomainDecision) => void;
}) {
  const [reopened, setReopened] = useState<string | null>(null);
  if (conflicts.length === 0) return null;
  const pending = conflicts.filter((c) => decisions[c.cardId] === undefined);
  const current = conflicts.find((c) => c.cardId === reopened) ?? pending[0] ?? null;
  const replaced = conflicts.filter((c) => decisions[c.cardId] === "remplacer").length;
  return (
    <div className="conflicts">
      <div className="conflict-status">
        <b>{conflicts.length}</b> conflit(s) de domaine · {pending.length} à trancher · {replaced} remplacé(s) ·
        {" "}{conflicts.length - pending.length - replaced} gardé(s)
        <span className="conflict-bulk">
          <button className="btn ghost" onClick={() => onDecideAll("remplacer")}>Tout remplacer</button>
          <button className="btn ghost" onClick={() => onDecideAll("garder")}>Tout garder</button>
        </span>
      </div>
      {current !== null && (
        <Current conflict={current} index={conflicts.indexOf(current)} total={conflicts.length} config={config}
          onDecide={(decision) => { onDecide(current.cardId, decision); setReopened(null); }} />
      )}
      <Recap conflicts={conflicts} decisions={decisions} config={config} onReopen={setReopened} />
    </div>
  );
}
