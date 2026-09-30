// ADR 054 (author, 2026-09-30 — « s'il y avait une info et que le nouvel
// import, il n'y a pas l'info, on garde »): a re-import never replaces a
// fact the board holds with an absence. A partial set of files (no
// ProjetsCdP, no SP, no plan de charge, no jalons...) or an empty cell
// leaves the field blank in the rebuilt card; the stored value stands
// instead. Only a value the files DO carry replaces the stored one — zero
// included, since zero is a figure. The plan de charge is one fact: when
// the files carry any usable line for the card, the new plan replaces the
// old one whole; when they carry none — or only lines whose métier stayed
// unresolved, counted in the report — the old plan stands whole.

import type { Card } from "../../core/types.ts";

// The facts an import writes, in the order the report lists them, with
// the words the report uses.
const FACTS = [
  ["title", "titre"],
  ["owner", "chef de projet"],
  ["typeId", "type"],
  ["codename", "code projet"],
  ["sciformaId", "identifiant Sciforma"],
  ["budgetRdli", "enveloppe RDLI k€"],
  ["budgetEstimated", "estimé k€"],
  ["budgetEngaged", "engagé k€"],
  ["budgetConsumed", "réalisé k€"],
  ["effortEstimated", "charge estimée j.h"],
  ["effortConsumed", "charge consommée j.h"],
  ["chargeByProfile", "plan de charge par métier"],
  ["dateRdr", "date RDR"],
] as const satisfies ReadonlyArray<readonly [keyof Card, string]>;

/** A fact an import writes and may leave blank. */
export type KeptFact = (typeof FACTS)[number][0];

/** How many cards kept their stored value of one fact, in the report's words. */
export interface KeptFactCount {
  label: string;
  cards: number;
}

/** Which cards kept their stored value of one fact (ADR 055: named, not only counted). */
export interface KeptFactCards {
  label: string;
  cardIds: string[];
}

/** The kept facts of a load: fact -> the ids of the cards that kept it, in load order. */
export type KeptTally = Map<KeptFact, string[]>;

// Blank = the files said nothing: null, an empty text, an empty list.
function blank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return Array.isArray(value) && value.length === 0;
}

/**
 * The refreshed card with its blank facts filled from the stored card.
 * Inputs: the card the files rebuilt, the stored base card (undefined for
 * a new card: nothing to keep), the tally naming the cards per kept fact
 * (mutated: the card's id is added under each fact it kept).
 * Output: the card to write — a copy, the inputs are left untouched.
 * Failure modes: none.
 */
export function keepStoredFacts(fresh: Card, stored: Card | undefined, tally: KeptTally): Card {
  if (stored === undefined) return fresh;
  const card: Card = { ...fresh };
  for (const [fact] of FACTS) {
    if (!blank(fresh[fact]) || blank(stored[fact])) continue;
    Object.assign(card, { [fact]: stored[fact] });
    tally.set(fact, [...(tally.get(fact) ?? []), fresh.id]);
  }
  return card;
}

/**
 * The tally in the report's order and words, facts never kept left out.
 * Input: the tally keepStoredFacts filled. Output: KeptFactCount[] (empty
 * when the files carried every fact the board held). Failure modes: none.
 */
export function keptFactCounts(tally: ReadonlyMap<KeptFact, readonly string[]>): KeptFactCount[] {
  return keptFactCards(tally).map(({ label, cardIds }) => ({ label, cards: cardIds.length }));
}

/**
 * The tally in the report's order and words, with the cards named (ADR 055).
 * Input: the tally keepStoredFacts filled. Output: KeptFactCards[] (empty
 * when nothing was kept). Failure modes: none.
 */
export function keptFactCards(tally: ReadonlyMap<KeptFact, readonly string[]>): KeptFactCards[] {
  return FACTS.flatMap(([fact, label]) => {
    const cardIds = tally.get(fact) ?? [];
    return cardIds.length === 0 ? [] : [{ label, cardIds: [...cardIds] }];
  });
}
