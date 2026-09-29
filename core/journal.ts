// The global journal (ADR 052, author 2026-09-30: « un historique de tous
// les déplacements »): every move, decision, blocking, archiving and import
// of the board, newest first — a projection of the event log, nothing
// stored. Filtered on « Décisions depuis l'instantané de la séance » it is
// the decision record to send out after a review (Référentiel 7.8).
// Pure; no React, no Node.

import type { BoardConfig, CardEvent } from "./types.ts";
import { isReorder } from "./events.ts";
import { eventSequence } from "./event-sequence.ts";
import { unifiedColumnIds } from "./layout.ts";
import { gestureTrail, IMPORT_ACTOR, type Gesture } from "./gesture.ts";
import { gestureWords } from "./history.ts";
import { readDecision } from "./decision-record.ts";

/** The families the journal can show or hide. */
export type JournalKind = "move" | "decision" | "block" | "archive" | "import";

/** One line of the journal. */
export interface JournalRow {
  id: string;
  seq: number;
  ts: string;
  cardId: string;
  kind: JournalKind;
  /** « Faire entrer », « Mise en pause », « Déplacée », « Bloquée »… */
  label: string;
  /** Places « Actifs · Projets » — moves only. */
  from: string | null;
  to: string | null;
  /** The motif: a decision's terms and texts, a blocking reason. */
  detail: string | null;
  actor: string;
}

/** What the journal keeps. */
export interface JournalFilter {
  kinds: ReadonlySet<JournalKind>;
  /** Only the events after this log position (an instantané's logSeq). */
  afterSeq?: number;
  /** Only the events at or after this instant (ISO). */
  sinceTs?: string;
  /** Only these cards (the exercise shown, the search). */
  cardIds?: ReadonlySet<string>;
}

const LABELS: Partial<Record<CardEvent["type"], [JournalKind, string]>> = {
  created: ["move", "Créée"],
  imported: ["import", "Importée"],
  blocked: ["block", "Bloquée"],
  unblocked: ["block", "Débloquée"],
  archived: ["archive", "Archivée"],
  unarchived: ["archive", "Désarchivée"],
  deleted: ["archive", "Supprimée"],
  unlisted: ["import", "Absente du dernier import"],
  relisted: ["import", "De retour dans l'import"],
};

/**
 * A place in words: « Actifs · Projets », or the column alone before the
 * RDO (no canal there, ADR 039).
 * Inputs: the config, a canal id, a column id. Output: the words.
 * Failure: none — unknown ids read raw.
 */
export function placeName(config: BoardConfig, laneId: string | null, columnId: string | null): string {
  const column = config.columns.find((c) => c.id === columnId)?.name ?? columnId ?? "?";
  if (columnId === null || unifiedColumnIds(config).has(columnId) || laneId === null) return column;
  return `${column} · ${config.lanes.find((l) => l.id === laneId)?.name ?? laneId}`;
}

function moveRow(config: BoardConfig, event: CardEvent, gesture: Gesture | undefined): Pick<JournalRow, "kind" | "label" | "from" | "to"> {
  const fromLane = event.payload["fromLaneId"];
  const lane = event.payload["laneId"];
  const to = placeName(config, typeof lane === "string" ? lane : null, event.toColumn);
  const from = placeName(config, typeof fromLane === "string" ? fromLane : typeof lane === "string" ? lane : null, event.fromColumn);
  if (event.actor === IMPORT_ACTOR) return { kind: "import", label: "Déplacée par l'import", from, to };
  const words = gesture === undefined ? null : gestureWords(config, event, gesture);
  return { kind: "move", label: words ?? "Déplacée", from, to };
}

function decisionRow(config: BoardConfig, event: CardEvent): Pick<JournalRow, "kind" | "label" | "detail"> {
  const decision = readDecision(event);
  if (decision === null) return { kind: "decision", label: "Décision", detail: null };
  const type = config.decisions.find((d) => d.id === decision.decisionId);
  const kind = decision.pauseKind === null ? "" : decision.pauseKind === "tactique" ? " (tactique)" : " (parking)";
  const terms = config.decisionGrounds.filter((g) => decision.grounds.includes(g.id)).map((g) => g.name);
  const review = decision.reviewDate === null ? [] : [`réexamen ${decision.reviewDate.split("-").reverse().join("/")}`];
  const texts = [decision.natureChange, decision.reason].filter((t) => t !== "");
  const detail = [...terms, ...review, ...texts].join(" · ");
  return { kind: "decision", label: `${type?.name ?? decision.decisionId}${kind}`, detail: detail === "" ? null : detail };
}

// One event as a journal row, or null when the journal does not narrate it
// (reorders, edits, comments, the year switch, restores).
function toRow(config: BoardConfig, event: CardEvent, trail: ReadonlyMap<string, Gesture>): JournalRow | null {
  const base = { id: event.id, seq: eventSequence(event.id), ts: event.ts, cardId: event.cardId, actor: event.actor, from: null, to: null, detail: null };
  if (event.type === "moved") return isReorder(event) ? null : { ...base, ...moveRow(config, event, trail.get(event.id)) };
  if (event.type === "decided") return { ...base, ...decisionRow(config, event) };
  const known = LABELS[event.type];
  if (known === undefined) return null;
  const reason = event.type === "blocked" ? event.payload["reason"] : null;
  return { ...base, kind: known[0], label: known[1], detail: typeof reason === "string" && reason !== "" ? reason : null };
}

function kept(row: JournalRow, filter: JournalFilter): boolean {
  if (!filter.kinds.has(row.kind)) return false;
  if (filter.afterSeq !== undefined && row.seq <= filter.afterSeq) return false;
  if (filter.sinceTs !== undefined && row.ts < filter.sinceTs) return false;
  return filter.cardIds === undefined || filter.cardIds.has(row.cardId);
}

/**
 * The journal: the narrated events a filter keeps, newest first.
 * Inputs: the config, the effective events in log order (ADR 042 — undone
 * ones already set aside), the filter.
 * Output: JournalRow[]. Failure: none.
 */
export function journalRows(config: BoardConfig, events: readonly CardEvent[], filter: JournalFilter): JournalRow[] {
  const trail = gestureTrail(config, events);
  const rows: JournalRow[] = [];
  for (const event of events) {
    const row = toRow(config, event, trail);
    if (row !== null && kept(row, filter)) rows.push(row);
  }
  return rows.sort((a, b) => (a.ts !== b.ts ? (a.ts < b.ts ? 1 : -1) : b.seq - a.seq));
}

/**
 * The journal's head line counts: how many moves, decisions, blockings.
 * Input: the rows shown. Output: a count per kind. Failure: none.
 */
export function journalCounts(rows: readonly JournalRow[]): Record<JournalKind, number> {
  const counts: Record<JournalKind, number> = { move: 0, decision: 0, block: 0, archive: 0, import: 0 };
  for (const row of rows) counts[row.kind] += 1;
  return counts;
}
