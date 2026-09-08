// Attaching the ProjetsCdP chefs de projet to the assembled cards
// (2026-09-08): only the cards that still lack an owner take one — a
// Responsable carried by Projets itself stays. Joined by Id (the codename),
// then by name. Pure and dependency-free, like charges.ts.

import { normalizeLabel } from "./normalize.ts";
import type { CardAssembly } from "./enrich.ts";
import type { CdpTable } from "./cdp.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import { warn } from "./report.ts";
import type { ImportReport } from "./report.ts";

/** What the ProjetsCdP join did, for the assembly read-out. */
export interface OwnerStats {
  /** Cards that got their chef de projet from ProjetsCdP. */
  filled: number;
  /** Cards that already had one from Projets (kept). */
  alreadySet: number;
  /** Cards still without chef de projet after both sources. */
  stillMissing: number;
  /** ProjetsCdP rows matching no card of the perimeter. */
  cdpOutside: number;
}

/**
 * Fills the missing chefs de projet from ProjetsCdP, in place.
 * Inputs: the assembled deck (null when no perimeter), the CdpTable (null
 * when the file is absent — nothing happens), the report.
 * Outputs: the OwnerStats or null; side effects: the deck's owners and its
 * withOwner counter, one aggregated signalement for the cards still
 * without owner. Failure modes: none.
 */
export function attachOwners(deck: CardAssembly | null, cdp: CdpTable | null, report: ImportReport): OwnerStats | null {
  if (deck === null || cdp === null) return null;
  const stats: OwnerStats = { filled: 0, alreadySet: 0, stillMissing: 0, cdpOutside: 0 };
  const used = new Set<string>();
  const tallies = new Map<string, Tally>();
  for (const card of deck.cards) {
    const key = card.codename === null ? null : normalizeLabel(card.codename);
    const viaId = key !== null && cdp.byId.has(key) ? key : null;
    const viaName = viaId === null && cdp.byName.has(card.normalizedName) ? card.normalizedName : null;
    if (viaId !== null) used.add(`id:${viaId}`);
    if (viaName !== null) used.add(`nom:${viaName}`);
    if (card.owner !== null) {
      stats.alreadySet++;
      continue;
    }
    const owner = viaId !== null ? cdp.byId.get(viaId) : viaName !== null ? cdp.byName.get(viaName) : null;
    if (owner === null || owner === undefined) {
      stats.stillMissing++;
      tallyInto(tallies, "carte sans chef de projet (ni Projets ni ProjetsCdP)", card.ref.line);
      continue;
    }
    card.owner = owner;
    deck.stats.withOwner++;
    stats.filled++;
  }
  stats.cdpOutside = [...cdp.byId.keys()].filter((id) => !used.has(`id:${id}`)).length;
  for (const [message, t] of tallies) warn(report, `${message} : ${tallyLabel(t)}`, "assemblage");
  return stats;
}
