// JSONL fallback driver for the BoardStorage port (ADR 009).
// Zero-dependency, human-readable, append-only by discipline: the driver
// only ever appends lines, it never rewrites a committed record. It is the
// rollback when node:sqlite is unavailable on the target VM, and runs on
// any Node version. Single writer only — no cross-process locking (ADR 009).
// Same integrity boundary as the SQLite driver: tamper-resistance rests on
// filesystem permissions, not on the file format.
//
// Layout: one JSON object per line. Line 1 is a versioned header; then one
// "card" record per imported snapshot and one "event" record per event.
// The integer seq mirrors the SQLite driver so ids stay "evt-<seq>".

import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  truncateSync,
  writeSync,
} from "node:fs";
import type { BoardStorage } from "../../core/ports.ts";
import type { CardEventInput } from "../../core/events.ts";
import type { Card, CardEvent } from "../../core/types.ts";

const FORMAT = "kanban-board-storage";
// Version 2 = design-v9 card model (ADR 012). Files written under version 1
// carry the pre-v9 card shape and are refused on open: delete and reseed.
const VERSION = 2;

type CardRecord = { kind: "card"; card: Card };
type EventRecord = { kind: "event"; seq: number; event: CardEvent };

interface State {
  cards: Map<string, Card>;
  events: CardEvent[];
  maxSeq: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function headerLine(): string {
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

// Serializes a card snapshot and returns the clone that read-back yields, so
// the stored value never aliases the caller's mutable object.
function buildCard(card: Card): { line: string; card: Card } {
  const line = JSON.stringify({ kind: "card", card });
  return { line, card: (JSON.parse(line) as CardRecord).card };
}

// Serializes one event under seq. JSON.stringify throws here on a
// non-serializable payload (e.g. a cycle) — before any write — so a failed
// batch leaves the file untouched. The returned event mirrors the stored
// row (JSON drops undefined keys and coerces NaN/Infinity to null).
function buildEvent(seq: number, input: CardEventInput): { line: string; event: CardEvent } {
  const event: CardEvent = { ...input, id: `evt-${seq}` };
  const line = JSON.stringify({ kind: "event", seq, event });
  return { line, event: freezeEvent((JSON.parse(line) as EventRecord).event) };
}

function appendLines(fd: number, lines: string[]): void {
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
function loadState(content: string): {
  state: State;
  hasHeader: boolean;
  validBytes: number;
  endsClean: boolean;
} {
  const state: State = { cards: new Map(), events: [], maxSeq: 0 };
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

function doImport(fd: number, state: State, cards: Card[], events: CardEventInput[]): void {
  const built = cards.map(buildCard);
  const lines = built.map((entry) => entry.line);
  const parsedEvents: CardEvent[] = [];
  let seq = state.maxSeq;
  for (const input of events) {
    seq += 1;
    const { line, event } = buildEvent(seq, input); // throws before any write
    lines.push(line);
    parsedEvents.push(event);
  }
  appendLines(fd, lines);
  for (const entry of built) state.cards.set(entry.card.id, entry.card);
  for (const event of parsedEvents) state.events.push(event);
  state.maxSeq = seq;
}

// Appends one card snapshot plus its "created" event in a single write —
// the UI intake path. Duplicate ids are refused before any write: the caller
// allocates the id from the stored snapshot, so a collision is a logic error
// (or a second writer) — never overwrite. Both lines land in one appendLines
// batch so a card can never be persisted without its creation trace.
function doInsert(fd: number, state: State, card: Card, created: CardEventInput): CardEvent {
  if (state.cards.has(card.id)) {
    throw new Error(`Stockage JSONL : une carte avec l’identifiant « ${card.id} » existe déjà.`);
  }
  const builtCard = buildCard(card);
  const seq = state.maxSeq + 1;
  const builtEvent = buildEvent(seq, created); // throws before any write
  appendLines(fd, [builtCard.line, builtEvent.line]);
  state.cards.set(builtCard.card.id, builtCard.card);
  state.events.push(builtEvent.event);
  state.maxSeq = seq;
  return builtEvent.event;
}

function doAppend(fd: number, state: State, input: CardEventInput): CardEvent {
  const seq = state.maxSeq + 1;
  const { line, event } = buildEvent(seq, input);
  appendLines(fd, [line]);
  state.events.push(event);
  state.maxSeq = seq;
  return event;
}

function buildStorage(fd: number, state: State): BoardStorage {
  let open = true;
  const assertOpen = (): void => {
    if (!open) throw new Error("Stockage JSONL : opération sur un magasin fermé.");
  };
  return {
    importCards(cards, events) {
      assertOpen();
      doImport(fd, state, cards, events);
    },
    insertCard(card, created) {
      assertOpen();
      return doInsert(fd, state, card, created);
    },
    appendEvent(input) {
      assertOpen();
      return doAppend(fd, state, input);
    },
    listEvents() {
      assertOpen();
      return state.events.slice();
    },
    listBaseCards() {
      assertOpen();
      return [...state.cards.values()];
    },
    close() {
      if (!open) return;
      open = false;
      try {
        fsyncSync(fd);
      } catch {
        // best-effort durability flush before releasing the descriptor
      }
      closeSync(fd);
    },
  };
}

/**
 * Opens (creating it if needed) a JSONL-backed BoardStorage.
 * Inputs: the JSONL file path (a real path — no in-memory mode).
 * Output: an open BoardStorage; a new file gets the versioned header, and an
 * incomplete trailing line from an interrupted write is truncated on open.
 * Failure: throws when the file cannot be read/opened, the header is foreign,
 * the header version is not the current one (pre-v9 file — the error tells
 * the operator to delete the data file and reseed), or a non-final line is
 * corrupt; every method throws once close() has been called.
 */
export function createJsonlStorage(path: string): BoardStorage {
  const exists = existsSync(path);
  const content = exists ? readFileSync(path, "utf8") : "";
  const { state, hasHeader, validBytes, endsClean } = loadState(content);
  // Drop an incomplete trailing line (an interrupted write) before reopening
  // for append. Truncate by path: on Windows an O_APPEND descriptor cannot
  // be ftruncated, so this must happen before the append fd is opened. The
  // truncate→reopen window is safe under the single-writer rule (ADR 009).
  if (exists && Buffer.byteLength(content, "utf8") > validBytes) truncateSync(path, validBytes);
  const fd = openSync(path, "a");
  try {
    // If the kept content ends mid-line (a hand-edited last line with no
    // newline), terminate it so the next append cannot fuse onto it.
    if (!endsClean) {
      writeSync(fd, "\n");
      fsyncSync(fd);
    }
    if (!hasHeader) appendLines(fd, [headerLine()]);
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  return buildStorage(fd, state);
}
