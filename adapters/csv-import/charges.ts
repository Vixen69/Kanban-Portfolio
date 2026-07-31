// Attaching the 2026 charges to the assembled cards: plan-de-charge
// projects join the deck by name, then PE code, then title; coverage and
// orphans are counted, and the nominative consolidation (taux ETP, base
// 200 j.h/an) lands in the report — names stay on this machine.

import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { EnrichedCard } from "./enrich.ts";
import type { PdcTable } from "./pdc.ts";
import { warn } from "./report.ts";
import type { ImportReport } from "./report.ts";

/** One per-profile charge attached to a card ("" profile = unassigned). */
export interface CardCharge {
  profileId: string | null;
  jh: number;
  done: number;
}

/** Coverage counters for the assembly read-out. */
export interface ChargeStats {
  covered: number;
  uncovered: number;
  pdcOutside: number;
  totalJh: number;
  totalDone: number;
}

/** Base of the taux-ETP reading: 200 j.h ≈ one full-time year. */
const ETP_BASE = 200;
const TOP_PERSONS = 15;

/**
 * Joins the plan de charge onto the cards and emits the nominative
 * consolidation.
 * Inputs: the cards (mutated: `charges` attached), the PdcTable (null ->
 * nothing happens), the report.
 * Outputs: the coverage stats or null; side effects: join-miss tallies,
 * one signalement per top mobilized person (jh 2026 / 200 -> taux ETP).
 * Failure modes: none.
 */
export function attachCharges(
  cards: EnrichedCard[], pdc: PdcTable | null, report: ImportReport,
): ChargeStats | null {
  if (pdc === null) return null;
  const stats: ChargeStats = {
    covered: 0, uncovered: 0, pdcOutside: 0,
    totalJh: pdc.totals.jh, totalDone: pdc.totals.done,
  };
  const byCode = new Map<string, string>();
  const byTitle = new Map<string, string | "ambiguous">();
  for (const project of pdc.projects.values()) {
    if (project.codename !== null && !byCode.has(project.codename)) {
      byCode.set(project.codename, project.normalizedName);
    }
    byTitle.set(project.normalizedTitle,
      byTitle.has(project.normalizedTitle) ? "ambiguous" : project.normalizedName);
  }
  const consumed = new Set<string>();
  const tallies = new Map<string, Tally>();
  for (const card of cards) {
    const key = joinKey(pdc, byCode, byTitle, card);
    const project = key === null ? undefined : pdc.projects.get(key);
    if (project === undefined) {
      stats.uncovered++;
      tallyInto(tallies, "carte sans plan de charge 2026", card.ref.line);
      continue;
    }
    consumed.add(project.normalizedName);
    card.charges = [...project.charges.entries()]
      .map(([profileId, c]): CardCharge => ({ profileId: profileId === "" ? null : profileId, ...c }));
    stats.covered++;
  }
  stats.pdcOutside = pdc.projects.size - consumed.size;
  for (const [message, t] of tallies) {
    warn(report, `${message} : ${tallyLabel(t)}`, "assemblage");
  }
  emitPersons(report, pdc);
  return stats;
}

function joinKey(
  pdc: PdcTable, byCode: Map<string, string>,
  byTitle: Map<string, string | "ambiguous">, card: EnrichedCard,
): string | null {
  if (pdc.projects.has(card.normalizedName)) return card.normalizedName;
  if (card.codename !== null) {
    const viaCode = byCode.get(card.codename);
    if (viaCode !== undefined) return viaCode;
  }
  const viaTitle = byTitle.get(card.normalizedName);
  return viaTitle === undefined || viaTitle === "ambiguous" ? null : viaTitle;
}

// The overload demonstrator: top mobilized persons, jh 2026 / 200 = ETP.
function emitPersons(report: ImportReport, pdc: PdcTable): void {
  const top = pdc.persons.slice(0, TOP_PERSONS);
  for (const person of top) {
    const etp = (person.jh / ETP_BASE).toFixed(2).replace(".", ",");
    warn(report,
      `mobilisation 2026 : « ${person.name} » ${etp} ETP (${person.jh} j.h prévisionnel · ${person.done} réel)`,
      "consolidation nominative");
  }
  if (pdc.persons.length > TOP_PERSONS) {
    warn(report,
      `consolidation nominative limitée aux ${TOP_PERSONS} premières personnes (${pdc.persons.length} au total)`,
      "consolidation nominative");
  }
}
