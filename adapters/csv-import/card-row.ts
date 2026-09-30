// The import-time snapshot row of one project (the real load, 2026-08-01
// decisions): the board card an audited deck card becomes. Fields the
// exports never carry (tags, risks, blocage, notes...) stay empty: they
// are lived in the tool. Split from to-cards.ts to respect the 300-line
// file cap. Pure.

import type { BoardConfig, Card, ChargeEntry } from "../../core/types.ts";
import type { DomainRef } from "../../core/import-types.ts";
import { laneNature } from "../../core/config.ts";
import type { EnrichedCard } from "./enrich.ts";

/** The counter the row build feeds: plan de charge lines dropped for an unresolved métier. */
export interface ChargeCounter {
  chargesWithoutProfile: number;
}

/**
 * The board card of one deck card. An existing card passes the domain it
 * keeps (settleDomain, ADR 036) and its creation instant; a new one takes
 * the export's domain, else the first configured domain (reported as a
 * fallback by the import report, ADR 055).
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
    domain: domain?.domain ?? card.domainId ?? config.domains[0]?.id ?? "",
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
  };
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
