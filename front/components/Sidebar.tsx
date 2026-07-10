// The sidebar (design v11 chrome.jsx): search, live read-out, codes-projet
// toggle, the Blocage toggle, three filter pill groups, the stats block and
// the keyboard hints. Filters dim cards on the board, they never remove
// them (spatial truth). Pure view over core/filters state owned by App.

import type { ReactNode, Ref } from "react";
import type { BoardConfig } from "../../core/types.ts";
import type { FilterGroup, FilterState, ViewCounts } from "../../core/filters.ts";

/** Props of the sidebar. All state and callbacks are owned by App. */
export interface SidebarProps {
  open: boolean;
  config: BoardConfig;
  search: string;
  setSearch: (value: string) => void;
  filters: FilterState;
  onToggle: (group: FilterGroup, key: string) => void;
  onToggleBlockedOnly: () => void;
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

// One filter pill: optional colored dot + label, lit when active.
function Pill(props: { active: boolean; onClick: () => void; color?: string; children: ReactNode }) {
  return (
    <button className={"pill" + (props.active ? " on" : "")} onClick={props.onClick}>
      {props.color && <span className="pill-dot" style={{ background: props.color }} />}
      {props.children}
    </button>
  );
}

// Category header: label + tout/rien quick toggles (matters most for 9 RDOM).
function CatHead(props: { label: string; allOn: boolean; noneOn: boolean; onAll: () => void; onNone: () => void }) {
  return (
    <div className="cat-head">
      <span className="sb-label">{props.label}</span>
      <div className="cat-actions">
        <button className="mini-act" disabled={props.allOn} onClick={props.onAll}>tout</button>
        <span className="cat-sep">·</span>
        <button className="mini-act" disabled={props.noneOn} onClick={props.onNone}>rien</button>
      </div>
    </div>
  );
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

// One filter section: CatHead wired to the group + a pill row.
function GroupSection(props: {
  label: string;
  group: FilterGroup;
  wrap?: boolean;
  filters: FilterState;
  onSetGroup: SidebarProps["onSetGroup"];
  children: ReactNode;
}) {
  const values = Object.values(props.filters[props.group]);
  return (
    <div className="sb-section">
      <CatHead
        label={props.label}
        allOn={values.every((enabled) => enabled)}
        noneOn={values.every((enabled) => !enabled)}
        onAll={() => props.onSetGroup(props.group, true)}
        onNone={() => props.onSetGroup(props.group, false)}
      />
      <div className={"pill-row" + (props.wrap ? " wrap" : "")}>{props.children}</div>
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

function DomainSection(props: SidebarProps) {
  return (
    <GroupSection label="Domaine RDOM" group="domain" wrap filters={props.filters} onSetGroup={props.onSetGroup}>
      {props.config.domains.map((domain) => (
        <Pill
          key={domain.id}
          active={props.filters.domain[domain.id] !== false}
          onClick={() => props.onToggle("domain", domain.id)}
          color={domain.color}
        >
          {domain.short}
        </Pill>
      ))}
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
 * order: search, live result row, codes-projet switch, Blocage, Type de
 * projet, Criticité, Domaine RDOM, the stats block, keyboard shortcuts.
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
      <BlocageSection {...props} />
      <TypeSection {...props} />
      <CritSection {...props} />
      <DomainSection {...props} />
      <StatsBlock {...props} />
      <Shortcuts />
    </aside>
  );
}
