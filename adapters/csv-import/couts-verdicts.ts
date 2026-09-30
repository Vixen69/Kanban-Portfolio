// The verdict of the perimeter rules on each project, in plain French
// (ADR 055, author 2026-09-30: « savoir vraiment ce qu'il a pris »): the
// COUT PREV rule (ADR 030) and the Projets onglet's structural gates name
// every project they retained or left out, with the value that decided.
// Split from couts.ts and projets.ts to respect the 300-line file cap. Pure.

import { typeBaseLabel } from "./domains.ts";
import type { PerimeterVerdict } from "./projets-types.ts";

/** The facts of one COUT PREV project the rule reads (first row's). */
export interface CoutsFacts {
  id: string;
  name: string;
  etat: string;
  /** « Projet.Type » as exported, with its « (Projet) » suffix. */
  type: string;
}

const quoted = (value: string): string => `« ${value === "" ? "(vide)" : value} »`;

/**
 * The verdict of the COUT PREV rule on one project, worded for the PMO.
 * Inputs: the project's facts, the motive (retained or the first failing
 * rule), the exercise year. Output: a PerimeterVerdict. Failure: none.
 */
export function coutsVerdict(facts: CoutsFacts, motive: PerimeterVerdict["motive"], year: string): PerimeterVerdict {
  const type = typeBaseLabel(facts.type);
  const reasons: Record<PerimeterVerdict["motive"], string> = {
    retained: `état ${quoted(facts.etat)}, type ${quoted(type)}`,
    noYear: `hors exercice ${year} (aucune ligne sur l’année)`,
    state: `état ${quoted(facts.etat)} hors des états retenus`,
    type: `type ${quoted(type)} hors des types retenus`,
    arbitrage: "ligne d’arbitrage (« arbitrage » dans le nom)",
    noMe: `aucune cellule ME non nulle sur ${year} (vide ou annulé de fait)`,
    duplicate: "Id en double — première ligne gardée",
  };
  return { code: facts.id, name: facts.name, motive, reason: reasons[motive] };
}

/**
 * The verdict of the Projets onglet on one row: every row is a card (the
 * PMO's list rules), except a row whose Id another row kept carries
 * (duplicate-rows.ts: the same row kept whatever the row order).
 * Inputs: the code, the name, the type as written, the process state,
 * the line of the row kept for this Id when this one is set aside (null =
 * this row is kept).
 * Output: a PerimeterVerdict. Failure: none.
 */
export function projetsVerdict(code: string, name: string, type: string, state: string, keptLine: number | null): PerimeterVerdict {
  if (keptLine !== null) {
    return { code, name, motive: "duplicate", reason: `Id en double — la ligne ${keptLine} est gardée` };
  }
  const etat = state === "" ? "" : `état ${quoted(state)}, `;
  return { code, name, motive: "retained", reason: `${etat}type ${quoted(typeBaseLabel(type))} (l’onglet Projets fait foi)` };
}
