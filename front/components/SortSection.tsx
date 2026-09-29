// « Trier les cartes » (ADR 044): the sidebar section that orders the
// board for the arbitration session — the board's own order, the reste à
// faire (on the métiers the board gutter's lens counts — ADR 048 replaced
// the « par métier » key and its checkbox list by that lens), or the
// meilleur estimé; croissant or décroissant. Folded by default, the sort
// in force written on its title line. A view: nothing is written.

import { useState } from "react";
import type { SortKey } from "../../core/card-sort.ts";
import type { CardSorting, SortPanel } from "../useCardSort.ts";
import { Icon } from "./icons.tsx";

/** Props of the sort section. */
export interface SortSectionProps {
  sorting: CardSorting;
  panel: SortPanel;
}

const KEYS: [SortKey, string][] = [
  ["board", "Ordre du tableau"],
  ["remaining", "Reste à faire, j.h"],
  ["estimate", "Meilleur estimé, k€"],
];

// The three keys, then what the reste à faire counts: the lens's métiers,
// or every métier — and the cards it cannot rank.
function KeyRows({ sorting, panel }: SortSectionProps) {
  return (
    <>
      {KEYS.map(([key, label]) => (
        <label key={key} className="sort-opt">
          <input type="radio" name="card-sort" checked={sorting.sort.key === key} onChange={() => sorting.setKey(key)} />
          <span>{label}</span>
        </label>
      ))}
      <div className="sort-note">
        Reste à faire compté sur : {panel.scope ?? "tous les métiers"} (métiers cochés dans la colonne des totaux, deuxième Σ en haut à gauche).
        {panel.blind > 0 && ` ${panel.blind} carte(s) affichée(s) sans ventilation par métier.`}
      </div>
    </>
  );
}

/**
 * The « Trier les cartes » section of the sidebar.
 * Inputs: the sort state and its read-out. Output: the section DOM.
 * Failure modes: none.
 */
export function SortSection({ sorting, panel }: SortSectionProps) {
  const [open, setOpen] = useState(false);
  const { direction } = sorting.sort;
  return (
    <div className="sb-section">
      <button className="sort-head" onClick={() => setOpen((current) => !current)} title={open ? "Replier le tri" : "Déplier le tri"}>
        <span className="sb-label" style={{ marginBottom: 0 }}>Trier les cartes</span>
        <span className="sort-current">{panel.label ?? "ordre du tableau"}</span>
        <span className="pill-chev"><Icon name={open ? "chevron-down" : "chevron-right"} /></span>
      </button>
      {open && (
        <div className="sort-body">
          <KeyRows sorting={sorting} panel={panel} />
          <div className="sb-label sort-order-label">Ordre</div>
          <div className="pill-row">
            <button className={"pill" + (direction === "desc" ? " on" : "")} onClick={() => sorting.setDirection("desc")}>Décroissant</button>
            <button className={"pill" + (direction === "asc" ? " on" : "")} onClick={() => sorting.setDirection("asc")}>Croissant</button>
          </div>
        </div>
      )}
    </div>
  );
}
