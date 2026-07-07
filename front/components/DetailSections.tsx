// Sections of the card detail modal (read mode): charge/budget tracks,
// resource chips, the DoR/DoD document row, event-backed comments and the
// movement history. Plain projections — every action flows up to App.

import { useState } from "react";
import type { CardComment, GateCode, GateDef } from "../../core/types.ts";
import type { HistoryEntry } from "../../core/history.ts";
import { displayActor } from "../lookup.ts";

// French short date for comment and history metadata.
function frDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

/**
 * Reference-document row: DoR/DoD links (placeholders until the document
 * repository is connected — clicks are swallowed) plus the gate note of
 * the current column.
 * Inputs: the column's gate code and its GateDef (both null when no gate).
 * Output: the div.doc-row. Failure modes: none.
 */
export function DocRow({ gate, gateDef }: { gate: GateCode | null; gateDef: GateDef | null }) {
  return (
    <div className="doc-row">
      <a className="doclink" href="#" onClick={(event) => event.preventDefault()} title="Definition of Ready — à connecter au référentiel">📄 DoR</a>
      <a className="doclink" href="#" onClick={(event) => event.preventDefault()} title="Definition of Done — à connecter au référentiel">📄 DoD</a>
      {gate !== null && gateDef !== null && (
        <span className="doc-gate" style={{ color: gateDef.color }}>Gate {gate} à l’entrée de cette colonne</span>
      )}
    </div>
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

/**
 * Historique des mouvements, one line per created/imported/moved event.
 * Input: the history entries, already most recent first (core/history).
 * Output: the div.history list. Failure modes: none.
 */
export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="history">
      <span className="field-label">Historique</span>
      <div className="hist-list">
        {entries.map((entry, index) => (
          <div className="hist" key={index}>
            <span className="hist-dot" />
            <span className="hist-move">{entry.fromName ? `${entry.fromName} → ` : ""}<b>{entry.toName}</b></span>
            <span className="hist-meta">{frDate(entry.ts)} · {displayActor(entry.actor)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
