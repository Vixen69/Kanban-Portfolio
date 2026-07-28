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

// Gold crown for a top-criticality card (design/board.jsx CrownSVG).
function CrownSVG({ s }: { s: number }) {
  return (
    <svg className="crit-crown" width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 7l4.5 3.5L12 3l5.5 7.5L22 7l-1.8 12H3.8L2 7z" fill="#d4a017" stroke="#a16207" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Criticality marker: top = gold crown, major = gold star, normal = none.
 * Inputs: c — the card's criticality; big — expanded-card variant.
 * Output: the marker element, or null for "normal". Failure modes: none.
 */
export function CritMark({ c, big }: { c: Criticality; big?: boolean }) {
  if (c === "top") return <CrownSVG s={big ? 16 : 12} />;
  if (c === "major") {
    return <span className="crit-star" style={{ fontSize: big ? 14 : 11 }}>{"★"}</span>;
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
 * Compact budget/charge read-out of the expanded card (design v12): the
 * meilleur estimé in k€ next to the reste à faire in j.h. The progress bar
 * it replaces mixed two units on one track; these are the two figures a
 * stage is actually read on, so they are stated rather than drawn.
 * Input: the card state.
 * Output: the two-stat row, or null when the card carries neither an
 * estimate nor a plan de charge.
 * Failure modes: none — a card with no per-profile plan falls back to its
 * card-level effort (same rule as core/totals).
 */
export function EstimeBar({ card }: { card: CardState }) {
  const est = card.budgetEstimated ?? card.effortEstimated ?? 0;
  const plan = card.chargeByProfile;
  const jh = plan.length > 0
    ? plan.reduce((total, entry) => total + entry.jh, 0)
    : card.effortEstimated ?? 0;
  const done = plan.length > 0
    ? plan.reduce((total, entry) => total + entry.done, 0)
    : card.effortConsumed ?? 0;
  const raf = Math.max(0, jh - done);
  if (est === 0 && jh === 0) return null;
  return (
    <div className="ec-row" title={`Meilleur estimé ${est} k€ · Reste à faire ${raf} j.h`}>
      <span className="ec-stat">est. <b>{est.toLocaleString("fr-FR")}</b> k€</span>
      <span className="ec-sep" />
      <span className="ec-stat">RAF <b>{raf.toLocaleString("fr-FR")}</b> j.h</span>
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
