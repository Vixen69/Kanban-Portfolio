// Where a load puts an existing card (ADR 026/058/060). The export places
// the COLUMN only — never the canal of an existing card (ADR 058). No
// position in the files (no jalons file, no jalon row) = the board's own
// stands, and the base card keeps the column the previous import wrote,
// so that « new since the previous import » keeps its meaning. A card a
// human moved to another column keeps it (divergence reported) — unless
// the jalons bring a position that is NEW since the previous import (the
// stored base card's column) and FURTHER along the flow than where the
// card stands (ADR 060, author 2026-09-30: « s'il y a le fichier
// ProjetsJalons, on prend cette info si elle est nouvelle ; si elle est
// d'un jalon qu'on n'avait pas avant, on actualise »). A hand-made card
// the load adopts (ADR 059) has no previous import: any jalon further
// than its column places it. A card in Pause is never taken out by a jalon
// (ADR 060 amendment, 2026-09-30): Pause is an arbitration decision, the
// divergence is said « en pause — nouveau jalon non appliqué ». Pure.

import type { BoardConfig, Card, CardState } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { movedEvent } from "../../core/events.ts";
import type { EnrichedCard } from "./enrich.ts";
import { IMPORT_ACTOR } from "./domain-conflicts.ts";
import type { BoardReading } from "./board-reading.ts";

/** A hand placement a newer jalon went past (ADR 060): the card is moved, and said. */
export interface AdvancedCard {
  cardId: string;
  title: string;
  fromColumn: string;
  toColumn: string;
}

/**
 * The Pause column of the model (config/board.json, by id): a card there
 * was put by a human — an arbitration decision (D4) no jalon undoes.
 */
export const PAUSE_COLUMN_ID = "pause";

/** What the position step records on the plan. */
export interface PositionLedger {
  events: CardEventInput[];
  moved: number;
  kept: number;
  divergences: Array<{ title: string; fromColumn: string; toColumn: string }>;
  advanced: AdvancedCard[];
  /** Cards in Pause a NEW jalon would move past it: left in Pause, said (counted in divergences too). */
  paused: AdvancedCard[];
}

/** One existing card as the position step reads it. */
export interface PositionInput {
  id: string;
  /** The folded card: where it stands now. */
  existing: CardState;
  /** The stored base card: the column the previous import wrote. */
  stored: Card | undefined;
  card: EnrichedCard;
  /** True when this load adopts the card (ADR 059). */
  adopted: boolean;
}

/**
 * The base card of an existing card placed as the load leaves it: the
 * stored canal and nature always (the export never places an existing
 * card's canal), the export's column when the files positioned the card,
 * else the stored column (ADR 060).
 * Inputs: the refreshed base card, the stored base card (undefined for a
 * new card: returned as is), whether the files positioned the card.
 * Output: the base card to write — a copy. Failure modes: none.
 */
export function placedLikeStored(fresh: Card, stored: Card | undefined, positioned: boolean): Card {
  if (stored === undefined) return fresh;
  return {
    ...fresh, laneId: stored.laneId, nature: stored.nature,
    columnId: positioned ? fresh.columnId : stored.columnId,
  };
}

function flowIndex(config: BoardConfig, columnId: string): number {
  return config.columns.findIndex((column) => column.id === columnId);
}

// A hand placement the jalons go past: a position new since the previous
// import (or a card adopted now) and further along the flow. A column the
// config no longer declares is never « further ».
function jalonGoesPast(input: PositionInput, config: BoardConfig): boolean {
  const { existing, stored, card, adopted } = input;
  const fresh = adopted || stored === undefined || stored.columnId !== card.columnId;
  const from = flowIndex(config, existing.columnId);
  const to = flowIndex(config, card.columnId);
  return fresh && from !== -1 && to !== -1 && to > from;
}

/**
 * Applies the position rule to one existing card of a load (ADR 026, 058,
 * 060): nothing without a position (kept); nothing when the card already
 * stands there; a divergence when the card is in Pause, whatever the
 * jalon — listed in paused (« en pause, nouveau jalon non appliqué ») only
 * when the jalon is new and goes past Pause, the only case where it would
 * have moved the card; a divergence when a human
 * placed it and the jalons do not go past that placement; nothing when the log's last word is already
 * this import move (ADR 058); else a `moved` event of the import actor.
 * Inputs: the plan's position ledger (mutated), the card, the board
 * reading, the config (the flow order), now. Output: none (the ledger).
 * Failure modes: none.
 */
export function refreshPosition(
  plan: PositionLedger, input: PositionInput, reading: BoardReading, config: BoardConfig, now: Date,
): void {
  const { id, existing, card } = input;
  if (!card.positioned) {
    plan.kept++;
    return;
  }
  if (existing.columnId === card.columnId) return;
  if (existing.columnId === PAUSE_COLUMN_ID) {
    const divergence = { title: card.title, fromColumn: existing.columnId, toColumn: card.columnId };
    plan.divergences.push(divergence);
    if (jalonGoesPast(input, config)) plan.paused.push({ cardId: id, ...divergence });
    return;
  }
  const handPlaced = reading.movedByHand.has(id);
  if (handPlaced && !jalonGoesPast(input, config)) {
    plan.divergences.push({ title: card.title, fromColumn: existing.columnId, toColumn: card.columnId });
    return;
  }
  const last = reading.lastPosition.get(id);
  if (last !== undefined && last.actor === IMPORT_ACTOR && last.toColumn === card.columnId) return;
  if (handPlaced) plan.advanced.push({ cardId: id, title: card.title, fromColumn: existing.columnId, toColumn: card.columnId });
  plan.moved++;
  plan.events.push(movedEvent(
    id,
    { laneId: existing.laneId, columnId: existing.columnId },
    { laneId: existing.laneId, columnId: card.columnId },
    IMPORT_ACTOR, now.toISOString(),
  ));
}
