// The two card renderings: radiator bar (whole-portfolio view) and normal
// (full card). Aging darkens the background; blocked pulses the border;
// andon adds the static escalation marker. Clicking a card is two-stage:
// the App focuses its cell first, then opens the detail (design P5).

import type { BoardConfig, CardState } from "../../core/types.ts";
import { ageLabel, agingStep, daysInColumn, isAndon, isHotAge } from "../../core/aging.ts";
import { domainColor, domainShort } from "../domains.ts";
import { AndonMark, CritMark, EstimeBar, TypeTag } from "./cardParts.tsx";

// styles.css defines .age-step-0 .. .age-step-4; deeper configured steps
// saturate at the darkest shade instead of falling back to white.
const MAX_AGE_CLASS = 4;

/** Shared interaction props for both card renderings. */
export interface CardProps {
  card: CardState;
  config: BoardConfig;
  now: Date;
  /** True when the sidebar filters dim this card (never removed). */
  dimmed: boolean;
  /** Show the code projet on the card (sidebar toggle). */
  showCodes: boolean;
  /** Two-stage click: focus the cell, then open the detail. */
  onOpen: (card: CardState) => void;
  onMoveKey: (cardId: string, key: string) => void;
}

function dragPayload(event: React.DragEvent, cardId: string): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", cardId);
}

function keyHandler(props: CardProps): (event: React.KeyboardEvent) => void {
  return (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      props.onOpen(props.card);
      return;
    }
    if (!event.ctrlKey || !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    props.onMoveKey(props.card.id, event.key);
  };
}

function clickHandler(props: CardProps): (event: React.MouseEvent) => void {
  return (event) => {
    event.stopPropagation(); // a card click never toggles the cell focus off
    props.onOpen(props.card);
  };
}

function cardClass(kind: "bar" | "full", days: number, props: CardProps): string {
  const step = Math.min(agingStep(days, props.config), MAX_AGE_CLASS);
  return (
    `card ${kind} age-step-${step}` +
    (props.card.blocked ? " blocked" : "") +
    (props.dimmed ? " dimmed" : "")
  );
}

function ageClass(days: number, config: BoardConfig): string {
  return `age${isHotAge(days, config) ? " hot" : ""}`;
}

function cardTitle(props: CardProps): string {
  const { card, now } = props;
  const days = daysInColumn(card, now);
  const blocked = card.blocked ? ` · BLOQUÉ : ${card.blockedReason ?? "raison inconnue"}` : "";
  return `${card.title} · ${card.domain} · ${card.owner} · ${ageLabel(days)}${blocked}`;
}

/**
 * Radiator bar: one thin draggable line per card, 100+ visible at once.
 * Inputs: CardProps (card state, config, now, dimmed/showCodes flags,
 * open and keyboard-move callbacks).
 * Output: the bar element; when blocked, the reason replaces the title
 * while the bar has keyboard focus. Click/Enter runs the two-stage open.
 * Failure: none.
 */
export function CardRadiator(props: CardProps) {
  const { card, config, now } = props;
  const days = daysInColumn(card, now);
  return (
    <div
      className={cardClass("bar", days, props)}
      draggable
      tabIndex={0}
      data-card-id={card.id}
      onDragStart={(event) => dragPayload(event, card.id)}
      onKeyDown={keyHandler(props)}
      onClick={clickHandler(props)}
      title={cardTitle(props)}
      aria-label={cardTitle(props)}
    >
      <span className="accent" style={{ background: domainColor(config, card.domain) }} />
      <AndonMark on={isAndon(card, config, now)} />
      <CritMark crit={card.criticality} />
      <TypeTag config={config} typeId={card.typeId} />
      {props.showCodes && card.codename && <span className="mini-code">{card.codename}</span>}
      <span className="bar-title">{card.title}</span>
      {card.blocked && <span className="bar-reason">{card.blockedReason ?? "Bloqué"}</span>}
      <span className={ageClass(days, config)}>{ageLabel(days)}</span>
    </div>
  );
}

/**
 * Normal card: title, type, domain, owner, tags, age, budget bar and the
 * always-visible blocked reason (CLAUDE.md section 5 + design reference).
 * Inputs: CardProps. Output: the full card element, draggable and
 * keyboard-focusable; click/Enter runs the two-stage open. Failure: none.
 */
export function CardNormal(props: CardProps) {
  const { card, config, now } = props;
  const days = daysInColumn(card, now);
  return (
    <div
      className={cardClass("full", days, props)}
      draggable
      tabIndex={0}
      data-card-id={card.id}
      onDragStart={(event) => dragPayload(event, card.id)}
      onKeyDown={keyHandler(props)}
      onClick={clickHandler(props)}
      title={cardTitle(props)}
    >
      <span className="accent" style={{ background: domainColor(config, card.domain) }} />
      <div className="full-line">
        <AndonMark on={isAndon(card, config, now)} />
        <CritMark crit={card.criticality} big />
        <span className="full-title">{card.title}</span>
        <span className={ageClass(days, config)}>{ageLabel(days)}</span>
      </div>
      <NormalMeta props={props} />
      {card.blocked && <div className="blocked-reason">{card.blockedReason ?? "Bloqué"}</div>}
      <EstimeBar card={card} />
    </div>
  );
}

function NormalMeta({ props }: { props: CardProps }) {
  const { card, config } = props;
  return (
    <div className="full-line meta">
      <TypeTag config={config} typeId={card.typeId} big />
      <span
        className="dom-pill"
        style={{ borderColor: domainColor(config, card.domain), color: "#0f172a" }}
        title={card.domain}
      >
        {domainShort(card.domain)}
      </span>
      <span className="owner">{card.owner}</span>
      {props.showCodes && card.codename && <span className="mini-code">{card.codename}</span>}
      {card.tags.map((tag) => (
        <span key={tag} className="tag">
          {tag}
        </span>
      ))}
    </div>
  );
}
