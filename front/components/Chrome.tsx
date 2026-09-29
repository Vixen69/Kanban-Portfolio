// App header (design v9 chrome.jsx): identity on the left with the filter
// and focus chips, portfolio pulse + domain legend + actions on the right.
// All user-facing strings in French, exactly as in the validated design.

import type { BoardConfig } from "../../core/types.ts";
import type { ViewCounts } from "../../core/filters.ts";
import { YearPicker } from "./YearPicker.tsx";
import type { YearPickerProps } from "./YearPicker.tsx";
import { HeaderMenu } from "./HeaderMenu.tsx";

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
  /** « Trié par … » while a sort is active (ADR 044), else null. */
  sortLabel: string | null;
  /** Back to the board's own order. */
  onClearSort: () => void;
  /** « RAF : A + B + N » while the métier lens narrows the reste à faire (ADR 048), else null. */
  lensLabel: string | null;
  /** The lens scope in full, the chip's tooltip. */
  lensTitle: string;
  /** Back to « tous métiers ». */
  onClearLens: () => void;
  onToggleSidebar: () => void;
  onMetrics: () => void;
  /** Opens the archives overlay (design v11). */
  onArchive: () => void;
  /** Number of archived subjects — shown on the Archives item when non-zero. */
  archivedCount: number;
  onAdmin: () => void;
  /** Opens the import panel (ADR 027). */
  onImport: () => void;
  /** Opens the exercise switch panel (ADR 038). */
  onExercise: () => void;
  /** Opens the snapshots panel (ADR 042). */
  onSnapshots: () => void;
  onAdd: () => void;
  /** The exercise shown and the selector's data (ADR 035). */
  exercise: YearPickerProps;
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

// What narrows the board right now, each with its ✕: the filters, the
// focused stage, the sort (ADR 044) and the métier lens (ADR 048).
function HeaderChips({ props }: { props: HeaderProps }) {
  return (
    <>
      {props.filtersActive && (
        <button className="filter-chip" onClick={props.onResetFilters} title="Réinitialiser les filtres (Esc)">
          Filtré : {props.view.shown}/{props.stats.total} ✕
        </button>
      )}
      {props.focusLabel && (
        <button className="focus-chip" onClick={props.onClearFocus} title="Quitter le focus (Esc)">
          Focus : {props.focusLabel} ✕
        </button>
      )}
      {props.sortLabel !== null && (
        <button className="focus-chip sort-chip" onClick={props.onClearSort} title={`${props.sortLabel} · revenir à l’ordre du tableau`}>
          <span className="chip-text">{props.sortLabel}</span> ✕
        </button>
      )}
      {props.lensLabel !== null && (
        <button className="focus-chip lens-chip" onClick={props.onClearLens} title={`${props.lensTitle} · revenir à tous les métiers`}>
          <span className="chip-text">{props.lensLabel}</span> ✕
        </button>
      )}
    </>
  );
}

/**
 * App header: sidebar toggle, title (one line, never wrapped), the
 * exercise selector (ADR 035), the chips of what narrows the board
 * (filters, focus, sort, métier lens — they shrink first), subject and
 * blocked counts, the domain legend, the gear settings menu (analytics,
 * archives, import, exercise, snapshots, configuration) and "+ Sujet".
 * Inputs: HeaderProps (config, counts, chip state, callbacks).
 * Output: the header element. Failure: none.
 */
export function Header(props: HeaderProps) {
  const { stats } = props;
  return (
    <header className="header">
      <div className="hd-left">
        <button className="icon-btn" onClick={props.onToggleSidebar} title="Filtres (S)">≡</button>
        <span className="hd-title">Portfolio Kanban DSI</span>
        <YearPicker {...props.exercise} />
        <HeaderChips props={props} />
      </div>
      <div className="hd-right">
        <div className="hd-stat"><b>{stats.total}</b> sujets</div>
        <div className={"hd-stat" + (stats.blocked ? " alert" : "")}>
          <span className="blk-dot-static" /> <b>{stats.blocked}</b> bloqués
        </div>
        <Legend config={props.config} />
        <HeaderMenu archivedCount={props.archivedCount} onMetrics={props.onMetrics} onArchive={props.onArchive}
          onImport={props.onImport} onExercise={props.onExercise} onSnapshots={props.onSnapshots} onAdmin={props.onAdmin} />
        <button className="add-btn" onClick={props.onAdd} title="Nouveau sujet (N)">+ Sujet</button>
      </div>
    </header>
  );
}
