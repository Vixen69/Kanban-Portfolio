// Small shared pieces of both card renderings: criticality mark, type
// tag, andon marker and the consumed/budget mini-bar.

import type { BoardConfig, CardState, Criticality } from "../../core/types.ts";
import { typeById, typeColor } from "../domains.ts";

/**
 * Criticality marker: top = gold star, major = slate pip, normal = none.
 * Inputs: the criticality, big variant flag. Output: the marker element
 * or null. Failure: none.
 */
export function CritMark({ crit, big }: { crit: Criticality; big?: boolean }) {
  if (crit === "top") {
    return <span className="crit-star" style={{ fontSize: big ? 13 : 10 }} title="Criticité Top">★</span>;
  }
  if (crit === "major") {
    const size = big ? 7 : 5;
    return <span className="crit-pip" style={{ width: size, height: size }} title="Criticité Major" />;
  }
  return null;
}

/**
 * Project-type tag — deliberately more prominent than the domain accent.
 * Inputs: the board config, the card's type id, big variant flag.
 * Output: the filled pill (short label small, full name big) or null for
 * untyped cards. Failure: none.
 */
export function TypeTag({ config, typeId, big }: { config: BoardConfig; typeId: string | null; big?: boolean }) {
  const type = typeById(config, typeId);
  if (!type) return null;
  return (
    <span
      className={"type-tag" + (big ? " big" : "")}
      style={{ background: typeColor(config, type.id) }}
      title={type.name}
    >
      {big ? type.name : type.short}
    </span>
  );
}

/**
 * Static escalation marker (andon).
 * Input: whether the card escalates. Output: the marker or null.
 * Failure: none.
 */
export function AndonMark({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="andon" title="Andon — bloqué au-delà du seuil d'escalade">
      ▲
    </span>
  );
}

/**
 * Compact budget read-out (consommé vs budget, k€) with an overrun color.
 * Input: the card state. Output: the mini-bar, or null when the card has
 * no budget. Failure: none.
 */
export function EstimeBar({ card }: { card: CardState }) {
  if (card.budget === null) return null;
  const consumed = card.consumed ?? 0;
  const pct = card.budget > 0 ? Math.round((consumed / card.budget) * 100) : 0;
  const over = consumed > card.budget;
  const fill = over ? "var(--danger)" : pct >= 85 ? "var(--warn)" : "var(--accent)";
  return (
    <div className="ec-row" title={`Budget ${card.budget} k€ · Consommé ${consumed} k€`}>
      <span className="ec-label">
        {consumed} / {card.budget} k€
      </span>
      <span className="ec-track">
        <span className="ec-fill" style={{ width: `${Math.min(100, pct)}%`, background: fill }} />
      </span>
    </div>
  );
}
