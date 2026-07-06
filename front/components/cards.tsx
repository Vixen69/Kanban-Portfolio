// The two card renderings of the board (design board.jsx): MiniCard, the
// ~16px radiator bar of the default view, and FocusCard, the expanded card
// of a focused column. Blocked wins over the domain accent; age is worn as
// a text pill only (validated design — no background darkening).

import type { CSSProperties, DragEvent } from "react";
import type { BoardConfig, CardState } from "../../core/types.ts";
import { daysInColumn } from "../../core/aging.ts";
import { domainById, typeById } from "../lookup.ts";
import { AgeText, CritMark, CustomBadges, EstimeBar, TypeTag } from "./cardParts.tsx";

/** Shared props of both card renderings (pinned build-spec contract). */
export interface CardItemProps {
  card: CardState;
  /** True when the sidebar filters dim this card (dimmed, never removed). */
  dimmed: boolean;
  /** Epoch milliseconds of the shared "now" tick. */
  now: number;
  config: BoardConfig;
  /** Show the code projet on the card (sidebar toggle). */
  showCodes: boolean;
  /** Two-stage click: the App focuses the column first, then opens the detail. */
  onOpen: (card: CardState) => void;
  onDragStart: (e: DragEvent, card: CardState) => void;
  onDragEnd: () => void;
}

// Blocked cards override the domain accent with the validated red wash +
// double inset border (design default branch); otherwise the left accent
// bar carries the domain color.
function cardAccent(
  card: CardState,
  config: BoardConfig,
): { root: CSSProperties; accent: CSSProperties } {
  if (card.blocked) {
    return {
      root: { background: "#f9c0c0", boxShadow: "inset 0 0 0 1px #dc2626, inset 3px 0 0 #b91c1c" },
      accent: { background: "#b91c1c", width: 4 },
    };
  }
  const domain = domainById(config)[card.domain];
  return { root: {}, accent: { background: domain !== undefined ? domain.color : "#94a3b8" } };
}

// The domain pill colors, mixed from the domain hue exactly as the design.
function domPillStyle(color: string): CSSProperties {
  return {
    color: `color-mix(in oklab, ${color} 58%, #0f172a)`,
    borderColor: `color-mix(in oklab, ${color} 42%, transparent)`,
    background: `color-mix(in oklab, ${color} 12%, #fff)`,
  };
}

/**
 * Radiator bar: one ~16px draggable line per card — the default view keeps
 * the whole portfolio visible at once.
 * Inputs: CardItemProps.
 * Output: the bar (domain accent, pulse dot when blocked, criticality
 * mark, type tag, optional code, name, age pill) with the design tooltip.
 * Failure modes: unknown domain/type ids degrade to a neutral accent and
 * no tag — the display never crashes after an admin topology edit.
 */
export function MiniCard(props: CardItemProps) {
  const { card, config } = props;
  const days = daysInColumn(card, new Date(props.now));
  const acc = cardAccent(card, config);
  const type = typeById(config)[card.typeId ?? ""] ?? null;
  const domain = domainById(config)[card.domain];
  return (
    <div
      className={"mini" + (props.dimmed ? " dimmed" : "")}
      draggable
      onClick={() => props.onOpen(card)}
      onDragStart={(e) => props.onDragStart(e, card)}
      onDragEnd={props.onDragEnd}
      style={{ height: "var(--card-h)", ...acc.root }}
      title={`${card.title}  ·  ${type !== null ? type.name : ""}  ·  ${domain !== undefined ? domain.name : ""}  ·  ${card.owner}  ·  ${days}j`}
    >
      <span className="mini-accent" style={acc.accent} />
      {card.blocked && <span className="blk-pulse" />}
      <CritMark c={card.criticality} />
      <TypeTag type={type} />
      {props.showCodes && card.codename !== null && <span className="mini-code">{card.codename}</span>}
      <span className="mini-name">{card.title}</span>
      <AgeText days={days} age={config.age} />
    </div>
  );
}

/**
 * Expanded card shown when its column is in focus (~65px).
 * Inputs: CardItemProps.
 * Output: two info lines (identity with age, then type / domain / owner /
 * badges), the blocked reason line when blocked, and the estimate bar.
 * Failure modes: unknown domain/type ids degrade to a neutral accent and
 * missing pills — the display never crashes after an admin topology edit.
 */
export function FocusCard(props: CardItemProps) {
  const { card, config } = props;
  const days = daysInColumn(card, new Date(props.now));
  const acc = cardAccent(card, config);
  return (
    <div
      className={"focus-card" + (props.dimmed ? " dimmed" : "")}
      draggable
      onClick={() => props.onOpen(card)}
      onDragStart={(e) => props.onDragStart(e, card)}
      onDragEnd={props.onDragEnd}
      style={acc.root}
    >
      <span className="focus-accent" style={acc.accent} />
      <div className="focus-body">
        <div className="focus-line1">
          {card.blocked && <span className="blk-pulse" />}
          <CritMark c={card.criticality} big />
          <span className="focus-name">{card.title}</span>
          <AgeText days={days} age={config.age} />
        </div>
        <FocusMeta card={card} config={config} showCodes={props.showCodes} />
        {card.blocked && <div className="focus-block">{card.blockedReason}</div>}
        <EstimeBar card={card} />
      </div>
    </div>
  );
}

// Second line of the expanded card: type tag, domain pill, owner, optional
// code, criticality badge (top/major only) and custom-field badges.
function FocusMeta({
  card,
  config,
  showCodes,
}: {
  card: CardState;
  config: BoardConfig;
  showCodes: boolean;
}) {
  const domain = domainById(config)[card.domain];
  const type = typeById(config)[card.typeId ?? ""] ?? null;
  const badge = config.criticalities[card.criticality].badge;
  return (
    <div className="focus-line2">
      <TypeTag type={type} big />
      {domain !== undefined && (
        <span className="dom-pill" style={domPillStyle(domain.color)}>{domain.short}</span>
      )}
      <span className="muted">{card.owner}</span>
      {showCodes && card.codename !== null && <span className="focus-code">{card.codename}</span>}
      {card.criticality !== "normal" && badge !== null && (
        <span className={"badge crit-" + card.criticality}>{badge}</span>
      )}
      <CustomBadges card={card} fields={config.fields} />
    </div>
  );
}
