// Inline editors of the card detail (design/modals.jsx): the generic
// InlineEdit control plus the four checklist editors — plan de charge by
// profile, contention, risks, project constraints. Each saves through a
// patch callback wired to editCard in App; none holds board state.

import { type ReactNode, useState } from "react";
import type { BoardConfig, ChargeEntry, Risk } from "../../core/types.ts";

/** A value the InlineEdit control can display and edit. */
type InlineValue = string | number | null;

/**
 * Click-to-edit inline field: shows `display` (or the value), turns into an
 * input on click, commits on Enter/blur, cancels on Escape.
 * Inputs: the current value, the commit callback, optional input type,
 * placeholder, display override and value<->input transforms.
 * Output: a span (read) or input (editing). Failure modes: none.
 */
export function InlineEdit<T = string>({
  value, onCommit, type = "text", placeholder = "", display, toInput, fromInput, className = "",
}: {
  value: InlineValue;
  onCommit: (value: T) => void;
  type?: string;
  placeholder?: string;
  display?: string;
  toInput?: (value: InlineValue) => string;
  fromInput?: (raw: string) => T;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const start = (event: React.MouseEvent) => {
    event.stopPropagation();
    setDraft(toInput ? toInput(value) : value == null ? "" : String(value));
    setEditing(true);
  };
  const commit = () => { setEditing(false); onCommit(fromInput ? fromInput(draft) : (draft as unknown as T)); };
  if (editing) {
    return (
      <input
        className={"inline-inp " + className} type={type} autoFocus value={draft} placeholder={placeholder}
        onClick={(event) => event.stopPropagation()} onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          // Contained: cancels this edit only, never the whole modal.
          else if (event.key === "Escape") { event.stopPropagation(); setEditing(false); }
        }}
      />
    );
  }
  return (
    <span className={"inline-val " + className} onClick={start} title="Cliquer pour modifier">
      {display != null ? display : value || placeholder || "—"}
    </span>
  );
}

// One checklist row shared by the editors: checkbox + colour dot + label,
// plus optional trailing content (e.g. the j.h number input on charge rows).
function CeRow({ on, color, label, onToggle, children }: {
  on: boolean;
  color: string;
  label: string;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <label className={"ce-row" + (on ? " on" : "")}>
      <input type="checkbox" checked={on} onChange={onToggle} />
      <span className="ce-dot" style={{ background: color }} />
      <span className="ce-label">{label}</span>
      {children}
    </label>
  );
}

// Save/cancel footer shared by the checklist editors.
function EditorFoot({ summary, onSave, onCancel }: { summary: ReactNode; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="ce-foot">
      <span className="ce-total">{summary}</span>
      <div className="ce-actions">
        <button className="lift-btn" onClick={onSave}>Enregistrer</button>
        <button className="cont-cancel" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

/**
 * Plan de charge editor: check profiles and set j.h per checked profile.
 * An existing profile keeps its user-maintained `done` (clamped to the new
 * jh — design v11 edits it inline in read mode); only a newly added profile
 * derives `done` from the card's overall consumed/estimated ratio.
 * Inputs: the config (profile typology), the card's charge rows, est/cons
 * effort totals, save/cancel callbacks. Output: the editor DOM.
 */
export function ChargeEditor({ config, charge, est, cons, onSave, onCancel }: {
  config: BoardConfig;
  charge: ChargeEntry[];
  est: number;
  cons: number;
  onSave: (rows: ChargeEntry[]) => void;
  onCancel: () => void;
}) {
  const initial: Record<string, string> = {};
  charge.forEach((entry) => { initial[entry.profileId] = String(entry.jh); });
  const [rows, setRows] = useState<Record<string, string>>(initial);
  const toggle = (id: string) => setRows((current) => {
    const next = { ...current };
    if (id in next) delete next[id]; else next[id] = "0";
    return next;
  });
  const total = config.profiles.filter((p) => p.id in rows).reduce((sum, p) => sum + (parseInt(rows[p.id] as string, 10) || 0), 0);
  const save = () => onSave(config.profiles.filter((p) => p.id in rows).map((p) => {
    const jh = Math.max(0, parseInt(rows[p.id] as string, 10) || 0);
    const existing = charge.find((entry) => entry.profileId === p.id);
    const done = existing ? existing.done : est ? Math.round((jh * cons) / est) : 0;
    return { profileId: p.id, jh, done: Math.min(jh, done) };
  }));
  return (
    <div className="charge-editor">
      <div className="ce-list">
        {config.profiles.map((p) => (
          <CeRow key={p.id} on={p.id in rows} color={p.color} label={p.name} onToggle={() => toggle(p.id)}>
            <input className="ce-num" type="number" min="0" disabled={!(p.id in rows)} value={p.id in rows ? rows[p.id] : ""} placeholder="0"
              onChange={(event) => setRows((current) => ({ ...current, [p.id]: event.target.value }))} />
            <span className="ce-unit">j.h</span>
          </CeRow>
        ))}
      </div>
      <EditorFoot summary={<>Total <b>{total}</b> j.h</>} onSave={save} onCancel={onCancel} />
    </div>
  );
}

/**
 * Contention editor: checklist of profiles under tension + a free note.
 * Inputs: the config (profiles), the card's contention profiles/note, the
 * save/cancel callbacks. Output: the editor DOM.
 */
export function ContentionEditor({ config, profiles, note, onSave, onCancel }: {
  config: BoardConfig;
  profiles: string[];
  note: string;
  onSave: (value: { profiles: string[]; note: string }) => void;
  onCancel: () => void;
}) {
  // Seed from config-known ids only: a profile removed from the topology has
  // no checkbox, so a stale id kept in the set could never be deselected and
  // would 400 on save (middle referential check). Drop it on open, as the
  // charge/risk editors already do by rebuilding from config.
  const [sel, setSel] = useState<Set<string>>(() => new Set(profiles.filter((id) => config.profiles.some((p) => p.id === id))));
  const [text, setText] = useState(note);
  const toggle = (id: string) => setSel((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <div className="charge-editor">
      <div className="ce-list">
        {config.profiles.map((p) => (
          <CeRow key={p.id} on={sel.has(p.id)} color={p.color} label={p.name} onToggle={() => toggle(p.id)} />
        ))}
      </div>
      <textarea className="cont-area" value={text}
        placeholder="Commentaire libre sur la contention (partage, disponibilité, conflits de planning…)"
        onChange={(event) => setText(event.target.value)} />
      <EditorFoot summary={<><b>{sel.size}</b> profil(s) en tension</>}
        onSave={() => onSave({ profiles: [...sel], note: text.trim() })} onCancel={onCancel} />
    </div>
  );
}

/**
 * Risk editor: checklist of risk types (bearing entities); a kept risk keeps
 * its free description. Inputs: the config (risk typology), the card's risks,
 * save/cancel. Output: the editor DOM.
 */
export function RiskEditor({ config, risks, onSave, onCancel }: {
  config: BoardConfig;
  risks: Risk[];
  onSave: (risks: Risk[]) => void;
  onCancel: () => void;
}) {
  const initial: Record<string, string> = {};
  risks.forEach((risk) => { initial[risk.type] = risk.desc || ""; });
  const [sel, setSel] = useState<Record<string, string>>(initial);
  const toggle = (id: string) => setSel((current) => {
    const next = { ...current };
    if (id in next) delete next[id]; else next[id] = "";
    return next;
  });
  return (
    <div className="charge-editor">
      <div className="ce-list">
        {config.riskTypes.map((rt) => (
          <CeRow key={rt.id} on={rt.id in sel} color={rt.color} label={rt.name} onToggle={() => toggle(rt.id)} />
        ))}
      </div>
      <EditorFoot summary={<><b>{Object.keys(sel).length}</b> risque(s) retenu(s)</>}
        onSave={() => onSave(config.riskTypes.filter((rt) => rt.id in sel).map((rt) => ({ type: rt.id, desc: sel[rt.id] as string })))}
        onCancel={onCancel} />
    </div>
  );
}

/**
 * Project-constraint editor: a checklist (Légale, Groupe…).
 * Inputs: the config (project constraints), the card's constraints, save/
 * cancel. Output: the editor DOM.
 */
export function ConstraintEditor({ config, constraints, onSave, onCancel }: {
  config: BoardConfig;
  constraints: string[];
  onSave: (ids: string[]) => void;
  onCancel: () => void;
}) {
  // Seed from config-known ids only (see ContentionEditor): a stale id with no
  // checkbox could never be deselected and would 400 the whole save.
  const [sel, setSel] = useState<Set<string>>(() => new Set(constraints.filter((id) => config.projectConstraints.some((c) => c.id === id))));
  const toggle = (id: string) => setSel((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <div className="charge-editor">
      <div className="ce-list">
        {config.projectConstraints.map((pc) => (
          <CeRow key={pc.id} on={sel.has(pc.id)} color={pc.color} label={pc.name} onToggle={() => toggle(pc.id)} />
        ))}
      </div>
      <EditorFoot summary={<><b>{sel.size}</b> contrainte(s)</>} onSave={() => onSave([...sel])} onCancel={onCancel} />
    </div>
  );
}
