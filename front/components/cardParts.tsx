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
import { fmtNum } from "../format.ts";

/**
 * Criticality marker (author, 2026-09-11 — the crown is gone): top = gold
 * star, major = slate dot, normal = none.
 * Inputs: c — the card's criticality; big — expanded-card variant.
 * Output: the marker element, or null for "normal". Failure modes: none.
 */
export function CritMark({ c, big }: { c: Criticality; big?: boolean }) {
  if (c === "top") return <span className="crit-star" title="Top" style={{ fontSize: big ? 14 : 11 }}>{"★"}</span>;
  if (c === "major") {
    const size = big ? 8 : 6;
    return <span className="crit-dot" title="Majeur" style={{ width: size, height: size }} />;
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
 * Failure modes: none. The k€ estimate never borrows the effort (j.h):
 * without a budget the figure reads « — » (author, 2026-09-10 — a 31 j.h
 * effort was shown as 31 k€). The RAF still falls back on the card-level
 * effort when there is no per-profile plan (same rule as core/totals).
 */
export function EstimeBar({ card }: { card: CardState }) {
  const est = card.budgetEstimated;
  const plan = card.chargeByProfile;
  const jh = plan.length > 0
    ? plan.reduce((total, entry) => total + entry.jh, 0)
    : card.effortEstimated ?? 0;
  const done = plan.length > 0
    ? plan.reduce((total, entry) => total + entry.done, 0)
    : card.effortConsumed ?? 0;
  const raf = Math.max(0, jh - done);
  if (est === null && jh === 0) return null;
  const estLabel = est === null ? "non renseigné" : `${fmtNum(est)} k€`;
  return (
    <div className="ec-row" title={`Meilleur estimé ${estLabel} · Reste à faire ${fmtNum(raf)} j.h`}>
      <span className="ec-stat">est. <b>{est === null ? "—" : fmtNum(est)}</b> k€</span>
      <span className="ec-sep" />
      <span className="ec-stat">RAF <b>{fmtNum(raf)}</b> j.h</span>
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
