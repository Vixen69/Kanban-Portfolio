// Sections of the card detail modal (read mode): charge/budget tracks,
// resource chips, the DoR/DoD document row, event-backed comments and the
// movement history. Plain projections — every action flows up to App.

import { useState } from "react";
import type { CardComment, CardState, GateCode, GateDef } from "../../core/types.ts";
import type { HistoryEntry } from "../../core/history.ts";
import { displayActor } from "../lookup.ts";

// French short date for comment and history metadata.
function frDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

// One head + track pair of the charge box (design colors: the given ok
// color below 85 %, warn from 85 %, danger past 100 % with a suffix).
function ChargeTrack({ label, consumed, estimated, unit, okColor, topGap }: {
  label: string;
  consumed: number;
  estimated: number;
  unit: string;
  okColor: string;
  topGap?: boolean;
}) {
  const pct = estimated ? Math.round((consumed / estimated) * 100) : 0;
  const over = consumed > estimated;
  const fill = over ? "var(--danger)" : pct >= 85 ? "var(--warn)" : okColor;
  return (
    <>
      <div className="charge-head" style={topGap ? { marginTop: 9 } : undefined}>
        <span className="field-label">{label}</span>
        <span className={"charge-num" + (over ? " over" : "")}>
          {consumed} / {estimated} {unit}{over ? " · dépassement" : ""}
        </span>
      </div>
      <div className="charge-track">
        <span className="charge-fill" style={{ width: `${Math.min(100, pct)}%`, background: fill }} />
      </div>
    </>
  );
}

/**
 * Charge box: meilleur estimé vs consommé in jours-homme, then budget k€.
 * Input: the card state (null figures read as 0, as in the design).
 * Output: the div.charge-box with both tracks. Failure modes: none — a
 * zero estimate shows 0 % and flags any consumption as an overrun.
 */
export function ChargeBox({ card }: { card: CardState }) {
  return (
    <div className="charge-box">
      <ChargeTrack
        label="Charge · jours-homme"
        consumed={card.effortConsumed ?? 0}
        estimated={card.effortEstimated ?? 0}
        unit="j.h"
        okColor="var(--accent)"
      />
      <ChargeTrack
        label="Budget · k€"
        consumed={card.budgetConsumed ?? 0}
        estimated={card.budgetEstimated ?? 0}
        unit="k€"
        okColor="var(--ok)"
        topGap
      />
    </div>
  );
}

/**
 * Ressources clés as chips.
 * Input: the card's resources. Output: the div.res-box, or null when the
 * card has no resources. Failure modes: none.
 */
export function ResourceChips({ resources }: { resources: string[] }) {
  if (resources.length === 0) return null;
  return (
    <div className="res-box">
      <span className="field-label">Ressources clés</span>
      <div className="res-chips">
        {resources.map((resource, index) => <span key={index} className="res-chip">{resource}</span>)}
      </div>
    </div>
  );
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
