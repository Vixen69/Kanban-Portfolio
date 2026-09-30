// Two export projects landing on ONE board identity (ADR 058 §8): only one
// can be loaded. The load used to keep the first in the deck's order — the
// rows' order decided. ADR 062: the proposal no longer depends on the
// order (the first by code, then by title) and the PMO may pick the other
// — a « Doute à trancher » of kind identity. Pure.

import type { EnrichedCard } from "./enrich.ts";
import type { BoardReading } from "./board-reading.ts";
import { resolveIdentity } from "./load-identity.ts";
import { askOrPropose } from "./doubt-book.ts";
import type { DoubtBook } from "./doubt-book.ts";
import { fnv1a } from "./hash.ts";

/** The deck cards the load leaves out, with the words the change report says. */
export interface Collisions {
  losers: Set<EnrichedCard>;
  /** Plain French, one line per identity carried by several projects. */
  said: string[];
}

const optionOf = (card: EnrichedCard): string => `p:${fnv1a(`${card.codename ?? ""}\u001f${card.normalizedName}`)}`;

function byCodeThenTitle(a: EnrichedCard, b: EnrichedCard): number {
  const code = (a.codename ?? "").localeCompare(b.codename ?? "", "fr");
  return code !== 0 ? code : a.title.localeCompare(b.title, "fr");
}

// The identity each deck card lands on, read with a scratch ledger (the
// plan's own pass records aliases and adoptions); the book answers the
// same questions the same way on both passes.
function identities(deck: readonly EnrichedCard[], year: number, reading: BoardReading, book: DoubtBook | undefined): Map<string, EnrichedCard[]> {
  const scratch = { aliases: new Map<string, string>(), adopted: [], identityDoubts: [], ...(book === undefined ? {} : { book }) };
  const byId = new Map<string, EnrichedCard[]>();
  for (const card of deck) {
    const id = resolveIdentity(card, year, reading, scratch).id;
    byId.set(id, [...(byId.get(id) ?? []), card]);
  }
  return byId;
}

/**
 * The deck cards left out because another project of the export lands on
 * the same identity: the proposal keeps the first by code then title, the
 * PMO may keep another.
 * Inputs: the deck, the exercise, the board reading, the book.
 * Output: the cards to skip and the report lines. Failure modes: none.
 */
export function identityCollisions(deck: readonly EnrichedCard[], year: number, reading: BoardReading, book: DoubtBook | undefined): Collisions {
  const collisions: Collisions = { losers: new Set(), said: [] };
  for (const [id, cards] of identities(deck, year, reading, book)) {
    if (cards.length < 2) continue;
    const sorted = [...cards].sort(byCodeThenTitle);
    const first = sorted[0] as EnrichedCard;
    const applied = askOrPropose(book, {
      kind: "identity", detail: "collision", code: first.codename, name: first.normalizedName, title: first.title, cardId: id,
      why: `${cards.length} projets de l'export arrivent sur la même carte « ${id} » (${sorted.map((c) => `« ${c.title} »`).join(", ")}) ; ` +
        "un seul peut être chargé. L'outil garde le premier par code puis par titre.",
      options: sorted.map((c) => ({ id: optionOf(c), label: `Charger « ${c.title} »${c.codename === null ? "" : ` (${c.codename})`}`, consequence: null })),
      proposed: optionOf(first),
    });
    const kept = sorted.find((c) => optionOf(c) === applied) ?? first;
    for (const card of sorted) if (card !== kept) collisions.losers.add(card);
    collisions.said.push(
      `identité « ${id} » portée par ${cards.length} projets de l’export (${sorted.map((c) => `« ${c.title} »`).join(", ")}) — seul « ${kept.title} » est chargé`,
    );
  }
  return collisions;
}
