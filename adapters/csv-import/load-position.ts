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
// divergence is said « en pause — nouveau jalon non appliqué ». A Sciforma
// done state does take it out (second amendment, author 2026-09-30: « si
// statut c'est terminé, c'est que c'est terminé ») when that state is NEW
// since the previous import (the base card's `doneByState`: the previous
// positioned load did not place it by its state, even when an RDR had
// put it in the terminal column) — said « sorti de Pause : état Sciforma
// terminé »; a repeat after a human put the card back in Pause leaves it
// there (a divergence: the hand wins on repeats). Pure.

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
  /** Cards in Pause a NEW Sciforma done state sent to the terminal column (counted in moved): « sorti de Pause : état Sciforma terminé ». */
  unpaused: AdvancedCard[];
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
 * card's canal), the export's column and `doneByState` when the files
 * positioned the card, else the stored ones (ADR 060) — so that the next
 * load still compares with the last import that positioned it.
 * Inputs: the refreshed base card, the stored base card (undefined for a
 * new card: returned as is), whether the files positioned the card.
 * Output: the base card to write — a copy. Failure modes: none.
 */
export function placedLikeStored(fresh: Card, stored: Card | undefined, positioned: boolean): Card {
  if (stored === undefined) return fresh;
  const { doneByState: _fresh, ...rest } = fresh;
  const placedBy = positioned ? fresh : stored;
  const placed: Card = { ...rest, laneId: stored.laneId, nature: stored.nature, columnId: placedBy.columnId };
  return placedBy.doneByState === undefined ? placed : { ...placed, doneByState: placedBy.doneByState };
}

function flowIndex(config: BoardConfig, columnId: string): number {
  return config.columns.findIndex((column) => column.id === columnId);
}

// The export's position is new since the previous import: the stored base
// card held another column, or there is no previous import (a card adopted
// now, or nothing stored under that id).
function isNewPosition(input: PositionInput): boolean {
  const { stored, card, adopted } = input;
  return adopted || stored === undefined || stored.columnId !== card.columnId;
}

// A hand placement the jalons go past: a position new since the previous
// import (or a card adopted now) and further along the flow. A column the
// config no longer declares is never « further ».
function jalonGoesPast(input: PositionInput, config: BoardConfig): boolean {
  const from = flowIndex(config, input.existing.columnId);
  const to = flowIndex(config, input.card.columnId);
  return isNewPosition(input) && from !== -1 && to !== -1 && to > from;
}

// The done STATE is new since the previous import: the previous positioned
// load did not place the card by its state (its jalons did — an RDR
// approved before the closure), or there is no previous import (a card
// adopted now, nothing stored under that id). A base card stored before
// `doneByState` existed is read by its column, the rule it was placed
// under: already in the terminal column = not new (no card leaves Pause
// in bulk at the first load after the upgrade; the flag rules after it).
function isNewDoneState(input: PositionInput): boolean {
  const { stored, card, adopted } = input;
  if (adopted || stored === undefined) return true;
  if (stored.doneByState !== undefined) return !stored.doneByState;
  return stored.columnId !== card.columnId;
}

// A card in Pause: true when it stays there. Only a Sciforma done state
// NEW since the previous import takes it out (listed in unpaused; the move
// follows). A staying card is a divergence, listed in paused when a new
// jalon goes past Pause — the only case where a jalon would have moved it.
function staysInPause(plan: PositionLedger, input: PositionInput, config: BoardConfig): boolean {
  const { id, existing, card } = input;
  const divergence = { title: card.title, fromColumn: existing.columnId, toColumn: card.columnId };
  if (card.doneByState === true && isNewDoneState(input)) {
    plan.unpaused.push({ cardId: id, ...divergence });
    return false;
  }
  plan.divergences.push(divergence);
  if (jalonGoesPast(input, config)) plan.paused.push({ cardId: id, ...divergence });
  return true;
}

/**
 * Applies the position rule to one existing card of a load (ADR 026, 058,
 * 060): nothing without a position (kept); nothing when the card already
 * stands there; a card in Pause leaves it only for a Sciforma done state
 * new since the previous import (listed in unpaused, then moved) — any
 * other position is a divergence, listed in paused (« en pause, nouveau
 * jalon non appliqué ») only when a new jalon goes past Pause; a
 * divergence when a human placed it and the jalons do not go past that
 * placement; nothing when the log's last word is already this import
 * move (ADR 058); else a `moved` event of the import actor.
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
  const inPause = existing.columnId === PAUSE_COLUMN_ID;
  if (inPause && staysInPause(plan, input, config)) return;
  const handPlaced = !inPause && reading.movedByHand.has(id);
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
