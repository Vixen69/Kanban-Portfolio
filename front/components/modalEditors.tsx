// Inline editors of the card detail (design/modals.jsx): the generic
// InlineEdit control plus the four checklist editors — plan de charge by
// profile, contention, risks, project constraints. Each saves through a
// patch callback wired to editCard in App; none holds board state.

import { type ReactNode, useState } from "react";
import type { BoardConfig, ChargeEntry, Criticality, Risk } from "../../core/types.ts";
import { CARD_TEXT_LIMITS as CAP, parseAmount } from "../../core/card-input.ts";
import { fmtNum } from "../format.ts";

/** A value the InlineEdit control can display and edit. */
type InlineValue = string | number | null;

/** Props of InlineEdit (see there). */
export interface InlineEditProps<T> {
  value: InlineValue;
  onCommit: (value: T) => void;
  type?: string;
  placeholder?: string;
  display?: string;
  toInput?: (value: InlineValue) => string;
  fromInput?: (raw: string) => T;
  className?: string;
  maxLength?: number;
}

/**
 * Click-to-edit inline field: shows `display` (or the value), turns into an
 * input on click, commits on Enter/blur, cancels on Escape. A click then
 * leave commits NOTHING (ADR 057): only a draft that differs from the
 * input it opened with is committed — a derived figure on display is never
 * written back as data.
 * Inputs: the current value, the commit callback, optional input type,
 * placeholder, display override, value<->input transforms and maxLength
 * (the middle's cap, core/card-input.ts).
 * Output: a span (read) or input (editing). Failure modes: none.
 */
export function InlineEdit<T = string>({
  value, onCommit, type = "text", placeholder = "", display, toInput, fromInput, className = "", maxLength,
}: InlineEditProps<T>) {
  const [draft, setDraft] = useState("");
  // The input text the edit opened with; null while not editing.
  const [opened, setOpened] = useState<string | null>(null);
  const start = (event: React.MouseEvent) => {
    event.stopPropagation();
    const text = toInput ? toInput(value) : value == null ? "" : String(value);
    setDraft(text);
    setOpened(text);
  };
  const commit = () => {
    setOpened(null);
    if (draft !== opened) onCommit(fromInput ? fromInput(draft) : (draft as unknown as T));
  };
  if (opened !== null) {
    return (
      <input
        className={"inline-inp " + className} type={type} autoFocus value={draft} placeholder={placeholder} maxLength={maxLength}
        onClick={(event) => event.stopPropagation()} onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          // Contained: cancels this edit only, never the whole modal.
          else if (event.key === "Escape") { event.stopPropagation(); setOpened(null); }
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
 * The j.h are read as decimals, comma or dot (core/card-input.ts — a
 * re-save keeps 36.5, ADR 057). An existing profile keeps its
 * user-maintained `done` (clamped to the new jh — design v11 edits it
 * inline in read mode); a newly ticked profile starts at done 0, never an
 * invented consumed.
 * Inputs: the config (profile typology), the card's charge rows,
 * save/cancel callbacks. Output: the editor DOM.
 */
export function ChargeEditor({ config, charge, onSave, onCancel }: {
  config: BoardConfig;
  charge: ChargeEntry[];
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
  const jhOf = (id: string) => parseAmount(rows[id] ?? "") ?? 0;
  const total = config.profiles.filter((p) => p.id in rows).reduce((sum, p) => sum + jhOf(p.id), 0);
  const save = () => onSave(config.profiles.filter((p) => p.id in rows).map((p) => {
    const jh = jhOf(p.id);
    const done = charge.find((entry) => entry.profileId === p.id)?.done ?? 0;
    return { profileId: p.id, jh, done: Math.min(jh, done) };
  }));
  return (
    <div className="charge-editor">
      <div className="ce-list">
        {config.profiles.map((p) => (
          <CeRow key={p.id} on={p.id in rows} color={p.color} label={p.name} onToggle={() => toggle(p.id)}>
            <input className="ce-num" type="number" min="0" step="any" disabled={!(p.id in rows)} value={p.id in rows ? rows[p.id] : ""} placeholder="0"
              onChange={(event) => setRows((current) => ({ ...current, [p.id]: event.target.value }))} />
            <span className="ce-unit">j.h</span>
          </CeRow>
        ))}
      </div>
      <EditorFoot summary={<>Total <b>{fmtNum(total)}</b> j.h</>} onSave={save} onCancel={onCancel} />
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
      <textarea className="cont-area" value={text} maxLength={CAP.contentionNote}
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
 * Project-constraint editor: a checklist (Légale, Groupe…), then the
 * criticality ticked the same way (author, 2026-09-11): ★ Top or • Majeur,
 * one at most — neither ticked = Normal.
 * Inputs: the config (project constraints, criticality labels), the card's
 * constraints and criticality, save/cancel. Output: the editor DOM.
 */
export function ConstraintEditor({ config, constraints, criticality, onSave, onCancel }: {
  config: BoardConfig;
  constraints: string[];
  criticality: Criticality;
  onSave: (ids: string[], criticality: Criticality) => void;
  onCancel: () => void;
}) {
  // Seed from config-known ids only (see ContentionEditor): a stale id with no
  // checkbox could never be deselected and would 400 the whole save.
  const [sel, setSel] = useState<Set<string>>(() => new Set(constraints.filter((id) => config.projectConstraints.some((c) => c.id === id))));
  const [crit, setCrit] = useState<Criticality>(criticality);
  const toggle = (id: string) => setSel((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const pick = (c: Criticality) => setCrit((current) => (current === c ? "normal" : c));
  const crits = config.criticalities;
  return (
    <div className="charge-editor">
      <div className="ce-list">
        {config.projectConstraints.map((pc) => (
          <CeRow key={pc.id} on={sel.has(pc.id)} color={pc.color} label={pc.name} onToggle={() => toggle(pc.id)} />
        ))}
      </div>
      <span className="field-label" style={{ margin: "9px 0 6px", display: "block" }}>Criticité</span>
      <div className="ce-list">
        <CeRow on={crit === "top"} color="#d4a017" label={`★ ${crits.top.label}`} onToggle={() => pick("top")} />
        <CeRow on={crit === "major"} color="#475569" label={`• ${crits.major.label}`} onToggle={() => pick("major")} />
      </div>
      <EditorFoot summary={<><b>{sel.size}</b> contrainte(s) · {crits[crit].label}</>} onSave={() => onSave([...sel], crit)} onCancel={onCancel} />
    </div>
  );
}
