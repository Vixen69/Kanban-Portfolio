// Shared modal building blocks, ported from design/modals.jsx helpers:
// the colored detail tag, the labeled form field, a generic labeled select
// and the read/edit renderers for admin-defined custom card fields.

import type { ReactNode } from "react";
import type { Criticality, CustomValue, FieldDef } from "../../core/types.ts";

/** Design order of the criticality keys in the edit/create selects. */
export const CRITICALITY_KEYS: readonly Criticality[] = ["normal", "major", "top"];

/**
 * Colored pill of the detail tag row (domain, canal, colonne, nature…).
 * Inputs: the accent color, an optional solid flag (filled TOP badge), the
 * label as children.
 * Output: a span.dtag — solid is filled; otherwise a tinted outline derived
 * from the color via color-mix (design formula). Failure modes: none.
 */
export function Tag({ color, solid, children }: { color: string; solid?: boolean; children: ReactNode }) {
  const style = solid
    ? { background: color, color: "#1a1505", borderColor: color }
    : {
        color: `color-mix(in oklab, ${color} 60%, #0f172a)`,
        borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
        background: `color-mix(in oklab, ${color} 10%, #fff)`,
      };
  return <span className="dtag" style={style}>{children}</span>;
}

/**
 * A labeled form field (label.field wrapping span.field-label + control).
 * Inputs: the French label and the control as children.
 * Output: the label element. Failure modes: none.
 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/** One option of a SelectField. */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A labeled select over {value, label} options (edit form and QuickAdd).
 * Inputs: the French label, the selected value, the options, the change
 * callback (receives the raw option value).
 * Output: a Field wrapping a select.inp. Failure modes: none — a value
 * absent from the options renders as an empty selection.
 */
export function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select className="inp" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value || "__empty"} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Field>
  );
}

/**
 * One custom field value in read mode (kv-grid row), or nothing when empty.
 * Inputs: the FieldDef and the card's stored value (may be undefined).
 * Output: a div.kv, null for empty/false values; date values render as
 * French dates. Failure modes: an unparseable date falls back to the raw
 * string.
 */
export function CustomKV({ field, value }: { field: FieldDef; value: CustomValue | undefined }) {
  if (value == null || value === "" || value === false) return null;
  let text = value === true ? "Oui" : String(value);
  if (field.type === "date" && typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) text = parsed.toLocaleDateString("fr-FR");
  }
  return (
    <div className="kv"><span>{field.name}</span><b>{text}</b></div>
  );
}

/**
 * Edit input for one custom field, switched on the field type.
 * Inputs: the FieldDef, the current value (may be undefined) and the change
 * callback receiving the new CustomValue.
 * Output: a toggle row (checkbox), a select (select) or a typed input
 * (text/number/date/person as text). Failure modes: none — an empty number
 * input reports the empty string, matching the design behavior.
 */
export function CustomInput({ field, value, onChange }: {
  field: FieldDef;
  value: CustomValue | undefined;
  onChange: (value: CustomValue) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <label className="toggle-row">
        <input type="checkbox" checked={!!value} onChange={(event) => onChange(event.target.checked)} />
        <span>{field.name}</span>
      </label>
    );
  }
  if (field.type === "select") {
    const options: SelectOption[] = [
      { value: "", label: "—" },
      ...(field.options ?? []).map((option) => ({ value: option.label, label: option.label })),
    ];
    return (
      <SelectField label={field.name} value={typeof value === "string" ? value : ""} options={options} onChange={onChange} />
    );
  }
  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  return (
    <Field label={field.name}>
      <input
        className="inp"
        type={inputType}
        value={value == null ? "" : String(value)}
        onChange={(event) =>
          onChange(field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)
        }
      />
    </Field>
  );
}
