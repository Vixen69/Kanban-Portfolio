// The COUT PREV reader's counters and their report wording (ADR 030), and
// the code-by-code cross-check of the two perimeters (COUT PREV against the
// Projets onglet). Split from couts.ts to respect the 300-line file cap.
// Pure and dependency-free.

import { normalizeLabel } from "./normalize.ts";
import type { ProjetsTable } from "./projets.ts";

/** Projects excluded from the perimeter, by reason (first reason wins). */
export interface CoutsExcluded {
  noYear: number;
  /** State label -> projects excluded for it (outside `exercise.states`). */
  etat: Map<string, number>;
  /** Type label -> projects excluded for it (outside the config's types). */
  type: Map<string, number>;
  arbitrage: number;
  noMe: number;
}

/** Counters of the COUT PREV reading, for the report. */
export interface CoutsStats {
  rows: number;
  otherYearRows: number;
  projectsSeen: number;
  retained: number;
  excluded: CoutsExcluded;
  /** Retained projects whose « Projet.Actif » says false (kept, informational). */
  inactive: number;
  /** Retained projects whose code is not a PE code (the author expects 4–5). */
  nonPe: number;
  domainResolved: number;
  domainUnknown: number;
}

/** Codes present on one side only, when both COUT PREV and Projets came. */
export interface PerimeterCheck {
  coutsFile: string;
  projetsFile: string;
  couts: number;
  projets: number;
  common: number;
  onlyCouts: string[];
  onlyProjets: string[];
}

/**
 * Spells the exclusions by reason for the report (« hors 2026 1 · état
 * hors liste 3 (Annulé 1, …) · type hors config 4 (…) · arbitrage 1 ·
 * sans ME 1 »). Inputs: the counters, the exercise year. Failure: none.
 */
export function excludedSummary(x: CoutsExcluded, year: string | number): string {
  const detail = (map: Map<string, number>): string => {
    const total = [...map.values()].reduce((a, b) => a + b, 0);
    return total === 0 ? "0" : `${total} (${[...map].map(([label, n]) => `${label} ${n}`).join(", ")})`;
  };
  return `hors ${year} ${x.noYear} · état hors liste ${detail(x.etat)} · type hors config ${detail(x.type)}` +
    ` · arbitrage ${x.arbitrage} · sans ME ${x.noMe}`;
}

/**
 * Compares the COUT PREV perimeter with the Projets onglet, code by code.
 * Inputs: both tables. Output: the counts and the codes present on one
 * side only (sorted). Failure modes: none.
 */
export function checkPerimeters(couts: ProjetsTable, projets: ProjetsTable): PerimeterCheck {
  const key = (id: string): string => normalizeLabel(id);
  const inCouts = new Map(couts.entries.map((e) => [key(e.id), e.id]));
  const inProjets = new Map(projets.entries.filter((e) => e.id !== "").map((e) => [key(e.id), e.id]));
  const onlyCouts = [...inCouts].filter(([k]) => !inProjets.has(k)).map(([, id]) => id).sort();
  const onlyProjets = [...inProjets].filter(([k]) => !inCouts.has(k)).map(([, id]) => id).sort();
  return {
    coutsFile: couts.fileName, projetsFile: projets.fileName,
    couts: inCouts.size, projets: inProjets.size, common: inCouts.size - onlyCouts.length, onlyCouts, onlyProjets,
  };
}
