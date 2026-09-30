// Identity of an imported card (ADR 035, author 2026-09-16): one project's
// instance in ONE exercise — its base id (the PE code, else a slug of the
// normalized name) suffixed with the year, so a re-import of the same year
// lands on the same card and next year's instance is another card. Cards
// stored before ADR 035 keep their bare id; the capacity snapshot, built
// with instance ids, is remapped onto them (withLegacyIds). ADR 058: a
// name-derived id is cut at 48 characters, so two long names may share one
// — those, and only those, take a short hash of their full name
// (disambiguateIds): the ids that do not collide never change. Which of
// the two a load lands on is then settled against the board, never by the
// rest of the deck alone (nameIdCandidates, load-identity.ts). Pure.

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
  if (card.baseId !== undefined) return card.baseId;
  if (card.codename !== null) return card.codename;
  return nameId(card.normalizedName);
}

function nameId(normalizedName: string): string {
  const slug = normalizedName.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `IMP-${slug === "" ? "sans-nom" : slug}`;
}

// FNV-1a, 32 bits, as 8 hex digits: a short, stable fingerprint of a name.
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * The two ids a code-less card may carry (ADR 058): the plain slug of its
 * name, and the same followed by a short hash of the full name — the one
 * it takes when a namesake of the deck is cut to the same slug. The load
 * lands on whichever the board already holds for this project
 * (load-identity.ts), so the id never depends on the rest of the deck.
 * Input: the enriched card. Output: both base ids, null for a card with a
 * code. Failure modes: none.
 */
export function nameIdCandidates(card: EnrichedCard): { plain: string; hashed: string } | null {
  if (card.codename !== null) return null;
  const plain = nameId(card.normalizedName);
  return { plain, hashed: `${plain}-${fingerprint(card.normalizedName)}` };
}

/**
 * Gives the deck cards whose name-derived ids collide (different full
 * names cut to the same 48 characters, ADR 058) a distinct id each: the
 * cut name followed by a short hash of the full name — the same whatever
 * the row order. Cards with a code, and name ids that do not collide, are
 * untouched. Two rows with the SAME name stay on one id (the load keeps
 * the first and says so).
 * Input: the deck (mutated: `baseId` set on the colliding cards).
 * Output: the collisions settled, each with its cards' titles.
 * Failure modes: none.
 */
export function disambiguateIds(deck: EnrichedCard[]): Array<{ id: string; titles: string[] }> {
  const byId = new Map<string, EnrichedCard[]>();
  for (const card of deck) {
    if (card.codename !== null) continue;
    const id = nameId(card.normalizedName);
    byId.set(id, [...(byId.get(id) ?? []), card]);
  }
  const settled: Array<{ id: string; titles: string[] }> = [];
  for (const [id, cards] of byId) {
    if (new Set(cards.map((card) => card.normalizedName)).size < 2) continue;
    for (const card of cards) card.baseId = `${id}-${fingerprint(card.normalizedName)}`;
    settled.push({ id, titles: cards.map((card) => card.title).sort((a, b) => a.localeCompare(b, "fr")) });
  }
  return settled;
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
