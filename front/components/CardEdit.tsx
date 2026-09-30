// Card edit form (design/modals.jsx CardDetail edit branch), a full modal
// of its own. Saving computes two deltas for App: a whitelisted CardPatch
// (only the fields that actually changed) and a move intent when the canal
// or colonne changed. Blocked state is NOT editable here (design v11): it
// is governed by the BLOCAGE section of the read mode, which enforces the
// mandatory reason.

import { useState } from "react";
import type { BoardConfig, CardPatch, CardState, Criticality, CustomValue, FieldDef } from "../../core/types.ts";
import { reconcileCardRefs, subDomainsOf } from "../../core/config.ts";
import { CARD_TEXT_LIMITS as CAP } from "../../core/card-input.ts";
import { effortDraftOf, effortPatchOf, type EffortDraft } from "../cardFacts.ts";
import { CRITICALITY_KEYS, CustomInput, Field, SelectField } from "./modalParts.tsx";
import { domainOptions, withDomainConfirmed } from "../domainMark.ts";

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

// Form state: numeric fields kept as strings for controlled inputs (the
// effort grid's are shared with QuickAdd, front/cardFacts.ts — ADR 057).
interface Draft extends EffortDraft {
  title: string; typeId: string; codename: string;
  domain: string; subDomain: string; laneId: string; columnId: string;
  criticality: Criticality; owner: string;
  custom: Record<string, CustomValue>; notes: string;
}

type SetDraft = (patch: Partial<Draft>) => void;

// Builds the initial form state; stale config references are remapped to
// the first config entry for display (reconcileCardRefs — never an event),
// except the domain: stale or empty reads as none (ADR 061).
function toDraft(card: CardState, config: BoardConfig): Draft {
  const refs = reconcileCardRefs(card, config);
  return {
    title: card.title, typeId: refs.typeId ?? "", codename: card.codename ?? "",
    domain: refs.domain, subDomain: refs.subDomain ?? "", laneId: refs.laneId, columnId: refs.columnId,
    criticality: card.criticality, owner: card.owner,
    ...effortDraftOf(card),
    custom: { ...card.custom }, notes: card.notes,
  };
}

// Every editable field of the form as a full CardPatch (before diffing).
function fullPatch(draft: Draft): CardPatch {
  return {
    title: draft.title.trim(), owner: draft.owner.trim(),
    domain: draft.domain, subDomain: draft.subDomain === "" ? null : draft.subDomain,
    criticality: draft.criticality,
    typeId: draft.typeId === "" ? null : draft.typeId,
    codename: draft.codename.trim() === "" ? null : draft.codename.trim(),
    ...effortPatchOf(draft),
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

/**
 * The « Code projet » input (« Modifier » and « Plus d'informations »),
 * capped like the middle (40 characters).
 * Inputs: the typed code, the change callback. Output: the labeled input.
 * Failure modes: none.
 */
export function CodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Field label="Code projet"><input className="inp" maxLength={CAP.codename} value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
}

/**
 * The « Sous-domaine » select, only when the domain declares sub-domains
 * (ADR 022) — a sub-domain always belongs to the card's own domain.
 * Inputs: the config, the domain id, the sub-domain id ("" = not
 * detailed), the change callback. Output: the select, or nothing.
 * Failure modes: none.
 */
export function SubDomainField({ config, domain, value, onChange }: {
  config: BoardConfig;
  domain: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const subs = subDomainsOf(config, domain);
  if (subs.length === 0) return null;
  return <SelectField label="Sous-domaine" value={value} options={[{ value: "", label: "— non détaillé —" }, ...subs.map((s) => ({ value: s.id, label: s.name }))]} onChange={onChange} />;
}

// Type de projet + Code projet row.
function TypeCodeRow({ draft, config, set }: { draft: Draft; config: BoardConfig; set: SetDraft }) {
  return (
    <div className="field-2col">
      <SelectField label="Type de projet" value={draft.typeId} options={config.types.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => set({ typeId: v })} />
      <CodeField value={draft.codename} onChange={(v) => set({ codename: v })} />
    </div>
  );
}

// Domaine (+ Sous-domaine when the domain is detailed, ADR 022) / Canal /
// Colonne / Criticité / Chef de projet grid. Changing the domain clears the
// sub-domain: a sub-domain never survives its domain. No Nature select
// (design v11): nature follows the canal — changing the canal IS the
// requalification.
// A card without domain (ADR 061) offers « — à attribuer — » until one is chosen (never a preselected domain).
function RefsGrid({ draft, config, set, initialDomain }: { draft: Draft; config: BoardConfig; set: SetDraft; initialDomain: string }) {
  return (
    <div className="field-2col">
      <SelectField label="Domaine" value={draft.domain} options={domainOptions(config, initialDomain)} onChange={(v) => set({ domain: v, subDomain: "" })} />
      <SubDomainField config={config} domain={draft.domain} value={draft.subDomain} onChange={(v) => set({ subDomain: v })} />
      <SelectField label="Canal" value={draft.laneId} options={config.lanes.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => set({ laneId: v })} />
      <SelectField label="Colonne" value={draft.columnId} options={config.columns.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => set({ columnId: v })} />
      <SelectField label="Criticité" value={draft.criticality} options={CRITICALITY_KEYS.map((k) => ({ value: k, label: config.criticalities[k].label }))} onChange={(v) => set({ criticality: v as Criticality })} />
      <Field label="Chef de projet"><input className="inp" maxLength={CAP.owner} value={draft.owner} onChange={(e) => set({ owner: e.target.value })} /></Field>
    </div>
  );
}

/**
 * Effort (j.h), plan de charge, RDR date, ressources and budget (k€) grid
 * (design v11 edit branch — all four budget figures plus the RDR date),
 * shared by « Modifier » and « Plus d'informations » (ADR 057).
 * Inputs: the typed EffortDraft, the change callback. Output: the grid.
 * Failure modes: none — the text is converted by front/cardFacts.ts.
 */
export function EffortGrid({ draft, set }: { draft: EffortDraft; set: (patch: Partial<EffortDraft>) => void }) {
  return (
    <div className="field-2col">
      <Field label="Meilleur estimé (j.h)"><input className="inp" type="number" min="0" value={draft.effortEstimated} onChange={(e) => set({ effortEstimated: e.target.value })} /></Field>
      <Field label="Consommé (j.h)"><input className="inp" type="number" min="0" value={draft.effortConsumed} onChange={(e) => set({ effortConsumed: e.target.value })} /></Field>
      <Field label="Plan de charge"><input className="inp" maxLength={CAP.loadPlan} value={draft.loadPlan} onChange={(e) => set({ loadPlan: e.target.value })} /></Field>
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
    const patch = withDomainConfirmed(diffPatch(fullPatch(initial), fullPatch(draft)), draft.domain);
    props.onSave(patch, buildMove(initial, draft));
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
          <Field label="Nom"><input className="inp" maxLength={CAP.title} value={draft.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <TypeCodeRow draft={draft} config={config} set={set} />
          <RefsGrid draft={draft} config={config} set={set} initialDomain={reconcileCardRefs(card, config).domain} />
          <EffortGrid draft={draft} set={set} />
          <CustomSection fields={config.fields} custom={draft.custom} onChange={(id, value) => setDraft((c) => ({ ...c, custom: { ...c.custom, [id]: value } }))} />
          <Field label="Notes"><textarea className="inp" rows={2} maxLength={CAP.notes} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
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
