// Attaching the ProjetsCdP chefs de projet to the assembled cards
// (2026-09-08): only the cards that still lack an owner take one — a
// Responsable carried by Projets itself stays. Joined by Id (the codename),
// then by name — the name only when its rows carry no OTHER Id than the
// card's (ADR 058 §2, like enrich.ts sameProject): a namesake row of
// another Id is another project, refused and said as douteux — a « Doute
// à trancher » since ADR 062: the PMO may take that row's chef de projet
// (the log keeps the Id, never the name). Pure and dependency-free, like
// charges.ts.

import { normalizeLabel } from "./normalize.ts";
import type { CardAssembly, EnrichedCard } from "./enrich.ts";
import type { CdpTable } from "./cdp.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import { doubt, warn } from "./report.ts";
import type { ImportReport } from "./report.ts";
import { askOrPropose } from "./doubt-book.ts";
import type { DoubtBook } from "./doubt-book.ts";

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

/** The douteux of a namesake row carrying another Id (ADR 058 §2). */
export const CDP_OTHER_ID =
  "ProjetsCdP : le nom désigne un autre Id que celui de la carte — pas de jointure, aucun chef de projet emprunté";

interface Join {
  viaId: string | null;
  viaName: string | null;
  /** The Ids of the namesake rows, when the name was refused for carrying another one. */
  refused: string[] | null;
}

// The Id join first; the name only when its rows carry no other Id than the
// card's: with a card Id, any Id there is another one (the Id join failed);
// without, two Ids under one name are two projects.
function joinOf(card: EnrichedCard, cdp: CdpTable): Join {
  const key = card.codename === null ? null : normalizeLabel(card.codename);
  if (key !== null && cdp.byId.has(key)) return { viaId: key, viaName: null, refused: null };
  const name = card.normalizedName;
  if (!cdp.byName.has(name)) return { viaId: null, viaName: null, refused: null };
  const ids = cdp.idsByName.get(name) ?? [];
  const other = key !== null ? ids.length > 0 : ids.length > 1;
  return other ? { viaId: null, viaName: null, refused: ids } : { viaId: null, viaName: name, refused: null };
}

// ADR 062: the namesake row of another Id — no chef de projet (the
// tool's proposal, ADR 058), or that row's.
function takeNamesake(book: DoubtBook | undefined, card: EnrichedCard, ids: readonly string[]): boolean {
  const applied = askOrPropose(book, {
    kind: "join", detail: "cdp-nom", code: card.codename, name: card.normalizedName, title: card.title,
    why: `La carte n'a pas de ligne ProjetsCdP à son Id ; la ligne à son nom porte ${ids.length > 1 ? "d'autres Id" : "un autre Id"}` +
      ` (${ids.join(", ")}). L'outil n'emprunte pas son chef de projet.`,
    options: [
      { id: "non", label: "Ne pas rattacher", consequence: "carte sans chef de projet" },
      { id: `id:${ids.join("+")}`, label: `Prendre le chef de projet de la ligne ProjetsCdP à ce nom (Id ${ids.join(", ")})`, consequence: null },
    ],
    proposed: "non",
  });
  return applied !== "non";
}

/**
 * Fills the missing chefs de projet from ProjetsCdP, in place.
 * Inputs: the assembled deck (null when no perimeter), the CdpTable (null
 * when the file is absent — nothing happens), the report, the book of the
 * « Doutes à trancher » (ADR 062; absent = the refusal of ADR 058).
 * Outputs: the OwnerStats or null; side effects: the deck's owners and its
 * withOwner counter, one aggregated signalement for the cards still
 * without owner, one aggregated douteux for the namesake rows of another
 * Id (refused, ADR 058). Failure modes: none.
 */
export function attachOwners(deck: CardAssembly | null, cdp: CdpTable | null, report: ImportReport, book?: DoubtBook): OwnerStats | null {
  if (deck === null || cdp === null) return null;
  const stats: OwnerStats = { filled: 0, alreadySet: 0, stillMissing: 0, cdpOutside: 0 };
  const used = new Set<string>();
  const tallies = new Map<string, Tally>();
  const doubts = new Map<string, Tally>();
  for (const card of deck.cards) {
    const { viaId, viaName, refused } = joinOf(card, cdp);
    if (viaId !== null) used.add(`id:${viaId}`);
    if (viaName !== null) used.add(`nom:${viaName}`);
    if (card.owner !== null) {
      stats.alreadySet++;
      continue;
    }
    if (refused !== null) tallyInto(doubts, CDP_OTHER_ID, card.ref.line, refused.join(" / "));
    const taken = refused !== null && takeNamesake(book, card, refused);
    const owner = viaId !== null ? cdp.byId.get(viaId) : viaName !== null || taken ? cdp.byName.get(card.normalizedName) : null;
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
  for (const [message, t] of doubts) doubt(report, "assemblage", `${message} : ${tallyLabel(t)}`);
  return stats;
}
