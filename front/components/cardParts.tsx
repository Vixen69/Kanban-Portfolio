// Small shared pieces of both card renderings (design board.jsx): the
// criticality mark, the type tag, the estimate bar, the custom-field
// badges and the age pill. Pure presentational — all data comes as props.

import type { CSSProperties } from "react";
import type {
  AgeThresholds,
  CardState,
  Criticality,
  CustomValue,
  FieldDef,
  ProjectType,
} from "../../core/types.ts";
import { ageCategory, ageLabel } from "../../core/aging.ts";

/**
 * Criticality marker: top = gold star, major = slate pip, normal = none.
 * Inputs: c — the card's criticality; big — expanded-card variant.
 * Output: the marker element, or null for "normal". Failure modes: none.
 */
export function CritMark({ c, big }: { c: Criticality; big?: boolean }) {
  if (c === "top") {
    return <span className="crit-star" style={{ fontSize: big ? 14 : 10 }}>{"★"}</span>;
  }
  if (c === "major") {
    return <span className="crit-pip" style={{ width: big ? 7 : 5, height: big ? 7 : 5 }} />;
  }
  return null;
}

/**
 * Prominent type-of-project tag — deliberately more visible than the
 * domain accent (design opinion).
 * Inputs: type — the resolved ProjectType, or null for untyped cards;
 * big — expanded-card variant (full name instead of the short code).
 * Output: the filled color pill, or null when the card has no type.
 * Failure modes: none.
 */
export function TypeTag({ type, big }: { type: ProjectType | null; big?: boolean }) {
  if (type === null) return null;
  return (
    <span className={"type-tag" + (big ? " big" : "")} style={{ background: type.color }} title={type.name}>
      {big ? type.name : type.short}
    </span>
  );
}

/**
 * Compact estimate read-out (meilleur estimé vs consommé). The budget pair
 * (k€) wins when the card has one, else the effort pair (j.h).
 * Input: the card state.
 * Output: label + progress track (accent fill, warn at >= 85 %, danger
 * when over), or null when the card has neither estimate.
 * Failure modes: none (a zero estimate renders an empty 0 % track).
 */
export function EstimeBar({ card }: { card: CardState }) {
  const est = card.budgetEstimated ?? card.effortEstimated;
  if (est === null) return null;
  const useBudget = card.budgetEstimated !== null;
  const cons = (useBudget ? card.budgetConsumed : card.effortConsumed) ?? 0;
  const unit = useBudget ? "k€" : "j.h";
  const pct = est ? Math.round((cons / est) * 100) : 0;
  const over = cons > est;
  return (
    <div className="ec-row" title={`Meilleur estimé ${est} ${unit} · Consommé ${cons} ${unit}`}>
      <span className="ec-label">{cons} / {est} {unit}</span>
      <span className="ec-track">
        <span
          className="ec-fill"
          style={{
            width: Math.min(100, pct) + "%",
            background: over ? "var(--danger)" : pct >= 85 ? "var(--warn)" : "var(--accent)",
          }}
        />
      </span>
    </div>
  );
}

// Select options carry a color; every other field type gets the neutral
// badge tint (design board.jsx CustomBadges).
function badgeStyle(field: FieldDef, value: CustomValue): CSSProperties {
  const option =
    field.type === "select" ? (field.options ?? []).find((o) => o.label === value) : undefined;
  if (option === undefined) return { background: "#e8ecf3", color: "#334155" };
  return {
    background: `color-mix(in oklab, ${option.color} 16%, #fff)`,
    color: `color-mix(in oklab, ${option.color} 62%, #0f172a)`,
  };
}

/**
 * Badges for the custom fields pinned to the card (admin "badge" checkbox).
 * Inputs: card — provides the custom values; fields — the config field
 * definitions (only showOnCard ones render).
 * Output: one badge per pinned field with a non-empty value (true renders
 * the field name; select values tint the badge with the option color), or
 * null when no field is pinned.
 * Failure modes: none — empty/false/missing values simply render nothing.
 */
export function CustomBadges({ card, fields }: { card: CardState; fields: FieldDef[] }) {
  const pinned = fields.filter((field) => field.showOnCard);
  if (pinned.length === 0) return null;
  return (
    <>
      {pinned.map((field) => {
        const value = card.custom[field.id];
        if (value == null || value === "" || value === false) return null;
        return (
          <span key={field.id} className="badge" style={badgeStyle(field, value)}>
            {value === true ? field.name : String(value)}
          </span>
        );
      })}
    </>
  );
}

/**
 * The age pill a card wears (design v9: the text carries the age signal —
 * no background darkening).
 * Inputs: days — days in the current column; age — the config thresholds.
 * Output: a span "3j"/"2s"/"4m", warn-colored from "aging" and
 * danger-colored from "stale" via CSS classes. Failure modes: none.
 */
export function AgeText({ days, age }: { days: number; age: AgeThresholds }) {
  const cat = ageCategory(days, age);
  const cls = cat === "stale" ? "age stale" : cat === "aging" ? "age aging" : "age";
  return <span className={cls}>{ageLabel(days)}</span>;
}
