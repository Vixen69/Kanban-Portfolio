// Board snapshots (ADR 042, author 2026-09-17: « un garde-fou pour les
// personnes qui vont le reprendre »). A snapshot freezes what the log does
// not carry — the base cards, the capacity of each exercise, the applied
// config, the current exercise year — together with the log's position at
// that instant. Restoring puts those back and appends one `restored`
// event pointing at that position (core/restore.ts): nothing is deleted.

import type { BoardConfig, CapacitySnapshot, Card } from "./types.ts";
import type { CardEventInput } from "./events.ts";
import { RESTORE_CARD_ID } from "./restore.ts";

/** One stored snapshot: the facts beside the log, and where the log stood. */
export interface BoardSnapshot {
  id: string;
  /** ISO timestamp of the take. */
  ts: string;
  actor: string;
  /** Why it was taken — the PMO's words, or the automatic one's. */
  label: string;
  /** The sequence number of the last event at the take (0 = empty log). */
  logSeq: number;
  /** The current exercise year at the take. */
  exerciseYear: number;
  /** The base cards as stored (ADR 002: the fold's input, not the board). */
  cards: Card[];
  /** The capacity snapshot of every exercise year that had one. */
  capacity: CapacitySnapshot[];
  /** The applied config override, null when the versioned model ran. */
  configOverride: BoardConfig | null;
}

/** What a list shows of a snapshot — never its cards. */
export interface SnapshotSummary {
  id: string;
  ts: string;
  actor: string;
  label: string;
  logSeq: number;
  exerciseYear: number;
  cardCount: number;
  capacityYears: number[];
  hasOverride: boolean;
}

/**
 * The summary of one snapshot.
 * Input: the snapshot. Output: its SnapshotSummary. Failure: none.
 */
export function summarizeSnapshot(snapshot: BoardSnapshot): SnapshotSummary {
  return {
    id: snapshot.id,
    ts: snapshot.ts,
    actor: snapshot.actor,
    label: snapshot.label,
    logSeq: snapshot.logSeq,
    exerciseYear: snapshot.exerciseYear,
    cardCount: snapshot.cards.length,
    capacityYears: snapshot.capacity.map((entry) => entry.exerciseYear).sort((a, b) => a - b),
    hasOverride: snapshot.configOverride !== null,
  };
}

/**
 * The `restored` event a restore appends: board-wide (cardId "*"), its
 * payload naming the position gone back to and the snapshot.
 * Inputs: the snapshot restored, the actor, the ISO timestamp.
 * Output: the event input. Failure: none.
 */
export function restoreEvent(snapshot: BoardSnapshot, actor: string, ts: string): CardEventInput {
  return {
    ts,
    actor,
    cardId: RESTORE_CARD_ID,
    type: "restored",
    fromColumn: null,
    toColumn: null,
    payload: { toSeq: snapshot.logSeq, snapshotId: snapshot.id, label: snapshot.label },
  };
}
