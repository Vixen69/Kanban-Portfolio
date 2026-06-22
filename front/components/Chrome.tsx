// Static frame: header (identity, mode switch, pulse, legend) and the
// keyboard-hints footer. All user-facing strings in French.

import type { BoardConfig } from "../../core/types.ts";
import { domainColor, domainShort } from "../domains.ts";
import type { ViewMode } from "../interactions/index.ts";

export interface HeaderProps {
  config: BoardConfig;
  stats: { total: number; blocked: number };
  mode: ViewMode;
  /** Lit cards / total, for the "Filtré" chip. */
  shown: number;
  filtersActive: boolean;
  onMode: (mode: ViewMode) => void;
  onResetFilters: () => void;
  onToggleSidebar: () => void;
  onMetrics: () => void;
}

const MODES: { id: ViewMode; label: string; key: string }[] = [
  { id: "normal", label: "Normal", key: "1" },
  { id: "radiator", label: "Radiateur", key: "2" },
  { id: "focus", label: "Focus", key: "3" },
];

function ModeSwitch({ mode, onMode }: { mode: ViewMode; onMode: (mode: ViewMode) => void }) {
  return (
    <nav className="mode-switch" aria-label="Mode d'affichage">
      {MODES.map((entry) => (
        <button
          key={entry.id}
          className={"mode-btn" + (mode === entry.id ? " on" : "")}
          onClick={() => onMode(entry.id)}
          title={`Mode ${entry.label} (${entry.key})`}
        >
          {entry.label}
        </button>
      ))}
    </nav>
  );
}

function Legend({ config }: { config: BoardConfig }) {
  return (
    <span className="hd-legend">
      {config.domains.map((domain) => (
        <span key={domain} className="lg" title={domain}>
          <span className="lg-dot" style={{ background: domainColor(config, domain) }} />
          {domainShort(domain)}
        </span>
      ))}
    </span>
  );
}

/**
 * App header: sidebar toggle, title, view-mode switch, the "Filtré" chip,
 * head-line counts and the domain legend.
 * Inputs: HeaderProps (config, stats, mode, filter read-out + callbacks).
 * Output: the header element. Failure: none.
 */
export function Header(props: HeaderProps) {
  const { config, stats } = props;
  return (
    <header className="header">
      <div className="hd-left">
        <button className="icon-btn" onClick={props.onToggleSidebar} title="Filtres (S)">≡</button>
        <span className="hd-title">Portefeuille DSI</span>
        <ModeSwitch mode={props.mode} onMode={props.onMode} />
        {props.filtersActive && (
          <button className="filter-chip" onClick={props.onResetFilters} title="Réinitialiser les filtres">
            Filtré : {props.shown}/{stats.total} ✕
          </button>
        )}
      </div>
      <div className="hd-right">
        <span className="hd-stat">
          <b>{stats.total}</b> sujets
        </span>
        <span className={"hd-stat" + (stats.blocked > 0 ? " alert" : "")}>
          <span className="blk-dot" /> <b>{stats.blocked}</b> bloqués
        </span>
        <Legend config={config} />
        <button className="icon-btn" onClick={props.onMetrics} title="Métriques de flux (M)">☷</button>
      </div>
    </header>
  );
}

/**
 * Footer: discoverability of the keyboard fallback and the view modes.
 * Inputs: none. Output: the static hints bar. Failure: none.
 */
export function Footer() {
  return (
    <footer className="footer">
      <span>
        <kbd>1</kbd> normal · <kbd>2</kbd> radiateur · <kbd>3</kbd> focus · <kbd>S</kbd> filtres · <kbd>M</kbd> métriques · <kbd>Échap</kbd> revenir
      </span>
      <span>
        <kbd>Tab</kbd> sélectionner · <kbd>flèches</kbd> naviguer · <kbd>Ctrl</kbd>+<kbd>flèches</kbd> déplacer la carte
      </span>
      <span>cliquer une cellule : focus · cliquer un canal : replier</span>
    </footer>
  );
}
