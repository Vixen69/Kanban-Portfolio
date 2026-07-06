// QuickAdd modal (« + Sujet », touche N) — design/modals.jsx QuickAdd.
// Every new subject enters the FIRST column (pull flow: all intake arrives
// on the left); the server assigns id, codename, column and timestamps.

import { useState } from "react";
import type { BoardConfig, Criticality, NatureKey } from "../../core/types.ts";
import { CRITICALITY_KEYS, Field, NATURE_KEYS, SelectField } from "./modalParts.tsx";

/** Creation intent sent to POST /api/cards (through App/useBoardStore). */
export interface QuickAddInput {
  title: string;
  domain: string;
  laneId: string;
  typeId: string;
  nature: NatureKey;
  criticality: Criticality;
  owner: string;
}

/** Props of the QuickAdd modal. */
export interface QuickAddProps {
  config: BoardConfig;
  onClose: () => void;
  onCreate: (input: QuickAddInput) => void;
}

// Design defaults: first domain/lane, « Mise en œuvre » type when present,
// nature simple, criticality normal.
function initialInput(config: BoardConfig): QuickAddInput {
  return {
    title: "",
    domain: config.domains[0]!.id,
    laneId: config.lanes[0]!.id,
    typeId: config.types.find((type) => type.id === "mise_en_oeuvre")?.id ?? config.types[0]!.id,
    nature: "simple",
    criticality: "normal",
    owner: "",
  };
}

// The five vocabulary selects of the creation form (design order).
function SelectGrid({ draft, config, set }: {
  draft: QuickAddInput;
  config: BoardConfig;
  set: (patch: Partial<QuickAddInput>) => void;
}) {
  return (
    <div className="field-2col">
      <SelectField label="Type de projet" value={draft.typeId} options={config.types.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => set({ typeId: v })} />
      <SelectField label="Domaine RDOM" value={draft.domain} options={config.domains.map((d) => ({ value: d.id, label: d.name }))} onChange={(v) => set({ domain: v })} />
      <SelectField label="Canal" value={draft.laneId} options={config.lanes.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => set({ laneId: v })} />
      <SelectField label="Nature" value={draft.nature} options={NATURE_KEYS.map((k) => ({ value: k, label: config.natures[k].label }))} onChange={(v) => set({ nature: v as NatureKey })} />
      <SelectField label="Criticité" value={draft.criticality} options={CRITICALITY_KEYS.map((k) => ({ value: k, label: config.criticalities[k].label }))} onChange={(v) => set({ criticality: v as Criticality })} />
    </div>
  );
}

/**
 * The QuickAdd modal (« Nouveau sujet »).
 * Inputs: QuickAddProps — the runtime config and the close/create
 * callbacks.
 * Output: overlay + modal; the bar wears the selected domain color; Créer
 * stays disabled until the title is non-blank, then calls onCreate with
 * the trimmed title (the server puts the card in the first column).
 * Failure modes: none.
 */
export function QuickAdd({ config, onClose, onCreate }: QuickAddProps) {
  const [draft, setDraft] = useState<QuickAddInput>(() => initialInput(config));
  const set = (patch: Partial<QuickAddInput>) => setDraft((current) => ({ ...current, ...patch }));
  const valid = draft.title.trim().length > 0;
  const domain = config.domains.find((entry) => entry.id === draft.domain);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <span className="modal-bar" style={{ background: domain?.color ?? "#94a3b8" }} />
        <div className="modal-body">
          <div className="modal-top">
            <h2 className="modal-name">Nouveau sujet</h2>
            <button className="x" onClick={onClose}>✕</button>
          </div>
          <div className="intake-note">Entre dans <b>{config.columns[0]!.name}</b> — tout sujet arrive par la gauche.</div>
          <Field label="Nom du sujet *"><input className="inp" autoFocus value={draft.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <SelectGrid draft={draft} config={config} set={set} />
          <Field label="Chef de projet"><input className="inp" value={draft.owner} onChange={(e) => set({ owner: e.target.value })} /></Field>
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>Annuler</button>
            <button className="btn primary" disabled={!valid} onClick={() => onCreate({ ...draft, title: draft.title.trim() })}>Créer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
