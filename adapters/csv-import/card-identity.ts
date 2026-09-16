// Identity of an imported card (ADR 035, author 2026-09-16): one project's
// instance in ONE exercise — its base id (the PE code, else a slug of the
// normalized name) suffixed with the year, so a re-import of the same year
// lands on the same card and next year's instance is another card. Cards
// stored before ADR 035 keep their bare id; the capacity snapshot, built
// with instance ids, is remapped onto them (withLegacyIds). Pure.

import type { CapacitySnapshot } from "../../core/types.ts";
import { instanceId } from "../../core/exercise.ts";
import type { EnrichedCard } from "./enrich.ts";

/**
 * Stable board id of an imported card in one exercise (ADR 035): its base
 * id suffixed with the year.
 * Inputs: the enriched card, the exercise year. Outputs: the id.
 * Failure modes: none.
 */
export function cardId(card: EnrichedCard, year: number): string {
  return instanceId(baseCardId(card), year);
}

/**
 * The year-less part of a card id: the PE code when the project has one,
 * else « IMP-<slug of the normalized name> ». Cards stored before ADR 035
 * carry exactly this as their id.
 * Inputs: the enriched card. Outputs: the base id. Failure modes: none.
 */
export function baseCardId(card: EnrichedCard): string {
  if (card.codename !== null) return card.codename;
  const slug = card.normalizedName.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `IMP-${slug === "" ? "sans-nom" : slug}`;
}

/**
 * The capacity snapshot with its card ids mapped onto the cards the load
 * actually refreshed (plan.aliases: instance id → stored bare id).
 * Inputs: the snapshot, the aliases. Output: a new snapshot (the input is
 * untouched) — the same object when there is nothing to map. Failure: none.
 */
export function withLegacyIds(snapshot: CapacitySnapshot, aliases: Map<string, string>): CapacitySnapshot {
  if (aliases.size === 0) return snapshot;
  const map = <T extends { cardId: string | null }>(rows: T[]): T[] =>
    rows.map((row) => ({ ...row, cardId: row.cardId === null ? null : aliases.get(row.cardId) ?? row.cardId }));
  return {
    ...snapshot,
    assignments: map(snapshot.assignments),
    ...(snapshot.generic === undefined ? {} : { generic: map(snapshot.generic) }),
    ...(snapshot.coutsDemand === undefined ? {} : { coutsDemand: map(snapshot.coutsDemand) }),
  };
}
