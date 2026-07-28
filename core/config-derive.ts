// Card ↔ config derivations (display-level, never events): the positional
// nature a canal confers (ADR 018) and the stale-reference remap after an
// admin topology edit (ADR 013). Split from config.ts to respect the
// 300-line file cap; config.ts re-exports both.

import type { BoardConfig, Card, NatureKey } from "./types.ts";

/**
 * The nature a card carries by sitting in a lane (design v11: nature is
 * positional — the card's nature IS its canal).
 * Inputs: the board config, a lane id. Output: the lane's natureKey,
 * "complicated" when the lane is unknown (stale reference). Failure: none.
 */
export function laneNature(config: BoardConfig, laneId: string): NatureKey {
  return config.lanes.find((lane) => lane.id === laneId)?.natureKey ?? "complicated";
}

// Keeps an id when it still exists in the collection, else first entry.
function keepOrFirst(id: string, items: readonly { id: string }[]): string {
  return items.some((item) => item.id === id) ? id : (items[0] as { id: string }).id;
}

/**
 * Remaps a card's config references for display after an admin edit removed
 * the lane, column, domain or type the card pointed at.
 * Input: any object carrying the card's laneId/columnId/domain/typeId, plus
 * a validated BoardConfig (all four collections non-empty).
 * Output: { laneId, columnId, domain, typeId } — each kept as-is when still
 * present in the config, otherwise remapped to the config's first entry
 * (a null typeId stays null: it references nothing).
 * Failure: none. Display-level fallback only — NEVER writes events.
 */
export function reconcileCardRefs(
  card: Pick<Card, "laneId" | "columnId" | "domain" | "typeId">,
  config: BoardConfig,
): Pick<Card, "laneId" | "columnId" | "domain" | "typeId"> {
  return {
    laneId: keepOrFirst(card.laneId, config.lanes),
    columnId: keepOrFirst(card.columnId, config.columns),
    domain: keepOrFirst(card.domain, config.domains),
    typeId: card.typeId === null ? null : keepOrFirst(card.typeId, config.types),
  };
}
