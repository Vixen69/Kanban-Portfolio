// Decisions by the gesture (ADR 052, author 2026-09-30): which moves are
// portfolio decisions. Entering Pause is « Mettre en pause »; changing a
// canal a person had already chosen is « Requalifier » — both need their
// trace, a "decided" event written WITH the move. Leaving the intake column
// is « Faire entrer »: a label on the move, nothing more. The first canal
// choice — the qualification, or the first correction of the canal an
// import put by default — is not a decision. Pure; no React, no Node.

import type { BoardConfig, CardEvent } from "./types.ts";
import { unifiedColumnIds } from "./layout.ts";

/** The Pause stage, found by its id like the other flow anchors. */
export const PAUSE_COLUMN_ID = "pause";
/** The referential's « Mettre en pause » (config decisions). */
export const PAUSE_DECISION_ID = "D4";
/** The referential's « Requalifier » (config decisions). */
export const REQUALIFY_DECISION_ID = "D5";
/** The actor the PPM import writes with: its moves choose no canal. */
export const IMPORT_ACTOR = "import-csv";

/** A card's place: canal and column. */
export interface Position {
  laneId: string;
  columnId: string;
}

/**
 * The stage side of a move: a same-cell reorder, the exit from the intake
 * column (« Faire entrer »), the entry into Pause, the exit from Pause
 * (« Reprise »), or any other move.
 */
export type StageGesture = "reorder" | "entry" | "pause" | "resume" | "move";

/** The canal side of a move: unchanged, first chosen, or changed again. */
export type CanalGesture = "none" | "qualification" | "requalification";

/** What a move means for the portfolio. */
export interface Gesture {
  stage: StageGesture;
  canal: CanalGesture;
}

function stageOf(config: BoardConfig, from: Position, to: Position): StageGesture {
  if (from.columnId === to.columnId && from.laneId === to.laneId) return "reorder";
  if (to.columnId === PAUSE_COLUMN_ID && from.columnId !== PAUSE_COLUMN_ID) return "pause";
  if (from.columnId === PAUSE_COLUMN_ID && to.columnId !== PAUSE_COLUMN_ID) return "resume";
  const intake = config.columns[0]?.id;
  if (from.columnId === intake && to.columnId !== intake) return "entry";
  return "move";
}

function canalOf(unified: ReadonlySet<string>, from: Position, to: Position, laneChosen: boolean): CanalGesture {
  if (unified.has(to.columnId)) return "none"; // before the RDO a card has no canal (ADR 039)
  if (unified.has(from.columnId)) {
    // Leaving the intake columns into a canal: the qualification — unless a
    // canal was chosen before (sent back to Qualification) and now changes.
    if (!laneChosen) return "qualification";
    return from.laneId === to.laneId ? "none" : "requalification";
  }
  if (from.laneId === to.laneId) return "none";
  return laneChosen ? "requalification" : "qualification";
}

/**
 * What a move means: its stage side and its canal side.
 * Inputs: the config (intake column, canal-less columns), where the card
 * is, where it goes, and whether a person already chose its canal.
 * Output: the Gesture. Failure: none — unknown columns read as plain moves.
 */
export function readGesture(config: BoardConfig, from: Position, to: Position, laneChosen: boolean): Gesture {
  const stage = stageOf(config, from, to);
  if (stage === "reorder") return { stage, canal: "none" };
  return { stage, canal: canalOf(unifiedColumnIds(config), from, to, laneChosen) };
}

/**
 * The decisions a move must carry: « Mettre en pause » on entering Pause,
 * « Requalifier » on changing a chosen canal — only those the config knows.
 * Inputs: the config, the gesture. Output: decision ids, pause first.
 * Failure: none.
 */
export function requiredDecisions(config: BoardConfig, gesture: Gesture): string[] {
  const ids: string[] = [];
  if (gesture.stage === "pause") ids.push(PAUSE_DECISION_ID);
  if (gesture.canal === "requalification") ids.push(REQUALIFY_DECISION_ID);
  return ids.filter((id) => config.decisions.some((decision) => decision.id === id));
}

// The recorded transition of a "moved" event (old events without
// fromLaneId read as a lane unchanged).
function recordedPositions(event: CardEvent): { from: Position; to: Position } {
  const lane = event.payload["laneId"];
  const fromLane = event.payload["fromLaneId"];
  const toLane = typeof lane === "string" ? lane : typeof fromLane === "string" ? fromLane : "";
  return {
    from: { laneId: typeof fromLane === "string" ? fromLane : toLane, columnId: event.fromColumn ?? "" },
    to: { laneId: toLane, columnId: event.toColumn ?? "" },
  };
}

/**
 * The gesture of every recorded "moved" event, reading the log in order
 * card by card: a canal counts as chosen once a hand move (not the
 * import's) qualified or requalified it.
 * Inputs: the config, the events in fold order (effective ones — ADR 042).
 * Output: a Map event id → Gesture (moved events only). Failure: none.
 */
export function gestureTrail(config: BoardConfig, events: readonly CardEvent[]): Map<string, Gesture> {
  const chosen = new Set<string>();
  const trail = new Map<string, Gesture>();
  for (const event of events) {
    if (event.type !== "moved") continue;
    const { from, to } = recordedPositions(event);
    const gesture = readGesture(config, from, to, chosen.has(event.cardId));
    trail.set(event.id, gesture);
    if (event.actor !== IMPORT_ACTOR && gesture.canal !== "none") chosen.add(event.cardId);
  }
  return trail;
}

/**
 * Whether a person already chose the card's canal (a hand move qualified
 * or requalified it) — the line between a qualification and a
 * requalification.
 * Inputs: the config, the card's events in fold order (others ignored).
 * Output: boolean. Failure: none.
 */
export function laneChosen(config: BoardConfig, cardId: string, events: readonly CardEvent[]): boolean {
  const mine = events.filter((event) => event.cardId === cardId);
  for (const [id, gesture] of gestureTrail(config, mine)) {
    const event = mine.find((candidate) => candidate.id === id);
    if (event !== undefined && event.actor !== IMPORT_ACTOR && gesture.canal !== "none") return true;
  }
  return false;
}
