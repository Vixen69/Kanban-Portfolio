// Which cards draw days from each transverse domain's people (ADR 041,
// author 2026-09-17: « un filtre pour les projets qui embarquent de la
// ressource A&D ou INFRA »). Same reading as « cartes qui pèsent »
// (ADR 033) — the named persons of the domain through the plan de charge
// assignments, plus the generic demand rows of the domain — reduced to a
// yes/no per card for the sidebar filter. Pure; no React, no Node.

import type { BoardConfig, CapacitySnapshot } from "./types.ts";

/** Card ids drawing on each transverse domain, keyed by domain id. */
export type ResourceDraw = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * The cards drawing days from each transverse domain of the config.
 * Inputs: the capacity snapshot of the exercise shown (null when none was
 * imported), the board config. Output: one entry per transverse domain,
 * in config order — an empty set when nothing draws on it or without a
 * snapshot. Failure: none.
 */
export function resourceDrawByDomain(snapshot: CapacitySnapshot | null, config: BoardConfig): Map<string, Set<string>> {
  const draw = new Map<string, Set<string>>();
  for (const domain of config.domains) {
    if (domain.transverse === true) draw.set(domain.id, new Set());
  }
  if (snapshot === null) return draw;
  const domainOf = new Map(snapshot.persons.map((person) => [person.id, person.domain]));
  for (const assignment of snapshot.assignments) {
    const set = draw.get(domainOf.get(assignment.personId) ?? "");
    if (set !== undefined && assignment.jh > 0) set.add(assignment.cardId);
  }
  for (const row of snapshot.generic ?? []) {
    const set = row.domain === null ? undefined : draw.get(row.domain);
    if (set !== undefined && row.cardId !== null && row.jh > 0) set.add(row.cardId);
  }
  return draw;
}
