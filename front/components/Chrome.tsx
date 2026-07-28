// App header (design v9 chrome.jsx): identity on the left with the filter
// and focus chips, portfolio pulse + domain legend + actions on the right.
// All user-facing strings in French, exactly as in the validated design.

import type { BoardConfig } from "../../core/types.ts";
import type { ViewCounts } from "../../core/filters.ts";

/** Props of the app header. All data flows down from App — no context. */
export interface HeaderProps {
  config: BoardConfig;
  /** Whole-portfolio head-line numbers (core/board portfolioStats). */
  stats: { total: number; blocked: number };
  /** Live read-out of the visible subset (drives the "Filtré" chip). */
  view: ViewCounts;
  filtersActive: boolean;
  /** Name of the focused column, or null when no stage is focused. */
  focusLabel: string | null;
  onResetFilters: () => void;
  onClearFocus: () => void;
  onToggleSidebar: () => void;
  onMetrics: () => void;
  /** Opens the archives overlay (design v11). */
  onArchive: () => void;
  /** Number of archived subjects — the badge hides at zero. */
  archivedCount: number;
  onAdmin: () => void;
  onAdd: () => void;
}

// Domain legend: one colored dot + short code per RDOM, full name on hover.
function Legend({ config }: { config: BoardConfig }) {
  return (
    <div className="hd-legend">
      {config.domains.map((domain) => (
        <span className="lg" key={domain.id} title={domain.name}>
          <span className="lg-dot" style={{ background: domain.color }} />
          {domain.short}
        </span>
      ))}
    </div>
  );
}

/**
 * App header: sidebar toggle, title, the "Filtré"/"Focus" chips, subject
 * and blocked counts, the domain legend, and the metrics (☷), admin (⚙)
 * and "+ Sujet" actions.
 * Inputs: HeaderProps (config, counts, chip state, callbacks).
 * Output: the header element. Failure: none.
 */
export function Header(props: HeaderProps) {
  const { stats, view } = props;
  return (
    <header className="header">
      <div className="hd-left">
        <button className="icon-btn" onClick={props.onToggleSidebar} title="Filtres (S)">≡</button>
        <span className="hd-title">Portefeuille DSI</span>
        <span className="hd-ghost">NMO · Portfolio Sync</span>
        {props.filtersActive && (
          <button className="filter-chip" onClick={props.onResetFilters} title="Réinitialiser les filtres (Esc)">
            Filtré : {view.shown}/{stats.total} ✕
          </button>
        )}
        {props.focusLabel && (
          <button className="focus-chip" onClick={props.onClearFocus} title="Quitter le focus (Esc)">
            Focus : {props.focusLabel} ✕
          </button>
        )}
      </div>
      <div className="hd-right">
        <div className="hd-stat"><b>{stats.total}</b> sujets</div>
        <div className={"hd-stat" + (stats.blocked ? " alert" : "")}>
          <span className="blk-dot-static" /> <b>{stats.blocked}</b> bloqués
        </div>
        <Legend config={props.config} />
        <button className="icon-btn" onClick={props.onMetrics} title="Métriques de flux">☷</button>
        <button className="icon-btn arch-btn" onClick={props.onArchive} title="Archives">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" />
          </svg>
          {props.archivedCount > 0 && <span className="arch-count">{props.archivedCount}</span>}
        </button>
        <button className="icon-btn" onClick={props.onAdmin} title="Configuration du tableau">⚙</button>
        <button className="add-btn" onClick={props.onAdd} title="Nouveau sujet (N)">+ Sujet</button>
      </div>
    </header>
  );
}
