// The sidebar (design v11 chrome.jsx): search, live read-out, codes-projet
// toggle, the Blocage toggle, the filter pill groups, the stats block and
// the keyboard hints. Filters dim cards on the board, they never remove
// them (spatial truth). Pure view over core/filters state owned by App.
// The pill/section building blocks live in sidebarParts.tsx and the
// Domaine group (with its unfoldable sub-domains, ADR 022) in
// SidebarDomains.tsx.

import type { Ref } from "react";
import type { BoardConfig } from "../../core/types.ts";
import type { FilterGroup, FilterState, ViewCounts } from "../../core/filters.ts";
import { GroupSection, Pill } from "./sidebarParts.tsx";
import { DomainSection } from "./SidebarDomains.tsx";

/** Props of the sidebar. All state and callbacks are owned by App. */
export interface SidebarProps {
  open: boolean;
  config: BoardConfig;
  search: string;
  setSearch: (value: string) => void;
  filters: FilterState;
  onToggle: (group: FilterGroup, key: string) => void;
  onToggleBlockedOnly: () => void;
  /** Flips the « Aucune » pill of the Contrainte group (design v12). */
  onToggleNoConstraint: () => void;
  onSetGroup: (group: FilterGroup, value: boolean) => void;
  /** Whole-portfolio counts (the muted reference totals). */
  stats: ViewCounts;
  /** Counts over the visible (non-dimmed) subset. */
  view: ViewCounts;
  filtersActive: boolean;
  onReset: () => void;
  /** Focused by the "/" shortcut. */
  searchRef: Ref<HTMLInputElement>;
  showCodes: boolean;
  setShowCodes: (value: boolean) => void;
}

// One stat row. When filtering, the visible count leads; total trails muted.
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

function SearchSection(props: SidebarProps) {
  return (
    <div className="sb-section sb-search-wrap">
      <input
        ref={props.searchRef}
        className="search"
        placeholder="Rechercher un sujet…"
        value={props.search}
        onChange={(event) => props.setSearch(event.target.value)}
      />
      {props.search && (
        <button className="search-x" onClick={() => props.setSearch("")} title="Effacer">✕</button>
      )}
    </div>
  );
}

// Live read-out: what is on screen right now, and a one-click way back.
function ResultRow(props: SidebarProps) {
  return (
    <div className="sb-result">
      <span className="sb-result-count">
        <b>{props.view.shown}</b> / {props.stats.total} affichés
      </span>
      {props.filtersActive && (
        <button className="reset-btn" onClick={props.onReset}>Réinitialiser</button>
      )}
    </div>
  );
}

function CodesSection(props: SidebarProps) {
  return (
    <div className="sb-section">
      <label className="code-toggle">
        <span className="sb-label" style={{ marginBottom: 0 }}>Codes projet</span>
        <span className={"switch" + (props.showCodes ? " on" : "")} onClick={() => props.setShowCodes(!props.showCodes)}>
          <span className="knob" />
        </span>
      </label>
      <div className="code-hint">
        {props.showCodes ? "Affichés sur les cartes (ex. PX4520155)" : "Masqués — recherchables dans la barre ci-dessus"}
      </div>
    </div>
  );
}

// Type de projet: the config's types — the four retained ones since the
// 2026-09-04 PMO revision (ADR 022); the list stays config-driven.
function TypeSection(props: SidebarProps) {
  return (
    <GroupSection label="Type de projet" group="type" wrap filters={props.filters} onSetGroup={props.onSetGroup}>
      {props.config.types.map((type) => (
        <Pill
          key={type.id}
          active={props.filters.type[type.id] !== false}
          onClick={() => props.onToggle("type", type.id)}
          color={type.color}
        >
          {type.name}
        </Pill>
      ))}
    </GroupSection>
  );
}

// Contrainte (design v12): the configured project constraints plus a
// synthetic « Aucune » pill. The group is OR-shaped — a card wearing
// several constraints stays lit while any of them is on (core/filters) —
// so it gets no tout/rien header. Labels and colors come from the config:
// the typology is admin-editable vocabulary (ADR 013), never hard-coded.
function ConstraintSection(props: SidebarProps) {
  return (
    <div className="sb-section">
      <span className="sb-label">Contrainte</span>
      <div className="pill-row">
        {props.config.projectConstraints.map((constraint) => (
          <Pill
            key={constraint.id}
            active={props.filters.constraint[constraint.id] !== false}
            onClick={() => props.onToggle("constraint", constraint.id)}
            color={constraint.color}
          >
            {constraint.name}
          </Pill>
        ))}
        <Pill active={props.filters.noConstraint} onClick={props.onToggleNoConstraint} color="#94a3b8">
          Aucune
        </Pill>
      </div>
    </div>
  );
}

// Blocage (design v11): a single toggle pill, no tout/rien header.
function BlocageSection(props: SidebarProps) {
  return (
    <div className="sb-section">
      <span className="sb-label">Blocage</span>
      <div className="pill-row">
        <Pill active={props.filters.blockedOnly} onClick={props.onToggleBlockedOnly} color="#dc2626">
          Bloqués uniquement
        </Pill>
      </div>
    </div>
  );
}

// Glyphs match the cards' iconography (design chrome.jsx): ★ = Major, ♛ = Top.
function CritSection(props: SidebarProps) {
  const { crit } = props.filters;
  const crits = props.config.criticalities;
  return (
    <GroupSection label="Criticité" group="crit" filters={props.filters} onSetGroup={props.onSetGroup}>
      <Pill active={crit.normal !== false} onClick={() => props.onToggle("crit", "normal")}>{crits.normal.label}</Pill>
      <Pill active={crit.major !== false} onClick={() => props.onToggle("crit", "major")} color="#d4a017">★ {crits.major.label}</Pill>
      <Pill active={crit.top !== false} onClick={() => props.onToggle("crit", "top")} color="#d4a017">♛ {crits.top.label}</Pill>
    </GroupSection>
  );
}

function StatsBlock(props: SidebarProps) {
  const { view, stats, filtersActive: active, config } = props;
  return (
    <div className="sb-stats">
      <div className="sb-label">{active ? "Sélection · total" : "Vue d’ensemble"}</div>
      <StatRow label="Total" value={view.shown} total={stats.total} active={active} />
      <StatRow label="Bloqués" value={view.blocked} total={stats.blocked} alert active={active} />
      <StatRow label={`Stagnants (> ${config.age.agingMaxDays}j)`} value={view.stale} total={stats.stale} active={active} />
      <div className="stat-divider" />
      <StatRow label={`♛ ${config.criticalities.top.label}`} value={view.top} total={stats.top} active={active} />
      <StatRow label={`★ ${config.criticalities.major.label}`} value={view.major} total={stats.major} active={active} />
      <StatRow label={config.criticalities.normal.label} value={view.normal} total={stats.normal} active={active} />
    </div>
  );
}

function Shortcuts() {
  return (
    <div className="sb-shortcuts">
      <span><kbd>/</kbd> rechercher</span>
      <span><kbd>N</kbd> nouveau</span>
      <span><kbd>S</kbd> panneau</span>
      <span><kbd>Esc</kbd> revenir</span>
    </div>
  );
}

/**
 * The sidebar. Hidden (zero width) when closed; S or the ≡ button toggles
 * it, "/" opens it and focuses the search box. Sections in design-v11
 * order: search, live result row, codes-projet switch, Contrainte, Blocage,
 * Type de projet, Criticité, Domaine (with unfoldable sub-domains), the
 * stats block, keyboard shortcuts.
 * Inputs: SidebarProps (open flag, config, filter state + callbacks,
 * portfolio/visible counts, codes toggle, search ref).
 * Output: the aside element. Failure: none.
 */
export function Sidebar(props: SidebarProps) {
  return (
    <aside className={"sidebar" + (props.open ? " open" : "")}>
      <SearchSection {...props} />
      <ResultRow {...props} />
      <CodesSection {...props} />
      <ConstraintSection {...props} />
      <BlocageSection {...props} />
      <TypeSection {...props} />
      <CritSection {...props} />
      <DomainSection config={props.config} filters={props.filters} onToggle={props.onToggle} onSetGroup={props.onSetGroup} />
      <StatsBlock {...props} />
      <Shortcuts />
    </aside>
  );
}
