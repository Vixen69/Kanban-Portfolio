// Décision section of the card detail (ADR 026): the trace of the
// portfolio decisions D1–D6 taken on the subject — the last one with its
// review date, the list, and the form to record one with its reason in
// the grid's terms. Every decision is a "decided" event; nothing is stored
// elsewhere. « Non tracée = non prise » (Référentiel V3.1, 7.8). Also the
// « absente du dernier import » banner (same ADR).

import { useState } from "react";
import type { BoardConfig, CardDecision, CardState, DecisionGroundFamily } from "../../core/types.ts";
import { decisionStatus, groundsOf } from "../../core/decisions.ts";
import type { DecisionStatus } from "../../core/decisions.ts";
import type { DecisionInput } from "../api.ts";
import { displayActor } from "../lookup.ts";

/** Decisions listed before the « … de plus » toggle. */
const SHOWN = 5;
const FAMILY_LABEL: Record<DecisionGroundFamily, string> = { proteger: "Protéger", pause: "Mettre en pause" };

function frDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

function frDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function StatusPill({ status }: { status: DecisionStatus }) {
  const { entry, decision, overdue } = status;
  const review = entry.reviewDate === null ? "" : ` · réexamen ${frDay(entry.reviewDate)}${overdue ? " (dépassé)" : ""}`;
  return (
    <span className={"dec-status" + (overdue ? " overdue" : "")} style={{ background: decision?.color ?? "#94a3b8" }}>
      {decision === null ? entry.decisionId : `${decision.short} ${decision.name}`}{review}
    </span>
  );
}

function DecisionRow({ entry, config }: { entry: CardDecision; config: BoardConfig }) {
  const decision = config.decisions.find((d) => d.id === entry.decisionId);
  const grounds = groundsOf(config, entry.grounds);
  return (
    <div className="cm dec-item">
      <div className="cm-meta"><b>{displayActor(entry.actor)}</b> · {frDate(entry.ts)}</div>
      <div className="dec-line">
        <b style={{ color: decision?.color }}>{decision === undefined ? entry.decisionId : `${decision.short} ${decision.name}`}</b>
        {grounds.map((ground) => <span key={ground.id} className="dec-chip">{ground.name}</span>)}
        {entry.reviewDate !== null && <span className="dec-review">réexamen le {frDay(entry.reviewDate)}</span>}
      </div>
      {entry.reason !== "" && <div className="cm-text">{entry.reason}</div>}
    </div>
  );
}

function GroundsPicker({ config, selected, onToggle }: { config: BoardConfig; selected: ReadonlySet<string>; onToggle: (id: string) => void }) {
  const families: DecisionGroundFamily[] = ["proteger", "pause"];
  return (
    <div className="dec-grounds">
      {families.map((family) => (
        <div key={family} className="dec-family">
          <span className="field-label">{FAMILY_LABEL[family]}</span>
          {config.decisionGrounds.filter((ground) => ground.family === family).map((ground) => (
            <label key={ground.id} className={"dec-opt" + (selected.has(ground.id) ? " on" : "")}>
              <input type="checkbox" checked={selected.has(ground.id)} onChange={() => onToggle(ground.id)} />
              {ground.name}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

function DecisionForm({ config, onSubmit, onCancel }: { config: BoardConfig; onSubmit: (input: DecisionInput) => void; onCancel: () => void }) {
  const [decisionId, setDecisionId] = useState("");
  const [grounds, setGrounds] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const decision = config.decisions.find((d) => d.id === decisionId);
  const missingReason = decision !== undefined && decision.traced && grounds.size === 0 && reason.trim() === "";
  const toggle = (id: string) => setGrounds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <div className="dec-form">
      <select className="inp" value={decisionId} onChange={(event) => setDecisionId(event.target.value)}>
        <option value="">Choisir la décision…</option>
        {config.decisions.map((d) => (
          <option key={d.id} value={d.id}>{d.short} — {d.name}{d.traced ? " (raison obligatoire)" : ""}</option>
        ))}
      </select>
      <GroundsPicker config={config} selected={grounds} onToggle={toggle} />
      <textarea className="inp" rows={2} placeholder="Raison, dans les termes de la grille…"
        value={reason} onChange={(event) => setReason(event.target.value)} />
      <div className="dec-form-row">
        <label className="dec-date">Réexamen le <input type="date" className="inp" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} /></label>
        <span className="card-fill" />
        <button className="btn ghost sm" onClick={onCancel}>Annuler</button>
        <button className="btn sm" disabled={decision === undefined || missingReason}
          onClick={() => onSubmit({ decisionId, grounds: [...grounds], reason: reason.trim(), reviewDate: reviewDate === "" ? null : reviewDate })}>
          Tracer la décision
        </button>
      </div>
      {missingReason && <div className="dec-warn">Décision tracée : indiquer au moins un terme de la grille ou une raison.</div>}
    </div>
  );
}

/**
 * The Décision section: the last decision as a pill, the traced list
 * (newest first, folded past SHOWN) and the record form.
 * Inputs: the card, the config (decisions, grid terms), now (ms), the
 * decide callback. Output: the div.decisions block.
 * Failure modes: none — a card without decision shows the referential's rule.
 */
export function DecisionSection({ card, config, now, onDecide }: {
  card: CardState; config: BoardConfig; now: number; onDecide: (input: DecisionInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const status = decisionStatus(card, config, new Date(now));
  const entries = [...card.decisions].reverse();
  const shown = showAll ? entries : entries.slice(0, SHOWN);
  return (
    <div className="decisions">
      <div className="dec-head">
        <span className="field-label">Décision</span>
        {status !== null && <StatusPill status={status} />}
        <span className="card-fill" />
        {!open && <button className="btn ghost sm" onClick={() => setOpen(true)}>Tracer une décision</button>}
      </div>
      {open && <DecisionForm config={config} onCancel={() => setOpen(false)} onSubmit={(input) => { onDecide(input); setOpen(false); }} />}
      {entries.length === 0 && <div className="cm-empty">Aucune décision tracée — « non tracée = non prise ».</div>}
      {shown.map((entry, index) => <DecisionRow key={index} entry={entry} config={config} />)}
      {entries.length > SHOWN && (
        <button className="btn ghost sm" onClick={() => setShowAll((s) => !s)}>{showAll ? "Réduire" : `… ${entries.length - SHOWN} de plus`}</button>
      )}
    </div>
  );
}

/**
 * The « absente du dernier import » banner (ADR 026): shown when the last
 * import did not list the card; it stays, never deleted.
 * Input: the card. Output: the banner or null. Failure: none.
 */
export function AbsentBanner({ card }: { card: CardState }) {
  if (card.absentFromLastImport === null) return null;
  return (
    <div className="absent-banner">
      ∅ Absente du dernier import ({frDate(card.absentFromLastImport)}) — conservée, jamais supprimée ;
      archiver si le sujet est sorti du périmètre.
    </div>
  );
}
