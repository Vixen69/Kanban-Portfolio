// JSONL fallback driver for the BoardStorage port (ADR 009).
// Zero-dependency, human-readable, append-only by discipline: the driver
// only ever appends lines, it never rewrites a committed record. It is the
// rollback when node:sqlite is unavailable on the target VM, and runs on
// any Node version. Single writer only — no cross-process locking (ADR 009).
// Same integrity boundary as the SQLite driver: tamper-resistance rests on
// filesystem permissions, not on the file format.
//
// Layout (jsonl-format.ts): one JSON object per line. Line 1 is a versioned
// header; then one "card" record per imported snapshot, one "event" record
// per event, and the last "capacity" record wins (ADR 024). The integer seq
// mirrors the SQLite driver so ids stay "evt-<seq>".

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, truncateSync, writeSync } from "node:fs";
import type { BoardStorage } from "../../core/ports.ts";
import type { CardEventInput } from "../../core/events.ts";
import type { CapacitySnapshot, Card, CardEvent } from "../../core/types.ts";
import { appendLines, buildCard, buildEvent, headerLine, loadState } from "./jsonl-format.ts";
import type { CapacityRecord, State } from "./jsonl-format.ts";

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

// Appends the whole capacity snapshot as one record; read-back is the
// stored clone, never the caller's object.
function doImportCapacity(fd: number, state: State, snapshot: CapacitySnapshot): void {
  const line = JSON.stringify({ kind: "capacity", snapshot });
  appendLines(fd, [line]);
  state.capacity = (JSON.parse(line) as CapacityRecord).snapshot;
}

function doAppend(fd: number, state: State, input: CardEventInput): CardEvent {
  const seq = state.maxSeq + 1;
  const { line, event } = buildEvent(seq, input);
  appendLines(fd, [line]);
  state.events.push(event);
  state.maxSeq = seq;
  return event;
}

// The read side of the port: copies of the projection, never the live state.
function readers(state: State, assertOpen: () => void): Pick<BoardStorage, "listEvents" | "listBaseCards" | "getCapacity"> {
  return {
    async listEvents() {
      assertOpen();
      return state.events.slice();
    },
    async listBaseCards() {
      assertOpen();
      return [...state.cards.values()];
    },
    async getCapacity() {
      assertOpen();
      return state.capacity === null ? null : structuredClone(state.capacity);
    },
  };
}

function buildStorage(fd: number, state: State): BoardStorage {
  let open = true;
  const assertOpen = (): void => {
    if (!open) throw new Error("Stockage JSONL : opération sur un magasin fermé.");
  };
  // The port is async (Postgres needs it); JSONL wraps its sync body per
  // method — a synchronous throw becomes a rejection, matching the contract.
  return {
    async importCards(cards, events) {
      assertOpen();
      doImport(fd, state, cards, events);
    },
    async insertCard(card, created) {
      assertOpen();
      return doInsert(fd, state, card, created);
    },
    async appendEvent(input) {
      assertOpen();
      return doAppend(fd, state, input);
    },
    ...readers(state, assertOpen),
    async importCapacity(snapshot) {
      assertOpen();
      doImportCapacity(fd, state, snapshot);
    },
    async close() {
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
