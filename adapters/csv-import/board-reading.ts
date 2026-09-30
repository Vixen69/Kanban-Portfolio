// What a load reads of the board before planning (ADR 058): ONE reading
// of the log — the restore-filtered one (core/restore.ts, ADR 042), the
// same the fold reads — for every question the plan asks: the exercise's
// cards, who placed a card by hand, the last domain decisions, the cards
// deleted on the board, the last position each card was given, and the
// hand-made cards a load may adopt (ADR 059). An event a restore undid is
// kept in the log and never read here. Pure.

import type { Card, CardEvent, CardState } from "../../core/types.ts";
import { effectiveEvents } from "../../core/restore.ts";
import { foldEvents } from "../../core/state.ts";
import { cardsOfExercise, exerciseOf, hasExerciseSuffix, instanceId } from "../../core/exercise.ts";
import { eventSequence } from "../../core/event-sequence.ts";
import { IMPORT_ACTOR, priorDomainDecisions } from "./domain-conflicts.ts";
import type { PriorDecision } from "./domain-conflicts.ts";

/** The board as a load reads it, for one exercise. */
export interface BoardReading {
  /** The exercise's folded cards by id (deleted cards are gone, archived ones flagged). */
  current: Map<string, CardState>;
  /** The exercise's cards stored before ADR 035 (bare ids), by id. */
  legacy: Map<string, CardState>;
  /** Cards a human moved to ANOTHER column (a reorder or a canal-only move does not count). */
  movedByHand: Set<string>;
  /** The last domain decision the log holds per card (ADR 036). */
  priors: Map<string, PriorDecision>;
  /** Normalized codes and ids of the exercise's imported cards deleted on the board. */
  deleted: { ids: Set<string>; codes: Set<string> };
  /** Per card, the position-setting event the log wrote last (by sequence). */
  lastPosition: Map<string, CardEvent>;
  /** The exercise's live hand-made cards (source manual, not archived), by normalized code (ADR 059). */
  manualByCode: Map<string, CardState[]>;
  /** The exercise's imported cards living under another id than their code's (adopted earlier, ADR 059), by normalized code. */
  adoptedByCode: Map<string, CardState>;
}

/**
 * A project code as the identity rules compare it: trimmed, upper case.
 * Input: the code. Output: the key. Failure modes: none.
 */
export function codeKey(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Ids of the cards a human (not the loader) moved to another COLUMN — the
 * cards the export no longer places (ADR 026). A same-cell reorder (ADR
 * 019) and a canal-only move are not stage moves: they never pin a card.
 * Input: the events (the restore-filtered log). Output: the ids.
 * Failure modes: none.
 */
export function handMovedIds(events: readonly CardEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === "moved" && event.actor !== IMPORT_ACTOR && event.fromColumn !== event.toColumn) ids.add(event.cardId);
  }
  return ids;
}

// The deleted imported cards of the exercise: their ids, and their codes
// (a card adopted under a hand-made id, or a bare legacy id, is still
// found by its code). Hand-made cards never block an import (ADR 058).
function deletedOf(log: readonly CardEvent[], cards: readonly Card[], year: number, currentYear: number): BoardReading["deleted"] {
  const gone = new Set(log.filter((event) => event.type === "deleted").map((event) => event.cardId));
  const ids = new Set<string>();
  const codes = new Set<string>();
  for (const card of cards) {
    if (!gone.has(card.id) || card.source !== "csv" || exerciseOf(card, currentYear) !== year) continue;
    ids.add(card.id);
    const code = card.sciformaId ?? card.codename;
    if (code !== null) codes.add(codeKey(code));
  }
  return { ids, codes };
}

function lastPositions(log: readonly CardEvent[]): Map<string, CardEvent> {
  const last = new Map<string, CardEvent>();
  for (const event of log) {
    if (event.type !== "moved" && event.type !== "imported" && event.type !== "created") continue;
    if (event.type === "moved" && event.fromColumn === event.toColumn) continue;
    const seen = last.get(event.cardId);
    if (seen === undefined || eventSequence(event.id) > eventSequence(seen.id)) last.set(event.cardId, event);
  }
  return last;
}

// Hand-made cards by code, and imported cards living under an id that is
// not their code's (adopted by an earlier load).
function codeIndexes(current: Map<string, CardState>, year: number): Pick<BoardReading, "manualByCode" | "adoptedByCode"> {
  const manualByCode = new Map<string, CardState[]>();
  const adoptedByCode = new Map<string, CardState>();
  for (const card of current.values()) {
    if (card.source === "manual" && !card.archived && card.codename !== null && card.codename.trim() !== "") {
      const key = codeKey(card.codename);
      manualByCode.set(key, [...(manualByCode.get(key) ?? []), card]);
    }
    const code = card.sciformaId;
    if (card.source === "csv" && code !== null && card.id !== code && card.id !== instanceId(code, year)) {
      adoptedByCode.set(codeKey(code), card);
    }
  }
  return { manualByCode, adoptedByCode };
}

/**
 * Reads the board once for a load of one exercise (ADR 035/058).
 * Inputs: the stored base cards and the whole log, the exercise loaded,
 * the current exercise year. Output: the BoardReading. Failure modes: none.
 */
export function readBoard(cards: Card[], events: CardEvent[], year: number, currentYear: number): BoardReading {
  const log = effectiveEvents(events);
  const folded = cardsOfExercise(foldEvents(cards, log), year, currentYear);
  const current = new Map(folded.map((card) => [card.id, card]));
  return {
    current,
    legacy: new Map(folded.filter((card) => !hasExerciseSuffix(card.id)).map((card) => [card.id, card])),
    movedByHand: handMovedIds(log),
    priors: priorDomainDecisions(log),
    deleted: deletedOf(log, cards, year, currentYear),
    lastPosition: lastPositions(log),
    ...codeIndexes(current, year),
  };
}
