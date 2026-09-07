// Card ↔ config derivations (display-level, never events): the positional
// nature a canal confers (ADR 018), the sub-domain vocabulary of a domain
// (ADR 022) and the stale-reference remap after an admin topology edit
// (ADR 013). Split from config.ts to respect the 300-line file cap;
// config.ts re-exports all three.

import type { BoardConfig, Card, NatureKey, SubDomain } from "./types.ts";

/**
 * The nature a card carries by sitting in a lane (design v11: nature is
 * positional — the card's nature IS its canal).
 * Inputs: the board config, a lane id. Output: the lane's natureKey,
 * "complicated" when the lane is unknown (stale reference). Failure: none.
 */
export function laneNature(config: BoardConfig, laneId: string): NatureKey {
  return config.lanes.find((lane) => lane.id === laneId)?.natureKey ?? "complicated";
}

/**
 * The sub-domains a domain declares (ADR 022).
 * Inputs: the board config, a domain id. Output: the domain's subDomains,
 * [] when the domain is unknown or not detailed. Failure: none.
 */
export function subDomainsOf(config: BoardConfig, domainId: string): SubDomain[] {
  return config.domains.find((domain) => domain.id === domainId)?.subDomains ?? [];
}

// Keeps an id when it still exists in the collection, else first entry.
function keepOrFirst(id: string, items: readonly { id: string }[]): string {
  return items.some((item) => item.id === id) ? id : (items[0] as { id: string }).id;
}

/** The config references a card carries, as remapped for display. */
export type CardRefs = Pick<Card, "laneId" | "columnId" | "domain" | "typeId" | "subDomain">;

/**
 * Remaps a card's config references for display after an admin edit removed
 * the lane, column, domain, type or sub-domain the card pointed at.
 * Input: any object carrying the card's laneId/columnId/domain/typeId/
 * subDomain, plus a validated BoardConfig (all collections non-empty).
 * Output: { laneId, columnId, domain, typeId, subDomain } — each kept as-is
 * when still present in the config, otherwise remapped to the config's
 * first entry (a null typeId stays null: it references nothing). The
 * sub-domain is kept only when the (remapped) domain still declares it,
 * else null — a sub-domain never survives its domain.
 * Failure: none. Display-level fallback only — NEVER writes events.
 */
export function reconcileCardRefs(card: CardRefs, config: BoardConfig): CardRefs {
  const domain = keepOrFirst(card.domain, config.domains);
  const wanted = card.subDomain ?? null;
  const subDomain =
    wanted !== null && subDomainsOf(config, domain).some((sub) => sub.id === wanted) ? wanted : null;
  return {
    laneId: keepOrFirst(card.laneId, config.lanes),
    columnId: keepOrFirst(card.columnId, config.columns),
    domain,
    typeId: card.typeId === null ? null : keepOrFirst(card.typeId, config.types),
    subDomain,
  };
}
