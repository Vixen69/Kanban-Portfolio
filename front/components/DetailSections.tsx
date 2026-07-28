// Sections of the card detail modal (read mode): event-backed comments,
// the collapsible Délais (flow times) and the collapsible Historique
// (movements + blockages) — both closed by default (design v11). Plain
// projections — every action flows up to App.

import { useState } from "react";
import type { CardComment } from "../../core/types.ts";
import type { HistoryEntry } from "../../core/history.ts";
import type { FlowAnchors, FlowTimes } from "../../core/flow.ts";
import { displayActor } from "../lookup.ts";

// French short date for comment and history metadata.
function frDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

// Collapsible section header shared by Délais and Historique.
function SectionToggle({ label, what, open, onToggle }: { label: string; what: string; open: boolean; onToggle: () => void }) {
  return (
    <button className="hist-head-btn" onClick={onToggle} title={(open ? "Replier " : "Déplier ") + what}>
      <span className="sec-title">{label}</span>
      <span className="hist-caret">{open ? "▾" : "▸"}</span>
    </button>
  );
}

/**
 * Comments section: existing comments (projected from "commented" events)
 * plus the add input — Enter or the Ajouter button submits the trimmed
 * text and clears the input.
 * Inputs: the comments and the add callback.
 * Output: the div.comments block. Failure modes: none — blank text never
 * submits (the button is also disabled).
 */
export function CommentList({ comments, onAdd }: { comments: CardComment[]; onAdd: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  };
  return (
    <div className="comments">
      <span className="field-label">Commentaires</span>
      {comments.length === 0 && <div className="cm-empty">Aucun commentaire.</div>}
      {comments.map((comment, index) => (
        <div className="cm" key={index}>
          <div className="cm-meta"><b>{displayActor(comment.actor)}</b> · {frDate(comment.ts)}</div>
          <div className="cm-text">{comment.text}</div>
        </div>
      ))}
      <div className="cm-add">
        <input
          className="inp"
          placeholder="Ajouter un commentaire…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
        />
        <button className="btn ghost sm" onClick={submit} disabled={!draft.trim()}>Ajouter</button>
      </div>
    </div>
  );
}

// One stage-age cell of the delay grid, warm/hot past its thresholds.
function Delay({ label, days, warm, hot, empty = "—" }: { label: string; days: number | null; warm: number; hot: number; empty?: string }) {
  const cls = days !== null && days > hot ? "hot" : days !== null && days > warm ? "warm" : "";
  return (
    <div className="delay">
      <span>{label}</span>
      <b className={cls}>{days !== null ? `${days} j` : empty}</b>
    </div>
  );
}

/**
 * Délais (design v11): collapsible, closed by default — the per-stage ages
 * and the lead/cycle times, all projected from the event log (core/flow).
 * Inputs: the card's flow times and the resolved stage anchors (for the
 * French labels). Output: the div.history section. Failure modes: none —
 * a missing anchor renders « — » / « non activé ».
 */
export function DelaysSection({ flow, anchors }: { flow: FlowTimes; anchors: FlowAnchors | null }) {
  const [open, setOpen] = useState(false);
  const endName = flow.finished ? anchors?.terminal?.name ?? "Done" : "aujourd’hui";
  return (
    <div className="history">
      <SectionToggle label="Délais" what="les délais" open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <>
          <div className="delay-grid">
            <Delay label={`Depuis ${anchors?.entry.name ?? "l’entrée"}`} days={flow.ageEntry} warm={60} hot={120} />
            <Delay label={`Depuis ${anchors?.qualification?.name ?? "la qualification"}`} days={flow.ageQualification} warm={45} hot={90} />
            <Delay label="Depuis 1ʳᵉ activation" days={flow.ageActivation} warm={45} hot={90} empty="non activé" />
          </div>
          <div className="leadcycle">
            <div className="lc">
              <span>Lead time {flow.finished ? "" : "(en cours)"}</span>
              <b>{flow.leadTime !== null ? `${flow.leadTime} j` : "—"}</b>
              <em>{anchors?.entry.name ?? "Entrée"} → {endName}</em>
            </div>
            <div className="lc">
              <span>Cycle time {flow.finished || flow.cycleTime === null ? "" : "(en cours)"}</span>
              <b>{flow.cycleTime !== null ? `${flow.cycleTime} j` : "non activé"}</b>
              <em>{anchors?.activation?.name ?? "Activation"} → {endName}</em>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// One history line: a movement (from → to) or a block/unblock event.
function HistRow({ entry }: { entry: HistoryEntry }) {
  const dot = entry.kind === "block" ? " blk" : entry.kind === "unblock" ? " okd" : "";
  const body = entry.kind === "block"
    ? <><b>Bloqué</b>{entry.reason ? ` — ${entry.reason}` : ""}</>
    : entry.kind === "unblock"
      ? <b>Blocage levé</b>
      : <>{entry.fromName ? `${entry.fromName} → ` : ""}<b>{entry.toName}</b></>;
  return (
    <div className="hist">
      <span className={"hist-dot" + dot} />
      <span className="hist-move">{body}</span>
      <span className="hist-meta">{frDate(entry.ts)} · {displayActor(entry.actor)}</span>
    </div>
  );
}

/**
 * Historique (design v11): collapsible, closed by default — one line per
 * movement or blockage of the card (core/history projection, most recent
 * first; block lines carry the motif, red dot; unblock lines a green dot).
 * Input: the history entries. Output: the div.history list.
 * Failure modes: none.
 */
export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="history">
      <SectionToggle label="Historique" what="l’historique" open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <div className="hist-list">
          {entries.map((entry, index) => <HistRow key={index} entry={entry} />)}
        </div>
      )}
    </div>
  );
}
