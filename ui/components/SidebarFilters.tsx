// The sidebar's filter sections: type, nature, criticality, domain,
// owner, state and age. Pills toggle; tout/rien act on a whole group.

import type { BoardConfig, CardState } from "../../core/types.ts";
import { groupCounts, laneNatures, listOwners } from "../../core/filters.ts";
import { CRITICALITY_LABELS, domainColor, domainShort, natureColor, typeColor } from "../domains.ts";
import type { Filters } from "../useFilters.ts";

export interface SectionProps {
  config: BoardConfig;
  cards: CardState[];
  filters: Filters;
  dimmed: ReadonlySet<string>;
}

/** One filter pill (dot + label, "on" when the value passes). */
export function Pill(props: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button className={"pill" + (props.active ? " on" : "")} onClick={props.onClick}>
      {props.color && <span className="pill-dot" style={{ background: props.color }} />}
      {props.children}
    </button>
  );
}

/** Section header with the tout/rien quick toggles. */
export function CatHead(props: {
  label: string;
  allOn?: boolean;
  noneOn?: boolean;
  onAll?: () => void;
  onNone?: () => void;
}) {
  return (
    <div className="cat-head">
      <span className="sb-label">{props.label}</span>
      {props.onAll && props.onNone && (
        <span className="cat-actions">
          <button className="mini-act" disabled={props.allOn} onClick={props.onAll}>tout</button>
          <span className="cat-sep">·</span>
          <button className="mini-act" disabled={props.noneOn} onClick={props.onNone}>rien</button>
        </span>
      )}
    </div>
  );
}

function groupHead(label: string, filters: Filters, group: "domains" | "types" | "natures" | "crits") {
  const values = Object.values(filters.state[group]);
  return (
    <CatHead
      label={label}
      allOn={values.every(Boolean)}
      noneOn={values.every((value) => !value)}
      onAll={() => filters.setAll(group, true)}
      onNone={() => filters.setAll(group, false)}
    />
  );
}

export function TypeSection({ config, filters }: SectionProps) {
  if (config.types.length === 0) return null;
  return (
    <div className="sb-section">
      {groupHead("Type de projet", filters, "types")}
      <div className="pill-row">
        {config.types.map((type) => (
          <Pill
            key={type.id}
            active={filters.state.types[type.id] !== false}
            onClick={() => filters.toggle("types", type.id)}
            color={typeColor(config, type.id)}
          >
            {type.name}
          </Pill>
        ))}
      </div>
    </div>
  );
}

export function NatureSection({ config, filters }: SectionProps) {
  const natures = laneNatures(config);
  if (natures.length === 0) return null;
  return (
    <div className="sb-section">
      {groupHead("Nature", filters, "natures")}
      <div className="pill-row">
        {natures.map((nature) => (
          <Pill
            key={nature}
            active={filters.state.natures[nature] !== false}
            onClick={() => filters.toggle("natures", nature)}
            color={natureColor(natures, nature)}
          >
            {nature}
          </Pill>
        ))}
      </div>
    </div>
  );
}

export function CritSection({ filters }: SectionProps) {
  return (
    <div className="sb-section">
      {groupHead("Criticité", filters, "crits")}
      <div className="pill-row">
        <Pill active={filters.state.crits["normal"] !== false} onClick={() => filters.toggle("crits", "normal")}>
          {CRITICALITY_LABELS.normal}
        </Pill>
        <Pill
          active={filters.state.crits["major"] !== false}
          onClick={() => filters.toggle("crits", "major")}
          color="#94a3b8"
        >
          {CRITICALITY_LABELS.major}
        </Pill>
        <Pill
          active={filters.state.crits["top"] !== false}
          onClick={() => filters.toggle("crits", "top")}
          color="#eab308"
        >
          ★ {CRITICALITY_LABELS.top}
        </Pill>
      </div>
    </div>
  );
}

export function DomainSection({ config, cards, filters, dimmed }: SectionProps) {
  const counts = groupCounts(cards, dimmed, config.domains, (card) => card.domain);
  return (
    <div className="sb-section">
      {groupHead("Domaine", filters, "domains")}
      <div className="pill-row">
        {config.domains.map((domain) => {
          const count = counts[domain];
          const text = filters.active ? `${count?.shown ?? 0}/${count?.total ?? 0}` : `${count?.total ?? 0}`;
          return (
            <Pill
              key={domain}
              active={filters.state.domains[domain] !== false}
              onClick={() => filters.toggle("domains", domain)}
              color={domainColor(config, domain)}
            >
              {domainShort(domain)} <i className="pill-count">{text}</i>
            </Pill>
          );
        })}
      </div>
    </div>
  );
}

export function OwnerSection({ cards, filters }: SectionProps) {
  return (
    <div className="sb-section">
      <CatHead label="Responsable" />
      <select
        className="sb-select"
        value={filters.state.owner ?? ""}
        onChange={(event) => filters.setOwner(event.target.value || null)}
      >
        <option value="">Tous</option>
        {listOwners(cards).map((owner) => (
          <option key={owner} value={owner}>{owner}</option>
        ))}
      </select>
    </div>
  );
}

export function StateAndAgeSection({ config, filters }: SectionProps) {
  return (
    <div className="sb-section">
      <CatHead label="État" />
      <div className="pill-row">
        <Pill active={filters.state.blockedOnly} onClick={filters.toggleBlockedOnly} color="#dc2626">
          Bloqués seulement
        </Pill>
      </div>
      <CatHead label="Âge dans la colonne" />
      <div className="pill-row">
        <Pill active={filters.state.minAgeDays === null} onClick={() => filters.setMinAge(null)}>
          Tous
        </Pill>
        {config.agingStepsDays.map((days) => (
          <Pill key={days} active={filters.state.minAgeDays === days} onClick={() => filters.setMinAge(days)}>
            ≥ {days}j
          </Pill>
        ))}
      </div>
    </div>
  );
}
