// Card edit form (design/modals.jsx CardDetail edit branch), a full modal
// of its own. Saving computes two deltas for App: a whitelisted CardPatch
// (only the fields that actually changed) and a move intent when the canal
// or colonne changed. Blocked state is NOT editable here (design v11): it
// is governed by the BLOCAGE section of the read mode, which enforces the
// mandatory reason.

import { useState } from "react";
import type { BoardConfig, CardPatch, CardState, Criticality, CustomValue, FieldDef } from "../../core/types.ts";
import { reconcileCardRefs } from "../../core/config.ts";
import { CRITICALITY_KEYS, CustomInput, Field, SelectField } from "./modalParts.tsx";

/** Move intent computed on save when the card changed cell. */
export interface EditMove {
  laneId: string;
  columnId: string;
}

/** Props of the card edit modal. */
export interface CardEditProps {
  card: CardState;
  config: BoardConfig;
  /** Overlay click and ✕ — closes the whole card modal (design behavior). */
  onClose: () => void;
  /** « Annuler » — back to the read-mode detail, nothing saved. */
  onCancel: () => void;
  /**
   * Called on Enregistrer with the diffed patch (may be empty when nothing
   * changed — App should skip the edit intent then) and the move intent
   * or null.
   */
  onSave: (patch: CardPatch, move: EditMove | null) => void;
  onDelete: (id: string) => void;
}

// Form state: numeric fields kept as strings for controlled inputs.
interface Draft {
  title: string; typeId: string; codename: string;
  domain: string; laneId: string; columnId: string;
  criticality: Criticality; owner: string;
  effortEstimated: string; effortConsumed: string;
  loadPlan: string; resourcesCsv: string; dateRdr: string;
  budgetEstimated: string; budgetConsumed: string;
  budgetRdli: string; budgetEngaged: string;
  custom: Record<string, CustomValue>; notes: string;
}

type SetDraft = (patch: Partial<Draft>) => void;

function numText(value: number | null): string {
  return value === null ? "" : String(value);
}

function numOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// Builds the initial form state; stale config references are remapped to
// the first config entry for display (reconcileCardRefs — never an event).
function toDraft(card: CardState, config: BoardConfig): Draft {
  const refs = reconcileCardRefs(card, config);
  return {
    title: card.title, typeId: refs.typeId ?? "", codename: card.codename ?? "",
    domain: refs.domain, laneId: refs.laneId, columnId: refs.columnId,
    criticality: card.criticality, owner: card.owner,
    effortEstimated: numText(card.effortEstimated), effortConsumed: numText(card.effortConsumed),
    loadPlan: card.loadPlan ?? "", resourcesCsv: card.resources.join(", "),
    dateRdr: card.dateRdr === null ? "" : card.dateRdr.slice(0, 10),
    budgetEstimated: numText(card.budgetEstimated), budgetConsumed: numText(card.budgetConsumed),
    budgetRdli: numText(card.budgetRdli), budgetEngaged: numText(card.budgetEngaged),
    custom: { ...card.custom }, notes: card.notes,
  };
}

// Every editable field of the form as a full CardPatch (before diffing).
function fullPatch(draft: Draft): CardPatch {
  return {
    title: draft.title.trim(), owner: draft.owner.trim(),
    domain: draft.domain, criticality: draft.criticality,
    typeId: draft.typeId === "" ? null : draft.typeId,
    codename: draft.codename.trim() === "" ? null : draft.codename.trim(),
    effortEstimated: numOrNull(draft.effortEstimated), effortConsumed: numOrNull(draft.effortConsumed),
    budgetEstimated: numOrNull(draft.budgetEstimated), budgetConsumed: numOrNull(draft.budgetConsumed),
    budgetRdli: numOrNull(draft.budgetRdli), budgetEngaged: numOrNull(draft.budgetEngaged),
    dateRdr: draft.dateRdr === "" ? null : new Date(draft.dateRdr).toISOString(),
    loadPlan: draft.loadPlan.trim() === "" ? null : draft.loadPlan.trim(),
    resources: draft.resourcesCsv.split(",").map((entry) => entry.trim()).filter(Boolean),
    custom: draft.custom, notes: draft.notes,
  };
}

// Keeps only the entries of `after` whose value differs from `before`.
function diffPatch(before: CardPatch, after: CardPatch): CardPatch {
  const patch: CardPatch = {};
  for (const key of Object.keys(after) as (keyof CardPatch)[]) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      (patch as Record<keyof CardPatch, unknown>)[key] = after[key] ?? null;
    }
  }
  return patch;
}

// Move intent when the canal or colonne select changed, else null.
function buildMove(initial: Draft, draft: Draft): EditMove | null {
  if (draft.laneId === initial.laneId && draft.columnId === initial.columnId) return null;
  return { laneId: draft.laneId, columnId: draft.columnId };
}

// Type de projet + Code projet row.
function TypeCodeRow({ draft, config, set }: { draft: Draft; config: BoardConfig; set: SetDraft }) {
  return (
    <div className="field-2col">
      <SelectField label="Type de projet" value={draft.typeId} options={config.types.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => set({ typeId: v })} />
      <Field label="Code projet"><input className="inp" value={draft.codename} onChange={(e) => set({ codename: e.target.value })} /></Field>
    </div>
  );
}

// Domaine / Canal / Colonne / Criticité / Chef de projet grid. No Nature
// select (design v11): nature follows the canal — changing the canal IS the
// requalification.
function RefsGrid({ draft, config, set }: { draft: Draft; config: BoardConfig; set: SetDraft }) {
  return (
    <div className="field-2col">
      <SelectField label="Domaine RDOM" value={draft.domain} options={config.domains.map((d) => ({ value: d.id, label: d.name }))} onChange={(v) => set({ domain: v })} />
      <SelectField label="Canal" value={draft.laneId} options={config.lanes.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => set({ laneId: v })} />
      <SelectField label="Colonne" value={draft.columnId} options={config.columns.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => set({ columnId: v })} />
      <SelectField label="Criticité" value={draft.criticality} options={CRITICALITY_KEYS.map((k) => ({ value: k, label: config.criticalities[k].label }))} onChange={(v) => set({ criticality: v as Criticality })} />
      <Field label="Chef de projet"><input className="inp" value={draft.owner} onChange={(e) => set({ owner: e.target.value })} /></Field>
    </div>
  );
}

// Effort (j.h), plan de charge, RDR date, ressources and budget (k€) grid
// (design v11 edit branch — all four budget figures plus the RDR date).
function EffortGrid({ draft, set }: { draft: Draft; set: SetDraft }) {
  return (
    <div className="field-2col">
      <Field label="Meilleur estimé (j.h)"><input className="inp" type="number" min="0" value={draft.effortEstimated} onChange={(e) => set({ effortEstimated: e.target.value })} /></Field>
      <Field label="Consommé (j.h)"><input className="inp" type="number" min="0" value={draft.effortConsumed} onChange={(e) => set({ effortConsumed: e.target.value })} /></Field>
      <Field label="Plan de charge"><input className="inp" value={draft.loadPlan} onChange={(e) => set({ loadPlan: e.target.value })} /></Field>
      <Field label="Date RDR (livraison) projetée"><input className="inp" type="date" value={draft.dateRdr} onChange={(e) => set({ dateRdr: e.target.value })} /></Field>
      <Field label="Ressources clés (virgules)"><input className="inp" value={draft.resourcesCsv} onChange={(e) => set({ resourcesCsv: e.target.value })} /></Field>
      <Field label="Budget estimé (k€)"><input className="inp" type="number" min="0" value={draft.budgetEstimated} onChange={(e) => set({ budgetEstimated: e.target.value })} /></Field>
      <Field label="Budget consommé / réalisé (k€)"><input className="inp" type="number" min="0" value={draft.budgetConsumed} onChange={(e) => set({ budgetConsumed: e.target.value })} /></Field>
      <Field label="Enveloppe RDLI (k€)"><input className="inp" type="number" min="0" value={draft.budgetRdli} onChange={(e) => set({ budgetRdli: e.target.value })} /></Field>
      <Field label="Budget engagé (k€)"><input className="inp" type="number" min="0" value={draft.budgetEngaged} onChange={(e) => set({ budgetEngaged: e.target.value })} /></Field>
    </div>
  );
}

// Champs personnalisés section (only when the config defines fields).
function CustomSection({ fields, custom, onChange }: {
  fields: FieldDef[];
  custom: Record<string, CustomValue>;
  onChange: (id: string, value: CustomValue) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="custom-section">
      <div className="field-label" style={{ marginBottom: 7 }}>Champs personnalisés</div>
      {fields.map((field) => (
        <CustomInput key={field.id} field={field} value={custom[field.id]} onChange={(value) => onChange(field.id, value)} />
      ))}
    </div>
  );
}

/**
 * The card edit modal (design "Modifier" form).
 * Inputs: CardEditProps — the folded card, the runtime config and the
 * cancel/save/delete callbacks.
 * Output: overlay + modal; Enregistrer calls onSave(patch, move) where
 * patch is the diffed CardPatch (possibly empty) and move the cell change
 * or null; Supprimer calls onDelete(card.id); overlay/✕ call onClose
 * (whole modal), « Annuler » calls onCancel (back to detail).
 * Failure modes: none — unparseable numbers save as null and an empty
 * title disables Enregistrer (deliberate guard: the middle rejects empty
 * titles; the disabled button carries an explanatory tooltip).
 */
export function CardEdit(props: CardEditProps) {
  const { card, config } = props;
  const [draft, setDraft] = useState<Draft>(() => toDraft(card, config));
  const set: SetDraft = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const barDomain = config.domains.find((entry) => entry.id === draft.domain);
  const save = () => {
    const initial = toDraft(card, config);
    props.onSave(diffPatch(fullPatch(initial), fullPatch(draft)), buildMove(initial, draft));
  };
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <span className="modal-bar" style={{ background: card.blocked ? "#b91c1c" : barDomain?.color ?? "#94a3b8" }} />
        <div className="modal-body">
          <div className="modal-top">
            <h2 className="modal-name">Modifier</h2>
            <button className="x" onClick={props.onClose}>✕</button>
          </div>
          <Field label="Nom"><input className="inp" value={draft.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <TypeCodeRow draft={draft} config={config} set={set} />
          <RefsGrid draft={draft} config={config} set={set} />
          <EffortGrid draft={draft} set={set} />
          <CustomSection fields={config.fields} custom={draft.custom} onChange={(id, value) => setDraft((c) => ({ ...c, custom: { ...c.custom, [id]: value } }))} />
          <Field label="Notes"><textarea className="inp" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          <div className="modal-actions">
            <button className="btn danger" onClick={() => props.onDelete(card.id)}>Supprimer</button>
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={props.onCancel}>Annuler</button>
            <button className="btn primary" disabled={draft.title.trim() === ""}
              title={draft.title.trim() === "" ? "Le nom est requis" : undefined}
              onClick={save}>Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
