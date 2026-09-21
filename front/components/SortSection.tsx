// « Trier les cartes » (ADR 044): the sidebar section that orders the
// board for the arbitration session — the board's own order, the reste à
// faire, the meilleur estimé, or the reste à faire of the métiers checked
// in a foldable list; croissant or décroissant. Folded by default, the
// sort in force written on its title line. A view: nothing is written.

import { useState } from "react";
import type { SortKey } from "../../core/card-sort.ts";
import { fmtNum } from "../format.ts";
import type { CardSorting, SortPanel } from "../useCardSort.ts";

/** Props of the sort section. */
export interface SortSectionProps {
  sorting: CardSorting;
  panel: SortPanel;
}

const KEYS: [SortKey, string][] = [
  ["board", "Ordre du tableau"],
  ["remaining", "Reste à faire, j.h"],
  ["estimate", "Meilleur estimé, k€"],
  ["profiles", "Reste à faire par métier"],
];

// The métiers with a reste à faire on the cards shown, largest first, each
// with its total: checking one sorts the board by it.
function ProfileList({ sorting, panel }: SortSectionProps) {
  if (panel.totals.length === 0) {
    return <div className="sort-note">Aucune ventilation par métier sur les cartes affichées.</div>;
  }
  return (
    <div className="sort-mets">
      {panel.totals.map(({ profile, raf }) => (
        <label key={profile.id} className="sort-met">
          <input type="checkbox" checked={sorting.sort.profileIds.includes(profile.id)}
            onChange={() => sorting.toggleProfile(profile.id)} />
          <span className="pill-dot" style={{ background: profile.color, opacity: 1 }} />
          <span className="sort-met-name">{profile.name}</span>
          <span className="sort-met-raf">{fmtNum(raf)} j</span>
        </label>
      ))}
      {panel.blind > 0 && <div className="sort-note">{panel.blind} carte(s) affichée(s) sans ventilation par métier.</div>}
    </div>
  );
}

// The four keys; the métier key carries the chevron that folds its list.
function KeyRows({ sorting, panel }: SortSectionProps) {
  const [listOpen, setListOpen] = useState(true);
  return (
    <>
      {KEYS.map(([key, label]) => (
        <label key={key} className="sort-opt">
          <input type="radio" name="card-sort" checked={sorting.sort.key === key} onChange={() => sorting.setKey(key)} />
          <span>{label}</span>
          {key === "profiles" && (
            <button className={"pill-chev" + (listOpen ? " open" : "")} title={listOpen ? "Replier les métiers" : "Déplier les métiers"}
              onClick={(event) => { event.preventDefault(); setListOpen((current) => !current); }}>{listOpen ? "▾" : "▸"}</button>
          )}
        </label>
      ))}
      {listOpen && <ProfileList sorting={sorting} panel={panel} />}
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
        <span className="pill-chev">{open ? "▾" : "▸"}</span>
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
