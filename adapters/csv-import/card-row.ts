// The import-time snapshot row of one project (the real load, 2026-08-01
// decisions): the board card an audited deck card becomes. Fields the
// exports never carry (tags, risks, blocage, notes...) stay empty: they
// are lived in the tool. Split from to-cards.ts to respect the 300-line
// file cap. Pure.

import type { BoardConfig, Card, ChargeEntry } from "../../core/types.ts";
import type { DomainRef } from "../../core/import-types.ts";
import { laneNature } from "../../core/config.ts";
import type { EnrichedCard } from "./enrich.ts";
import { isDeclaredDomain } from "./domain-conflicts.ts";

/** The counter the row build feeds: plan de charge lines dropped for an unresolved métier. */
export interface ChargeCounter {
  chargesWithoutProfile: number;
}

/**
 * The board card of one deck card. An existing card passes the domain it
 * keeps (settleDomain, ADR 036) and its creation instant; a new one takes
 * the export's domain, else NO domain (ADR 061, author 2026-09-30: never
 * a default domain — the card waits for a hand assignment, signalled on
 * the board and named by the import report). A positioned card records
 * whether the Sciforma done state placed it (`doneByState`, ADR 060).
 * Inputs: the board id, the deck card, the config, the charge counter
 * (mutated), the exercise year, the stored creation instant and domain of
 * an existing card. Output: the Card. Failure modes: none.
 */
export function toCard(
  id: string, card: EnrichedCard, config: BoardConfig, counter: ChargeCounter, year: number,
  keepCreatedAt?: string, domain?: DomainRef,
): Card {
  return {
    id,
    title: card.title,
    domain: domain?.domain ?? card.domainId ?? "",
    subDomain: domain === undefined ? card.subDomainId : domain.subDomain,

    laneId: card.laneId, columnId: card.columnId,
    owner: card.owner ?? "",
    criticality: "normal",
    typeId: card.typeId,
    codename: card.codename,
    nature: laneNature(config, card.laneId),
    tags: [], dependencies: [],
    blocked: false, blockedReason: null, blockedSince: null,
    effortEstimated: card.effortEstimated,
    effortConsumed: card.effortConsumed,
    budgetEstimated: card.budgetEstimated,
    budgetConsumed: card.budgetConsumed,
    loadPlan: null, resources: [], notes: "",
    budgetEngaged: card.budgetEngaged,
    budgetRdli: card.budgetRdli,
    chargeByProfile: chargesOf(card, counter),
    contentionProfiles: [], contentionNote: "",
    risks: [], projectConstraints: [], alerts: [],
    dateRdr: card.dateRdr,
    sciformaId: card.codename,
    custom: {},
    createdAt: keepCreatedAt ?? `${card.createdAt ?? new Date(0).toISOString().slice(0, 10)}T00:00:00.000Z`,
    source: "csv",
    exercise: year,
    ...(card.positioned ? { doneByState: card.doneByState === true } : {}),
  };
}

/**
 * The « domaine à vérifier » flag of a refreshed stored card (ADR 061):
 * set when the export resolves no domain for it, the card wears the FIRST
 * configured domain — the only one the old fallback ever gave (author,
 * 2026-09-30: « des projets à A&D qui ne sont pas à A&D ») — and no human
 * ever set that domain (no domain decision in the log — by hand or ADR
 * 036 — and no creation by hand): that domain may be the old default. A
 * card in any other domain got it from an export and is left alone.
 * Recomputed at each load — cleared otherwise. A
 * domain the config does not declare is never flagged: the board reads it
 * « Sans domaine » (to assign), not as a domain to check.
 * Inputs: the rebuilt card, whether the export resolved a domain, whether
 * a human set the card's domain, the config. Output: the card, flagged or
 * with no flag at all. Failure modes: none.
 */
export function withDomainFlag(card: Card, exportResolved: boolean, setByHand: boolean, config: BoardConfig): Card {
  const { domainUnresolved: _previous, ...rest } = card;
  const oldDefault = card.domain === config.domains[0]?.id;
  return !exportResolved && !setByHand && oldDefault && isDeclaredDomain(config, card.domain) ? { ...rest, domainUnresolved: true } : rest;
}

// The plan de charge lines a card keeps: those whose métier resolved to a
// profile; the others are counted and dropped.
function chargesOf(card: EnrichedCard, counter: ChargeCounter): ChargeEntry[] {
  return card.charges.flatMap((charge): ChargeEntry[] => {
    if (charge.profileId === null) {
      counter.chargesWithoutProfile++;
      return [];
    }
    return [{ profileId: charge.profileId, jh: charge.jh, done: charge.done }];
  });
}

/**
 * The fields an export never carries: lived in the tool — typed at the
 * creation of a hand-made card (ADR 057) or since. A load never rebuilds
 * them (ADR 054/059).
 */
const LIVED_FIELDS = [
  "criticality", "tags", "dependencies", "blocked", "blockedReason", "blockedSince", "loadPlan", "resources", "notes",
  "contentionProfiles", "contentionNote", "risks", "projectConstraints", "alerts", "custom",
] as const satisfies ReadonlyArray<keyof Card>;

/**
 * The refreshed card with the fields the export never carries taken back
 * from the stored base card. A hand-made card holds what was typed at its
 * creation in its BASE card, with no event behind it (ADR 057): rebuilding
 * that base from the export alone would erase its criticality, notes,
 * resources, risks, custom fields... when a load adopts it (ADR 059). An
 * imported card holds these fields at their empty defaults, so for it
 * nothing changes.
 * Inputs: the card the load rebuilt, the stored base card (undefined for a
 * new card). Output: a copy with the lived fields of the stored card (a
 * field the stored card lacks keeps its default) —
 * the fresh card itself when nothing was stored. Failure modes: none.
 */
export function keepLivedFields(fresh: Card, stored: Card | undefined): Card {
  if (stored === undefined) return fresh;
  const card: Card = { ...fresh };
  // A card stored by an older version may lack a field: the default stands.
  for (const field of LIVED_FIELDS) if (stored[field] !== undefined) Object.assign(card, { [field]: stored[field] });
  return card;
}
