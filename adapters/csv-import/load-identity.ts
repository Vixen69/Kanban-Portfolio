// Which board card a deck card lands on (ADR 035/058/059), in order: a
// card stored before ADR 035 under the bare code (kept, aliased); nothing
// when the PMO deleted that project's card on the board (skipped — a load
// never re-creates it); its own instance « code@année »; a card an earlier
// load adopted; a hand-made card of the same exercise carrying the same
// code, adopted (ADR 059, author 2026-09-30: « le projet manquant ajouté à
// la main » becomes the export's project instead of a duplicate). Every id
// the load maps onto another than « code@année » is recorded as an alias,
// so the capacity snapshot follows (withLegacyIds). A code-less card lands
// on the name id the board already holds for its project, whatever the
// rest of the deck (ADR 058, nameInstanceId). Pure.

import type { CardState } from "../../core/types.ts";
import { instanceId } from "../../core/exercise.ts";
import type { EnrichedCard } from "./enrich.ts";
import { baseCardId, cardId, nameIdCandidates } from "./card-identity.ts";
import { normalizeLabel } from "./normalize.ts";
import { codeKey } from "./board-reading.ts";
import type { BoardReading } from "./board-reading.ts";

/** A hand-made card a load adopted (ADR 059). */
export interface AdoptedCard {
  /** The hand-made card's id — kept. */
  id: string;
  code: string;
  /** The export's title (the card's from now on). */
  title: string;
  /** The title the card carried on the board before. */
  manualTitle: string;
}

/** What the identity step records on the plan. */
export interface IdentityLedger {
  aliases: Map<string, string>;
  adopted: AdoptedCard[];
  /** Plain French, one line per case the load could not settle alone. */
  identityDoubts: string[];
}

/** Where a deck card lands: a board id, or nothing because it was deleted there. */
export type Identity = { kind: "card"; id: string } | { kind: "deleted"; id: string };

function alias(ledger: IdentityLedger, card: EnrichedCard, year: number, id: string): Identity {
  ledger.aliases.set(cardId(card, year), id);
  return { kind: "card", id };
}

function isDeleted(reading: BoardReading, card: EnrichedCard, id: string): boolean {
  if (reading.deleted.ids.has(id) || reading.deleted.ids.has(baseCardId(card))) return true;
  return card.codename !== null && reading.deleted.codes.has(codeKey(card.codename));
}

// The hand-made card to adopt: exactly one of the exercise carries the
// code; two or more is a question for the PMO — none is adopted.
function manualToAdopt(ledger: IdentityLedger, reading: BoardReading, code: string): CardState | null {
  const found = reading.manualByCode.get(codeKey(code)) ?? [];
  if (found.length === 1) return found[0] ?? null;
  if (found.length > 1) {
    ledger.identityDoubts.push(
      `code « ${code} » porté par ${found.length} cartes créées à la main (${found.map((c) => c.id).join(", ")})` +
        " — aucune adoptée, la carte de l’export est créée à part",
    );
  }
  return null;
}

// True when the stored card carries this project's title — as the board
// shows it, or as the last import wrote it in its base card.
function sameProject(stored: CardState, card: EnrichedCard, reading: BoardReading): boolean {
  const titles = [stored.title, reading.baseTitles.get(stored.id) ?? stored.title].map(normalizeLabel);
  return titles.includes(normalizeLabel(card.title));
}

// The instance id of a code-less card (ADR 058), the same whatever the
// rest of the deck: the hashed name id when the board holds it; the plain
// one when the board holds it under this project's title (loaded alone
// before, its namesake arrives now); else the deck's own choice (hashed
// only when a namesake of the deck is cut to the same slug).
function nameInstanceId(card: EnrichedCard, year: number, reading: BoardReading): string {
  const own = cardId(card, year);
  const names = nameIdCandidates(card);
  if (names === null) return own;
  const hashed = instanceId(names.hashed, year);
  if (reading.current.has(hashed)) return hashed;
  const plain = instanceId(names.plain, year);
  const stored = reading.current.get(plain);
  return stored !== undefined && sameProject(stored, card, reading) ? plain : own;
}

/**
 * The board card a deck card lands on in one exercise.
 * Inputs: the deck card, the exercise year, the board reading, the plan's
 * identity ledger (aliases, adoptions and doubts recorded there).
 * Output: the Identity. Failure modes: none.
 */
export function resolveIdentity(card: EnrichedCard, year: number, reading: BoardReading, ledger: IdentityLedger): Identity {
  const legacy = reading.legacy.get(baseCardId(card));
  if (legacy !== undefined) return alias(ledger, card, year, legacy.id);
  if (card.codename === null) {
    const id = nameInstanceId(card, year, reading);
    if (isDeleted(reading, card, id)) return { kind: "deleted", id };
    return id === cardId(card, year) ? { kind: "card", id } : alias(ledger, card, year, id);
  }
  const id = cardId(card, year);
  if (isDeleted(reading, card, id)) return { kind: "deleted", id };
  if (reading.current.has(id)) return { kind: "card", id };
  const earlier = reading.adoptedByCode.get(codeKey(card.codename));
  if (earlier !== undefined) return alias(ledger, card, year, earlier.id);
  const manual = manualToAdopt(ledger, reading, card.codename);
  if (manual === null) return { kind: "card", id };
  ledger.adopted.push({ id: manual.id, code: card.codename, title: card.title, manualTitle: manual.title });
  return alias(ledger, card, year, manual.id);
}
