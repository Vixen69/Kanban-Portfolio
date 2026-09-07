// On-disk format of the JSONL driver (ADR 009) and its crash recovery:
// one JSON object per line — a versioned header first, then "card",
// "event" and "capacity" records. Record builders return the clone that
// read-back yields (never the caller's object); loadState rebuilds the
// projection and tolerates a torn final line. The driver itself (write
// paths, BoardStorage factory) lives in jsonl.ts.

import { fsyncSync, writeSync } from "node:fs";
import type { CardEventInput } from "../../core/events.ts";
import type { CapacitySnapshot, Card, CardEvent } from "../../core/types.ts";

const FORMAT = "kanban-board-storage";
// Version 2 = design-v9 card model (ADR 012). Files written under version 1
// carry the pre-v9 card shape and are refused on open: delete and reseed.
const VERSION = 2;

type CardRecord = { kind: "card"; card: Card };
type EventRecord = { kind: "event"; seq: number; event: CardEvent };
// The capacity snapshot (ADR 024): appended whole at each import, last wins.
export type CapacityRecord = { kind: "capacity"; snapshot: CapacitySnapshot };

/** The in-memory projection of one JSONL file. */
export interface State {
  cards: Map<string, Card>;
  events: CardEvent[];
  maxSeq: number;
  capacity: CapacitySnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The versioned header record (line 1). Output: its JSON line. Failure: none. */
export function headerLine(): string {
  return JSON.stringify({ kind: "header", format: FORMAT, version: VERSION });
}

// The header must be the first record; a missing or foreign one means the
// file is not ours — refuse rather than guess. A recognized file with a
// different version (pre-v9 data, or a future format) is refused with the
// remedy: the data file is a rebuildable cache of the fixtures/PPM source,
// so the operator deletes it and reseeds — no migration path is offered.
function validateHeader(rec: unknown): void {
  if (!isRecord(rec) || rec["kind"] !== "header" || rec["format"] !== FORMAT) {
    throw new Error("Stockage JSONL : en-tête de format absent ou non supporté.");
  }
  if (rec["version"] !== VERSION) {
    throw new Error(
      `Stockage JSONL : version de données ${String(rec["version"])} non prise en charge ` +
        `(version attendue : ${VERSION}). Ce fichier provient d’un modèle antérieur : ` +
        "supprimez le fichier de données puis relancez l’initialisation (npm run seed).",
    );
  }
}

// Returns a frozen event with a guaranteed object payload, so the in-memory
// snapshot cannot be mutated by a caller and matches the append-only file.
function freezeEvent(event: CardEvent): CardEvent {
  const payload = isRecord(event.payload) ? event.payload : {};
  const safe: CardEvent = { ...event, payload };
  Object.freeze(safe.payload);
  return Object.freeze(safe);
}

/**
 * Serializes a card snapshot and returns the clone that read-back yields, so
 * the stored value never aliases the caller's mutable object.
 * Input: the card. Output: its JSON line and the stored clone. Failure: none.
 */
export function buildCard(card: Card): { line: string; card: Card } {
  const line = JSON.stringify({ kind: "card", card });
  return { line, card: (JSON.parse(line) as CardRecord).card };
}

/**
 * Serializes one event under seq. JSON.stringify throws here on a
 * non-serializable payload (e.g. a cycle) — before any write — so a failed
 * batch leaves the file untouched. The returned event mirrors the stored
 * row (JSON drops undefined keys and coerces NaN/Infinity to null).
 * Inputs: the seq and the event input. Output: the line and the frozen event.
 * Failure: throws on a non-serializable payload.
 */
export function buildEvent(seq: number, input: CardEventInput): { line: string; event: CardEvent } {
  const event: CardEvent = { ...input, id: `evt-${seq}` };
  const line = JSON.stringify({ kind: "event", seq, event });
  return { line, event: freezeEvent((JSON.parse(line) as EventRecord).event) };
}

/**
 * Appends lines in one write, then fsyncs.
 * Inputs: an append fd and the lines (no trailing newline). Output: none.
 * Failure: propagates write errors; nothing is written for an empty list.
 */
export function appendLines(fd: number, lines: string[]): void {
  if (lines.length === 0) return;
  let payload = "";
  for (const line of lines) payload += line + "\n";
  writeSync(fd, payload);
  fsyncSync(fd);
}

// Numeric suffix of an event id ("evt-12" -> 12), matching core/state.ts.
// Used to recover seq when a hand-edited record carries only the id.
function idSequence(id: unknown): number {
  if (typeof id !== "string") return NaN;
  return Number(id.slice(id.lastIndexOf("-") + 1));
}

function applyRecord(state: State, rec: unknown, lineNo: number): void {
  if (!isRecord(rec)) throw new Error(`Stockage JSONL corrompu : ligne ${lineNo} invalide.`);
  if (rec["kind"] === "card") {
    const card = rec["card"] as Card;
    state.cards.set(card.id, card);
  } else if (rec["kind"] === "event") {
    const event = rec["event"] as CardEvent;
    state.events.push(freezeEvent(event));
    const seq = typeof rec["seq"] === "number" ? (rec["seq"] as number) : idSequence(event.id);
    if (Number.isFinite(seq) && seq > state.maxSeq) state.maxSeq = seq;
  } else if (rec["kind"] === "capacity") {
    state.capacity = rec["snapshot"] as CapacitySnapshot;
  } else {
    throw new Error(`Stockage JSONL corrompu : ligne ${lineNo}, type inconnu.`);
  }
}

/**
 * Rebuilds the in-memory state from the file content.
 * Inputs: the whole file as text.
 * Output: the state, whether a header was seen, the byte length of the
 * valid prefix (shorter than the content signals a torn final line), and
 * whether that prefix ends on a newline boundary (endsClean).
 * Failure: throws on a corrupt non-final line, a foreign/absent header, or
 * any garbage before the header; an unparseable final line of an
 * already-headed file is tolerated as crash recovery.
 */
export function loadState(content: string): {
  state: State;
  hasHeader: boolean;
  validBytes: number;
  endsClean: boolean;
} {
  const state: State = { cards: new Map(), events: [], maxSeq: 0, capacity: null };
  const lines = content.split("\n");
  let hasHeader = false;
  let validBytes = 0;
  let endsClean = true;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const isLast = i === lines.length - 1;
    if (!raw) {
      if (!isLast) validBytes += 1; // a blank line still occupies its "\n" byte
      continue;
    }
    let rec: unknown;
    try {
      rec = JSON.parse(raw);
    } catch {
      if (isLast && hasHeader) break; // torn final write — recover the prefix
      throw new Error(`Stockage JSONL corrompu : ligne ${i + 1} illisible.`);
    }
    if (!hasHeader) {
      validateHeader(rec);
      hasHeader = true;
    } else {
      applyRecord(state, rec, i + 1);
    }
    validBytes += Buffer.byteLength(raw, "utf8") + (isLast ? 0 : 1);
    endsClean = !isLast;
  }
  return { state, hasHeader, validBytes, endsClean };
}
