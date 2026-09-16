// The header's « ⋯ » menu (author, 2026-09-16: the ☷ icon was not
// telling). Analytics keeps its own labelled button — it is opened at every
// review; the rarer actions live here: archives (with their count), the
// import, the board configuration.

import { useState } from "react";

/** Props of the header menu. */
export interface HeaderMenuProps {
  /** Number of archived subjects — the badge hides at zero. */
  archivedCount: number;
  onArchive: () => void;
  onImport: () => void;
  onAdmin: () => void;
}

/**
 * The « ⋯ » button and its menu.
 * Inputs: HeaderMenuProps. Output: the button, the menu when open.
 * Failure modes: none.
 */
export function HeaderMenu({ archivedCount, onArchive, onImport, onAdmin }: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const pick = (action: () => void) => () => { setOpen(false); action(); };
  return (
    <div className="hd-menu-wrap">
      <button className="icon-btn arch-btn" onClick={() => setOpen((o) => !o)} title="Archives, import, configuration"
        aria-haspopup="menu" aria-expanded={open}>
        ⋯{archivedCount > 0 && <span className="arch-count">{archivedCount}</span>}
      </button>
      {open && (
        <>
          <div className="hd-year-backdrop" onClick={() => setOpen(false)} />
          <ul className="hd-menu" role="menu">
            <li><button role="menuitem" className="hd-menu-item" onClick={pick(onArchive)}>Archives{archivedCount > 0 && <small>{archivedCount}</small>}</button></li>
            <li><button role="menuitem" className="hd-menu-item" onClick={pick(onImport)}>Importer un export PPM</button></li>
            <li><button role="menuitem" className="hd-menu-item" onClick={pick(onAdmin)}>Configuration du tableau</button></li>
          </ul>
        </>
      )}
    </div>
  );
}
