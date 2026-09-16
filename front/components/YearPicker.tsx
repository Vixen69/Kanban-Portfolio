// The exercise shown (ADR 035, author 2026-09-16): a square badge with the
// year in the header and a small arrow; a menu lists the other years —
// the five before, the current one, the years after, plus every year that
// holds cards — with their status and card count. Picking a year switches
// the board, the filters and the analytics to that year's cards. Away
// from the current exercise a chip says so (« Préparation · horloge
// gelée », « Exercice clos »).

import { useState } from "react";
import { exerciseStatus } from "../../core/exercise.ts";
import type { ExerciseStatus } from "../../core/exercise.ts";

const STATUS_LABEL: Record<ExerciseStatus, string> = { closed: "clos", current: "en cours", preparing: "en préparation" };

/** Props of the year selector. */
export interface YearPickerProps {
  /** The exercise shown. */
  year: number;
  /** The years offered (core/exercise selectableYears). */
  years: number[];
  /** The current exercise (config). */
  currentYear: number;
  /** Cards per year, for the menu's hint. */
  counts: ReadonlyMap<number, number>;
  onYear: (year: number) => void;
}

function Chip({ status }: { status: ExerciseStatus }) {
  if (status === "current") return null;
  return (
    <span className={"year-chip " + status} title={status === "preparing"
      ? "Année en préparation : les cartes ne vieillissent pas tant que l’année n’est pas en cours"
      : "Année passée : lecture"}>
      {status === "preparing" ? "Préparation · horloge gelée" : "Exercice clos"}
    </span>
  );
}

/**
 * The header's year badge and its menu.
 * Inputs: YearPickerProps. Output: the badge, the status chip, the menu
 * when open. Failure modes: none.
 */
export function YearPicker({ year, years, currentYear, counts, onYear }: YearPickerProps) {
  const [open, setOpen] = useState(false);
  const status = exerciseStatus(year, currentYear);
  return (
    <div className="hd-year-wrap">
      <button className={"hd-year " + status} onClick={() => setOpen((o) => !o)}
        title="Exercice affiché — cliquer pour en changer" aria-haspopup="listbox" aria-expanded={open}>
        {year}<span className="hd-year-arrow">▾</span>
      </button>
      <Chip status={status} />
      {open && (
        <>
          <div className="hd-year-backdrop" onClick={() => setOpen(false)} />
          <ul className="hd-year-menu" role="listbox" aria-label="Exercice">
            {years.map((candidate) => (
              <li key={candidate}>
                <button className={"hd-year-item" + (candidate === year ? " on" : "")} role="option"
                  aria-selected={candidate === year} onClick={() => { onYear(candidate); setOpen(false); }}>
                  <b>{candidate}</b>
                  <span>{STATUS_LABEL[exerciseStatus(candidate, currentYear)]}</span>
                  <small>{counts.get(candidate) ?? 0} carte(s)</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
