// Tab panes of the board-configuration panel (design/admin.jsx). Each pane
// edits one slice of the DRAFT config owned by AdminPanel; nothing applies
// until « Appliquer ». Structure | Catégories | Champs de carte.

import type {
  BoardConfig,
  Column,
  Criticality,
  FieldDef,
  FieldType,
  GateCode,
  Lane,
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

// Move list[i] one step up/down, returning a new list.
function moveItem<T>(list: T[], i: number, dir: number): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  const swapped = next[i] as T;
  next[i] = next[j] as T;
  next[j] = swapped;
  return next;
}

// Column rows: reorder, rename, WIP limit, entry gate, delete (min 2 kept).
function ColumnRows({ columns, onChange }: { columns: Column[]; onChange: (columns: Column[]) => void }) {
  const upd = (i: number, part: Partial<Column>) => onChange(columns.map((c, idx) => (idx === i ? { ...c, ...part } : c)));
  return (
    <>
      {columns.map((c, i) => (
        <div className="arow" key={c.id}>
          <span className="amove">
            <button className="abtn" disabled={i === 0} onClick={() => onChange(moveItem(columns, i, -1))}>↑</button>
            <button className="abtn" disabled={i === columns.length - 1} onClick={() => onChange(moveItem(columns, i, 1))}>↓</button>
          </span>
          <input className="ainp grow" value={c.name} onChange={(e) => upd(i, { name: e.target.value })} />
          <input className="ainp wip-inp" type="number" min="0" placeholder="WIP" title="Limite WIP (vide = aucune)" value={c.wip ?? ""} onChange={(e) => upd(i, { wip: e.target.value === "" ? null : Number(e.target.value) })} />
          <select className="ainp gate-inp" title="Gate à l'entrée" value={c.gate ?? ""} onChange={(e) => upd(i, { gate: (e.target.value || null) as GateCode | null })}>
            <option value="">— gate</option>
            <option value="DoR">DoR</option>
            <option value="DoD">DoD</option>
          </select>
          <button className="abtn del" disabled={columns.length <= 2} title="Supprimer (les sujets seront déplacés)" onClick={() => onChange(columns.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button className="a-add" onClick={() => onChange([...columns, { id: slugId("colonne"), name: "Nouvelle colonne", wip: null, gate: null, note: "" }])}>+ Ajouter une colonne</button>
    </>
  );
}

// Lane rows: reorder, rename, nature subtitle, delete (min 1 kept).
function LaneRows({ lanes, onChange }: { lanes: Lane[]; onChange: (lanes: Lane[]) => void }) {
  const upd = (i: number, part: Partial<Lane>) => onChange(lanes.map((l, idx) => (idx === i ? { ...l, ...part } : l)));
  return (
    <>
      {lanes.map((l, i) => (
        <div className="arow" key={l.id}>
          <span className="amove">
            <button className="abtn" disabled={i === 0} onClick={() => onChange(moveItem(lanes, i, -1))}>↑</button>
            <button className="abtn" disabled={i === lanes.length - 1} onClick={() => onChange(moveItem(lanes, i, 1))}>↓</button>
          </span>
          <input className="ainp grow" value={l.name} onChange={(e) => upd(i, { name: e.target.value })} />
          <input className="ainp nature-inp" title="Sous-titre (nature)" value={l.nature} onChange={(e) => upd(i, { nature: e.target.value })} />
          <button className="abtn del" disabled={lanes.length <= 1} title="Supprimer (les sujets seront déplacés)" onClick={() => onChange(lanes.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button className="a-add" onClick={() => onChange([...lanes, { id: slugId("canal"), name: "Nouveau canal", nature: "", detail: "" }])}>+ Ajouter un canal</button>
    </>
  );
}

/**
 * « Structure » pane: column order/name/WIP/gate rows and lane order/name/
 * nature rows, with their add buttons.
 * Inputs: TabProps (draft config + patch callback).
 * Output: the pane DOM. Failure modes: none — minimum counts (2 columns,
 * 1 lane) are enforced by disabling the delete buttons.
 */
export function StructureTab({ draft, patch }: TabProps) {
  return (
    <div className="apane">
      <div className="asection-label">Colonnes (flux, de gauche à droite)</div>
      <ColumnRows columns={draft.columns} onChange={(columns) => patch({ columns })} />
      <div className="asection-label">Canaux (couloirs, de haut en bas)</div>
      <LaneRows lanes={draft.lanes} onChange={(lanes) => patch({ lanes })} />
    </div>
  );
}

// Domains and project types share one row shape: color, name, short code.
interface PaletteItem {
  id: string;
  name: string;
  short: string;
  color: string;
}

// Shared color+name+short rows for domains and project types (min 1 kept).
function PaletteRows({ items, onChange, shortTitle, addLabel, makeNew }: { items: PaletteItem[]; onChange: (items: PaletteItem[]) => void; shortTitle: string; addLabel: string; makeNew: (index: number) => PaletteItem }) {
  const upd = (i: number, part: Partial<PaletteItem>) => onChange(items.map((x, idx) => (idx === i ? { ...x, ...part } : x)));
  return (
    <>
      {items.map((d, i) => (
        <div className="arow" key={d.id}>
          <input className="acolor" type="color" value={d.color} onChange={(e) => upd(i, { color: e.target.value })} />
          <input className="ainp grow" value={d.name} onChange={(e) => upd(i, { name: e.target.value })} />
          <input className="ainp short-inp" maxLength={3} title={shortTitle} value={d.short} onChange={(e) => upd(i, { short: e.target.value.toUpperCase() })} />
          <button className="abtn del" disabled={items.length <= 1} onClick={() => onChange(items.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button className="a-add" onClick={() => onChange([...items, makeNew(items.length)])}>{addLabel}</button>
    </>
  );
}

// Fixed vocabularies: keys never change, only labels/colors do.
const NATURE_KEYS: NatureKey[] = ["simple", "complicated", "complex"];
const CRIT_KEYS: Criticality[] = ["top", "major", "normal"];
const CRIT_ICONS: Record<Criticality, string> = { top: "★", major: "◆", normal: "·" };

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
 * rows), nature labels/colors and criticality labels. Natures and
 * criticalities are renamable, never extensible (fixed keys).
 * Inputs: TabProps (draft config + patch callback).
 * Output: the pane DOM. Failure modes: none.
 */
export function CategoriesTab({ draft, patch }: TabProps) {
  return (
    <div className="apane">
      <div className="asection-label">Domaines RDOM</div>
      <PaletteRows items={draft.domains} onChange={(domains) => patch({ domains })} shortTitle="Code court (3 lettres)" addLabel="+ Ajouter un domaine" makeNew={(i) => ({ id: slugId("domaine"), name: "Nouveau domaine", short: "NEW", color: paletteColor(i) })} />
      <div className="asection-label">Types de projet (plus visibles que le domaine sur la carte)</div>
      <PaletteRows items={draft.types} onChange={(types) => patch({ types })} shortTitle="Code court" addLabel="+ Ajouter un type" makeNew={(i) => ({ id: slugId("type"), name: "Nouveau type", short: "NEW", color: paletteColor(i) })} />
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
