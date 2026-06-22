// The sidebar frame: search, live read-out, codes toggle, the filter
// sections, the stats block and the keyboard hints. Filters dim cards on
// the board, they never remove them.

import type { RefObject } from "react";
import type { CardState } from "../../core/types.ts";
import { groupCounts, laneNatures, viewCounts } from "../../core/filters.ts";
import { CRITICALITY_LABELS } from "../domains.ts";
import type { Filters } from "../useFilters.ts";
import {
  CritSection,
  DomainSection,
  NatureSection,
  OwnerSection,
  StateAndAgeSection,
  TypeSection,
  type SectionProps,
} from "./SidebarFilters.tsx";

export interface SidebarProps extends SectionProps {
  open: boolean;
  now: Date;
  showCodes: boolean;
  onToggleCodes: () => void;
  /** Focused by the "/" shortcut. */
  searchRef: RefObject<HTMLInputElement>;
}

function SearchBox({ filters, searchRef }: { filters: Filters; searchRef: SidebarProps["searchRef"] }) {
  return (
    <div className="sb-section sb-search-wrap">
      <input
        ref={searchRef}
        className="search"
        placeholder="Rechercher un sujet…"
        value={filters.state.search}
        onChange={(event) => filters.setSearch(event.target.value)}
      />
      {filters.state.search && (
        <button className="search-x" onClick={() => filters.setSearch("")} title="Effacer">✕</button>
      )}
    </div>
  );
}

function CodesToggle({ showCodes, onToggleCodes }: { showCodes: boolean; onToggleCodes: () => void }) {
  return (
    <div className="sb-section">
      <label className="code-toggle">
        <span className="sb-label">Codes projet</span>
        <span className={"switch" + (showCodes ? " on" : "")} onClick={onToggleCodes}>
          <span className="knob" />
        </span>
      </label>
      <div className="code-hint">
        {showCodes ? "Affichés sur les cartes (ex. PX4520155)" : "Masqués — recherchables ci-dessus"}
      </div>
    </div>
  );
}

function StatRow(props: { label: string; value: number; total: number; active: boolean; alert?: boolean }) {
  return (
    <div className={"stat-row" + (props.alert ? " alert" : "")}>
      <span>{props.label}</span>
      <b>
        {props.value}
        {props.active && <i className="ref"> / {props.total}</i>}
      </b>
    </div>
  );
}

function StatsBlock(props: SidebarProps) {
  const counts = viewCounts(props.cards, props.dimmed, props.config, props.now);
  const natures = laneNatures(props.config);
  const natureOf = (card: CardState) =>
    props.config.lanes.find((lane) => lane.id === card.laneId)?.nature ?? null;
  const perNature = groupCounts(props.cards, props.dimmed, natures, natureOf);
  const active = props.filters.active;
  return (
    <div className="sb-stats">
      <div className="sb-label">{active ? "Sélection · total" : "Vue d'ensemble"}</div>
      <StatRow label="Total" value={counts.shown} total={counts.total} active={active} />
      <StatRow label="Bloqués" value={counts.blocked.shown} total={counts.blocked.total} active={active} alert />
      <StatRow label="Stagnants" value={counts.stale.shown} total={counts.stale.total} active={active} />
      <div className="stat-divider" />
      <StatRow label={`★ ${CRITICALITY_LABELS.top}`} value={counts.crits.top.shown} total={counts.crits.top.total} active={active} />
      <StatRow label={CRITICALITY_LABELS.major} value={counts.crits.major.shown} total={counts.crits.major.total} active={active} />
      <StatRow label={CRITICALITY_LABELS.normal} value={counts.crits.normal.shown} total={counts.crits.normal.total} active={active} />
      {natures.length > 0 && <div className="stat-divider" />}
      {natures.map((nature) => (
        <StatRow
          key={nature}
          label={nature}
          value={perNature[nature]?.shown ?? 0}
          total={perNature[nature]?.total ?? 0}
          active={active}
        />
      ))}
    </div>
  );
}

function Shortcuts() {
  return (
    <div className="sb-shortcuts">
      <span><kbd>/</kbd> rechercher</span>
      <span><kbd>S</kbd> panneau</span>
      <span><kbd>1·2·3</kbd> modes</span>
      <span><kbd>Échap</kbd> revenir</span>
    </div>
  );
}

/**
 * The sidebar. Hidden (zero width) when closed; S, the ≡ button or Échap
 * toggle it; "/" opens it and focuses the search box.
 * Inputs: SidebarProps (open flag, config, card states, now, the Filters
 * bundle, the dimmed id set, codes toggle state, search ref).
 * Output: the aside with search, read-out, codes toggle, filter sections,
 * stats and shortcuts. Failure: none.
 */
export function Sidebar(props: SidebarProps) {
  const counts = viewCounts(props.cards, props.dimmed, props.config, props.now);
  return (
    <aside className={"sidebar" + (props.open ? " open" : "")}>
      <SearchBox filters={props.filters} searchRef={props.searchRef} />
      <div className="sb-result">
        <span className="sb-result-count">
          <b>{counts.shown}</b> / {counts.total} affichés
        </span>
        {props.filters.active && (
          <button className="reset-btn" onClick={props.filters.reset}>Réinitialiser</button>
        )}
      </div>
      <CodesToggle showCodes={props.showCodes} onToggleCodes={props.onToggleCodes} />
      <TypeSection {...props} />
      <NatureSection {...props} />
      <CritSection {...props} />
      <DomainSection {...props} />
      <OwnerSection {...props} />
      <StateAndAgeSection {...props} />
      <StatsBlock {...props} />
      <Shortcuts />
    </aside>
  );
}
