// Edit mode of the card detail (design's "Modifier"). Saving appends ONE
// "edited" event carrying the whitelisted field patch — the fold applies
// it; nothing is mutated. Position and blocked state keep their own
// interactions (drag & drop, Signaler/Lever un blocage).

import { useState } from "react";
import type { BoardConfig, CardPatch, CardState, Criticality } from "../../core/types.ts";
import { CRITICALITY_LABELS } from "../domains.ts";

export interface CardEditProps {
  card: CardState;
  config: BoardConfig;
  onCancel: () => void;
  onSave: (patch: CardPatch) => void;
}

interface Draft {
  title: string;
  owner: string;
  domain: string;
  criticality: Criticality;
  typeId: string;
  codename: string;
  tags: string;
  budget: string;
  consumed: string;
}

function toDraft(card: CardState): Draft {
  return {
    title: card.title,
    owner: card.owner,
    domain: card.domain,
    criticality: card.criticality,
    typeId: card.typeId ?? "",
    codename: card.codename ?? "",
    tags: card.tags.join(", "),
    budget: card.budget === null ? "" : String(card.budget),
    consumed: card.consumed === null ? "" : String(card.consumed),
  };
}

function toPatch(draft: Draft): CardPatch {
  const number = (raw: string): number | null => {
    const parsed = Number(raw);
    return raw.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
  };
  const budget = number(draft.budget);
  const consumed = number(draft.consumed);
  return {
    title: draft.title.trim(),
    owner: draft.owner.trim(),
    domain: draft.domain,
    criticality: draft.criticality,
    typeId: draft.typeId === "" ? null : draft.typeId,
    codename: draft.codename.trim() === "" ? null : draft.codename.trim(),
    tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    budget,
    consumed,
    remaining: budget !== null && consumed !== null ? budget - consumed : null,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Selects({ draft, config, set }: { draft: Draft; config: BoardConfig; set: (patch: Partial<Draft>) => void }) {
  return (
    <div className="field-2col">
      <Field label="Domaine">
        <select className="inp" value={draft.domain} onChange={(e) => set({ domain: e.target.value })}>
          {config.domains.map((domain) => (
            <option key={domain} value={domain}>{domain}</option>
          ))}
        </select>
      </Field>
      <Field label="Criticité">
        <select
          className="inp"
          value={draft.criticality}
          onChange={(e) => set({ criticality: e.target.value as Criticality })}
        >
          {(["normal", "major", "top"] as const).map((crit) => (
            <option key={crit} value={crit}>{CRITICALITY_LABELS[crit]}</option>
          ))}
        </select>
      </Field>
      {config.types.length > 0 && (
        <Field label="Type de projet">
          <select className="inp" value={draft.typeId} onChange={(e) => set({ typeId: e.target.value })}>
            <option value="">—</option>
            {config.types.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Code projet">
        <input className="inp" value={draft.codename} onChange={(e) => set({ codename: e.target.value })} />
      </Field>
    </div>
  );
}

/**
 * The edit form of the card detail modal.
 * Inputs: CardEditProps (the card, the config vocabularies, cancel/save).
 * Output: the form; "Enregistrer" emits one CardPatch (remaining is
 * recomputed from budget and consumed) and is disabled on an empty title.
 * Failure: none — unparseable numbers save as null.
 */
export function CardEdit(props: CardEditProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(props.card));
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  return (
    <div className="modal-body">
      <div className="modal-top">
        <h2 className="modal-name">Modifier</h2>
        <button className="x" onClick={props.onCancel}>✕</button>
      </div>
      <Field label="Nom">
        <input className="inp" autoFocus value={draft.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Selects draft={draft} config={props.config} set={set} />
      <div className="field-2col">
        <Field label="Responsable">
          <input className="inp" value={draft.owner} onChange={(e) => set({ owner: e.target.value })} />
        </Field>
        <Field label="Tags (virgules)">
          <input className="inp" value={draft.tags} onChange={(e) => set({ tags: e.target.value })} />
        </Field>
        <Field label="Budget estimé (k€)">
          <input className="inp" type="number" min="0" value={draft.budget} onChange={(e) => set({ budget: e.target.value })} />
        </Field>
        <Field label="Budget consommé (k€)">
          <input className="inp" type="number" min="0" value={draft.consumed} onChange={(e) => set({ consumed: e.target.value })} />
        </Field>
      </div>
      <div className="modal-actions">
        <span className="spacer" />
        <button className="btn ghost" onClick={props.onCancel}>Annuler</button>
        <button className="btn primary" disabled={draft.title.trim() === ""} onClick={() => props.onSave(toPatch(draft))}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}
