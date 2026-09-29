// The header's settings menu (author, 2026-09-29): ONE gear button holds
// the views and the administration that used to be split between a
// labelled « Analytics » button, a « ⋯ » menu and the tabs of the board
// configuration — views first (Analytics, Archives), then the data gestures
// (import, exercise switch, snapshots), then the board configuration.

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.tsx";

/** Props of the settings menu. */
export interface HeaderMenuProps {
  /** Number of archived subjects — shown on the Archives item when non-zero. */
  archivedCount: number;
  onMetrics: () => void;
  onArchive: () => void;
  onImport: () => void;
  onExercise: () => void;
  onSnapshots: () => void;
  onAdmin: () => void;
}


// While the menu is open, Escape closes it — caught in the capture phase
// so it never reaches the board's own Escape (which unwinds focus,
// filters and sidebar, useShortcuts).
function useEscapeCloses(open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      latest.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
}

// One menu entry: picking it closes the menu first.
function Item({ label, count, onPick }: { label: string; count?: number; onPick: () => void }) {
  return (
    <li role="none">
      <button role="menuitem" className="hd-menu-item" onClick={onPick}>
        {label}{count !== undefined && count > 0 && <small>{count}</small>}
      </button>
    </li>
  );
}

/**
 * The gear button and its menu: Analytics, Archives, Importer, Exercice,
 * Instantanés, Configuration du tableau, grouped by separators.
 * Inputs: HeaderMenuProps. Output: the button, the menu when open.
 * Failure modes: none.
 */
export function HeaderMenu(props: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const gear = useRef<HTMLButtonElement>(null);
  useEscapeCloses(open, () => { setOpen(false); gear.current?.focus(); });
  const pick = (action: () => void) => () => { setOpen(false); action(); };
  return (
    <div className="hd-menu-wrap">
      <button ref={gear} className={"icon-btn gear-btn" + (open ? " on" : "")} onClick={() => setOpen((o) => !o)}
        title="Paramètres : analytics, archives, import, exercice, instantanés, configuration" aria-label="Paramètres"
        aria-haspopup="menu" aria-expanded={open}>
        <Icon name="gear" />
      </button>
      {open && (
        <>
          <div className="hd-year-backdrop" onClick={() => setOpen(false)} />
          <ul className="hd-menu" role="menu">
            <li className="hd-menu-cap" role="presentation">Consulter</li>
            <Item label="Analytics" onPick={pick(props.onMetrics)} />
            <Item label="Archives" count={props.archivedCount} onPick={pick(props.onArchive)} />
            <li className="hd-menu-sep" role="separator" />
            <li className="hd-menu-cap" role="presentation">Données</li>
            <Item label="Importer un export PPM…" onPick={pick(props.onImport)} />
            <Item label="Instantanés…" onPick={pick(props.onSnapshots)} />
            <Item label="Exercice…" onPick={pick(props.onExercise)} />
            <li className="hd-menu-sep" role="separator" />
            <li className="hd-menu-cap" role="presentation">Modèle</li>
            <Item label="Configuration du tableau…" onPick={pick(props.onAdmin)} />
          </ul>
        </>
      )}
    </div>
  );
}
