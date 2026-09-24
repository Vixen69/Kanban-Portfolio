// Tab panes of the board-configuration panel (design/admin.jsx). Each pane
// edits one slice of the DRAFT config owned by AdminPanel; nothing applies
// until « Appliquer ». Catégories | Champs de carte — the WIP grid lives in
// adminWip.tsx (ADR 046: the Structure pane is gone, columns and canals
// are the versioned model's).

import type {
  BoardConfig,
  Criticality,
  FieldDef,
  FieldType,
  NatureKey,
  NatureStyle,
} from "../../core/types.ts";

/** Props shared by the three tab panes: the draft and its patch callback. */
export interface TabProps {
  draft: BoardConfig;
  patch: (part: Partial<BoardConfig>) => void;
}

// Input kinds offered by the custom-field editor (design FIELD_TYPES).
const FIELD_TYPES: { id: FieldType; label: string }[] = [
  { id: "text", label: "Texte" },
  { id: "number", label: "Nombre" },
  { id: "date", label: "Date" },
  { id: "select", label: "Choix (liste)" },
  { id: "checkbox", label: "Case à cocher" },
  { id: "person", label: "Personne" },
];

// Colors handed to new domains, types and select options (design palette).
const OPTION_PALETTE = ["#2563eb", "#047857", "#b45309", "#7c3aed", "#dc2626", "#0e7490", "#be185d", "#4d7c0f"];

function paletteColor(index: number): string {
  return OPTION_PALETTE[index % OPTION_PALETTE.length] ?? "#2563eb";
}

// Stable-ish id from a label (new columns/lanes/domains/types/fields).
function slugId(label: string): string {
  const base = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (base || "item") + "_" + Math.random().toString(36).slice(2, 6);
}

// Domains and project types share one row shape: color, name, short code.
interface PaletteItem {
  id: string;
  name: string;
  short: string;
  color: string;
}

// Shared color+name+short rows for domains and project types: renamed and
// recoloured here, never added or removed (ADR 046 — the importer resolves
// them through the versioned model's aliases and markers).
function PaletteRows({ items, onChange, shortTitle }: { items: PaletteItem[]; onChange: (items: PaletteItem[]) => void; shortTitle: string }) {
  const upd = (i: number, part: Partial<PaletteItem>) => onChange(items.map((x, idx) => (idx === i ? { ...x, ...part } : x)));
  return (
    <>
      {items.map((d, i) => (
        <div className="arow" key={d.id}>
          <input className="acolor" type="color" value={d.color} onChange={(e) => upd(i, { color: e.target.value })} />
          <input className="ainp grow" value={d.name} onChange={(e) => upd(i, { name: e.target.value })} />
          <input className="ainp short-inp" maxLength={3} title={shortTitle} value={d.short} onChange={(e) => upd(i, { short: e.target.value.toUpperCase() })} />
        </div>
      ))}
    </>
  );
}

// Fixed vocabularies: keys never change, only labels/colors do.
const NATURE_KEYS: NatureKey[] = ["simple", "complicated", "complex"];
const CRIT_KEYS: Criticality[] = ["top", "major", "normal"];
const CRIT_ICONS: Record<Criticality, string> = { top: "★", major: "•", normal: "·" };

// Nature rows: renamable label and color (bg follows fg at 13% alpha).
function NatureRows({ draft, patch }: TabProps) {
  const upd = (key: NatureKey, part: Partial<NatureStyle>) =>
    patch({ natures: { ...draft.natures, [key]: { ...draft.natures[key], ...part } } });
  return (
    <>
      {NATURE_KEYS.map((key) => (
        <div className="arow" key={key}>
          <input className="acolor" type="color" value={draft.natures[key].fg} onChange={(e) => upd(key, { fg: e.target.value, bg: e.target.value + "22" })} />
          <input className="ainp grow" value={draft.natures[key].label} onChange={(e) => upd(key, { label: e.target.value })} />
        </div>
      ))}
    </>
  );
}

// Criticality rows: fixed icon per key, renamable label; the badge tracks
// the upper-cased label when the criticality carries a badge.
function CritRows({ draft, patch }: TabProps) {
  return (
    <>
      {CRIT_KEYS.map((key) => {
        const c = draft.criticalities[key];
        return (
          <div className="arow" key={key}>
            <span className="crit-key">{CRIT_ICONS[key]}</span>
            <input className="ainp grow" value={c.label} onChange={(e) => patch({ criticalities: { ...draft.criticalities, [key]: { ...c, label: e.target.value, badge: c.badge !== null ? e.target.value.toUpperCase() : null } } })} />
          </div>
        );
      })}
    </>
  );
}

/**
 * « Catégories » pane: RDOM domains and project types (color/name/short
 * rows), nature labels/colors and criticality labels. Everything is
 * renamable, nothing extensible (ADR 046): a new domain or type is the
 * versioned model's, with the aliases the importer reads it from.
 * Inputs: TabProps (draft config + patch callback).
 * Output: the pane DOM. Failure modes: none.
 */
export function CategoriesTab({ draft, patch }: TabProps) {
  return (
    <div className="apane">
      <div className="asection-label">Domaines — renommer, recolorer (l’ajout, les alias et les sous-domaines se déclarent dans config/board.json)</div>
      <PaletteRows items={draft.domains} onChange={(domains) => patch({ domains })} shortTitle="Code court (3 lettres)" />
      <div className="asection-label">Types de projet — renommer, recolorer (l’ajout se déclare dans config/board.json, avec ses alias)</div>
      <PaletteRows items={draft.types} onChange={(types) => patch({ types })} shortTitle="Code court" />
      <div className="asection-label">Natures (détectées à la RDO — renommables, non extensibles)</div>
      <NatureRows draft={draft} patch={patch} />
      <div className="asection-label">Criticités (renommables)</div>
      <CritRows draft={draft} patch={patch} />
    </div>
  );
}

// One custom-field editor row (+ options line for "select" fields).
function FieldRow({ field, onChange, onDelete }: { field: FieldDef; onChange: (part: Partial<FieldDef>) => void; onDelete: () => void }) {
  const setOptions = (raw: string) => {
    const labels = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const prev = field.options ?? [];
    onChange({ options: labels.map((label, idx) => prev.find((o) => o.label === label) ?? { label, color: paletteColor(idx) }) });
  };
  return (
    <div className="afield">
      <div className="arow">
        <input className="ainp grow" placeholder="Nom du champ" value={field.name} onChange={(e) => onChange({ name: e.target.value })} />
        <select className="ainp type-inp" value={field.type} onChange={(e) => onChange({ type: e.target.value as FieldType })}>
          {FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <label className="a-check" title="Afficher comme badge sur la carte (mode focus)">
          <input type="checkbox" checked={field.showOnCard} onChange={(e) => onChange({ showOnCard: e.target.checked })} /> badge
        </label>
        <button className="abtn del" onClick={onDelete}>✕</button>
      </div>
      {field.type === "select" && (
        <input className="ainp opt-inp" placeholder="Options séparées par des virgules, ex. S1, S2, S3" value={(field.options ?? []).map((o) => o.label).join(", ")} onChange={(e) => setOptions(e.target.value)} />
      )}
    </div>
  );
}

/**
 * « Champs de carte » pane: admin-defined custom fields (name, input type,
 * optional card badge; comma-separated options for "select" fields).
 * Inputs: TabProps (draft config + patch callback).
 * Output: the pane DOM. Failure modes: none.
 */
export function FieldsTab({ draft, patch }: TabProps) {
  const upd = (i: number, part: Partial<FieldDef>) =>
    patch({ fields: draft.fields.map((f, idx) => (idx === i ? { ...f, ...part } : f)) });
  return (
    <div className="apane">
      <div className="asection-label">Champs personnalisés (panneau de détail · badge optionnel sur la carte)</div>
      {draft.fields.length === 0 && <div className="a-empty">Aucun champ personnalisé. Les cartes restent minimales par défaut.</div>}
      {draft.fields.map((f, i) => (
        <FieldRow key={f.id} field={f} onChange={(part) => upd(i, part)} onDelete={() => patch({ fields: draft.fields.filter((_, idx) => idx !== i) })} />
      ))}
      <button className="a-add" onClick={() => patch({ fields: [...draft.fields, { id: slugId("champ"), name: "Nouveau champ", type: "text", showOnCard: false }] })}>+ Ajouter un champ</button>
    </div>
  );
}
