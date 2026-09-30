// Décision section of the card detail (ADR 026, ADR 052): the trace of the
// portfolio decisions taken on the subject — each with the blocks of its
// fiche « Décision et Raison ». Decisions are taken by the gesture (into
// Pause, a chosen canal changed); here, a card sitting in Pause can have
// its pause traced (decided on paper) or renewed — « prolonger est une
// décision : nouvelle fiche ». Every decision is a "decided" event;
// nothing is stored elsewhere. « Non tracée = non prise » (Référentiel
// V3.1, 7.8). Also the « absente du dernier import » banner (same ADR).

import { useState } from "react";
import type { BoardConfig, CardDecision, CardState } from "../../core/types.ts";
import { groundsOf, pauseStatus, type PauseStatus } from "../../core/decisions.ts";
import { displayActor } from "../lookup.ts";

/** Decisions listed before the « … de plus » toggle. */
const SHOWN = 5;

function frDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

function frDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function laneName(config: BoardConfig, id: string): string {
  return config.lanes.find((lane) => lane.id === id)?.name ?? id;
}

function PauseLine({ status }: { status: PauseStatus }) {
  const { entry, overdue } = status;
  if (entry === null) return <span className="dec-status untraced">Pause non tracée</span>;
  const kind = entry.pauseKind === null ? "" : entry.pauseKind === "tactique" ? " tactique" : " parking";
  const review = entry.reviewDate === null ? "" : ` · réexamen ${frDay(entry.reviewDate)}${overdue ? " (dépassé)" : ""}`;
  return <span className={"dec-status" + (overdue ? " overdue" : "")} style={{ background: "#7c3aed" }}>Pause{kind}{review}</span>;
}

// The fiche's blocks worth reading back, in the paper's order.
function blocksOf(entry: CardDecision, config: BoardConfig): string[] {
  const lines: string[] = [];
  if (entry.fromLaneId !== null && entry.toLaneId !== null) lines.push(`Canal : ${laneName(config, entry.fromLaneId)} → ${laneName(config, entry.toLaneId)}`);
  if (entry.natureChange !== "") lines.push(`Ce qui a changé : ${entry.natureChange}${entry.architectValidated ? " (validée par un architecte)" : ""}`);
  if (entry.liftCondition !== "") lines.push(`Pour la lever : ${entry.liftCondition}`);
  if (entry.options !== "") lines.push(`Options écartées : ${entry.options}`);
  const frees = [["Personnes", entry.frees.people], ["Budget", entry.frees.budget], ["Capacité", entry.frees.capacity]].filter(([, v]) => v !== "");
  if (frees.length > 0) lines.push(`Libère ou engage — ${frees.map(([k, v]) => `${k} : ${v}`).join(" · ")}`);
  return lines;
}

function DecisionRow({ entry, config }: { entry: CardDecision; config: BoardConfig }) {
  const decision = config.decisions.find((d) => d.id === entry.decisionId);
  const grounds = groundsOf(config, entry.grounds);
  const where = entry.instance === null ? "" : entry.instance === "revue" ? " · Revue Stratégique" : " · Synchro";
  const when = entry.decidedOn === null ? "" : ` · décidée le ${frDay(entry.decidedOn)}`;
  return (
    <div className="cm dec-item">
      <div className="cm-meta"><b>{displayActor(entry.actor)}</b> · {frDate(entry.ts)}{where}{when}</div>
      <div className="dec-line">
        <b style={{ color: decision?.color }}>{decision === undefined ? entry.decisionId : decision.name}</b>
        {entry.pauseKind !== null && <span className="dec-chip">{entry.pauseKind === "tactique" ? "Tactique" : "Parking"}</span>}
        {grounds.map((ground) => <span key={ground.id} className="dec-chip">{ground.name}</span>)}
        {entry.reviewDate !== null && <span className="dec-review">réexamen le {frDay(entry.reviewDate)}</span>}
      </div>
      {entry.reason !== "" && <div className="cm-text">{entry.reason}</div>}
      {blocksOf(entry, config).map((line) => <div key={line} className="cm-text dec-block">{line}</div>)}
    </div>
  );
}

/**
 * The Décision section: the pause in force (for a card in Pause) with its
 * « Tracer la pause » / « Reconduire la pause » button, then the traced
 * list, newest first, folded past SHOWN.
 * Inputs: the card, the config (decisions, grid terms, canals), now (ms),
 * the callback opening the fiche for the pause. Output: the div.decisions
 * block. Failure modes: none — a card without decision says how they are taken.
 */
export function DecisionSection({ card, config, now, onTracePause }: {
  card: CardState; config: BoardConfig; now: number; onTracePause: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const pause = pauseStatus(card, new Date(now));
  const entries = [...card.decisions].reverse();
  const shown = showAll ? entries : entries.slice(0, SHOWN);
  return (
    <div className="decisions">
      <div className="dec-head">
        <span className="field-label">Décision</span>
        {pause !== null && <PauseLine status={pause} />}
        <span className="card-fill" />
        {pause !== null && !card.archived && (
          <button className="btn ghost sm" onClick={onTracePause}>{pause.entry === null ? "Tracer la pause" : "Reconduire la pause"}</button>
        )}
      </div>
      {entries.length === 0 && (
        <div className="cm-empty">Aucune décision tracée. Elles se prennent au geste : déposer en Pause, ou changer le canal d’un sujet déjà qualifié.</div>
      )}
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
