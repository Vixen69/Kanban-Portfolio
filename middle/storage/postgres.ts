// PostgreSQL driver for the BoardStorage port (ADR 016). node-postgres (`pg`)
// — the standard client, parameterized SQL, no ORM. Async (pg has no sync
// API). Schema: `cards` (import-time snapshots, upserted by id, ordered by an
// identity column) and the append-only `card_events` (a bigint sequence
// drives the "evt-<seq>" ids); a trigger blocks UPDATE/DELETE on the log.
// Same observable contract as the JSONL driver (storage/conformance).

import { Pool, type PoolClient } from "pg";
import type { BoardStorage, EventFilter } from "../../core/ports.ts";
import type { CardEventInput } from "../../core/events.ts";
import type { CapacitySnapshot, Card, CardEvent } from "../../core/types.ts";
import { summarizeSnapshot, type BoardSnapshot, type SnapshotSummary } from "../../core/snapshot.ts";
import { logError } from "../log.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cards (
  ord  bigint GENERATED ALWAYS AS IDENTITY,
  id   text PRIMARY KEY,
  data jsonb NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS card_events_seq;
CREATE TABLE IF NOT EXISTS card_events (
  seq  bigint PRIMARY KEY,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS card_events_card_id ON card_events ((data->>'cardId'));
CREATE TABLE IF NOT EXISTS capacity (
  id   text PRIMARY KEY,
  data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  id      text PRIMARY KEY,
  summary jsonb NOT NULL,
  data    jsonb NOT NULL
);
`;

// Append-only guard on the log — a product invariant (§1, ADR 016): blocks
// UPDATE/DELETE on card_events. ON by default. Turned OFF only for demo/dev
// (KANBAN_PG_APPEND_ONLY=0), to allow direct hand-edits of the database.
const APPEND_ONLY_ON = `
CREATE OR REPLACE FUNCTION card_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'card_events est append-only (UPDATE/DELETE interdits)';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS card_events_no_mutation ON card_events;
CREATE TRIGGER card_events_no_mutation
  BEFORE UPDATE OR DELETE ON card_events
  FOR EACH ROW EXECUTE FUNCTION card_events_immutable();
`;

const APPEND_ONLY_OFF = "DROP TRIGGER IF EXISTS card_events_no_mutation ON card_events;";

const UPSERT_CARD =
  "INSERT INTO cards (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data";

/** Runs `work` inside a transaction, committing on success, rolling back on throw. */
type Tx = <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;

// JSON round-trip, exactly as jsonb storage would (drops undefined keys,
// coerces NaN/Infinity to null), so the returned event mirrors the stored row.
// JSON.stringify throws here on a non-serializable payload (e.g. a cycle) —
// inside a transaction, so the batch rolls back and nothing is persisted.
function toStored(input: CardEventInput, seq: number): CardEvent {
  return JSON.parse(JSON.stringify({ ...input, id: `evt-${seq}` })) as CardEvent;
}

// Allocates the next seq, builds and inserts one event; returns the stored copy.
async function insertEvent(client: PoolClient, input: CardEventInput): Promise<CardEvent> {
  const res = await client.query<{ seq: string }>("SELECT nextval('card_events_seq') AS seq");
  const seq = Number((res.rows[0] as { seq: string }).seq);
  const event = toStored(input, seq);
  await client.query("INSERT INTO card_events (seq, data) VALUES ($1, $2)", [seq, event]);
  return event;
}

async function pgImport(runTx: Tx, cards: Card[], events: CardEventInput[]): Promise<void> {
  await runTx(async (client) => {
    for (const card of cards) await client.query(UPSERT_CARD, [card.id, card]);
    for (const input of events) await insertEvent(client, input);
  });
}

async function pgInsert(runTx: Tx, card: Card, created: CardEventInput): Promise<CardEvent> {
  return runTx(async (client) => {
    const ins = await client.query(
      "INSERT INTO cards (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id",
      [card.id, card],
    );
    if (ins.rowCount === 0) {
      throw new Error(`Stockage Postgres : une carte avec l’identifiant « ${card.id} » existe déjà.`);
    }
    return insertEvent(client, created);
  });
}

// The optional filter (ADR 040) becomes a WHERE clause: strictly after a
// sequence, and/or the events of some cards (indexed expression).
async function pgListEvents(pool: Pool, filter: EventFilter = {}): Promise<CardEvent[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.afterSeq !== undefined) {
    params.push(filter.afterSeq);
    where.push(`seq > $${params.length}`);
  }
  if (filter.cardIds !== undefined) {
    params.push([...filter.cardIds]);
    where.push(`data->>'cardId' = ANY($${params.length})`);
  }
  const clause = where.length === 0 ? "" : ` WHERE ${where.join(" AND ")}`;
  const res = await pool.query<{ data: CardEvent }>(`SELECT data FROM card_events${clause} ORDER BY seq ASC`, params);
  return res.rows.map((row) => (row as { data: CardEvent }).data);
}

// The capacity snapshot (ADR 024) lives in one row, replaced whole.
// One row per exercise year (id = the year, ADR 035). Rows written before
// ADR 035 sit under id 'current': read as a fallback for their own year.
const UPSERT_CAPACITY =
  "INSERT INTO capacity (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data";
const LEGACY_CAPACITY_ID = "current";

async function pgImportCapacity(runTx: Tx, snapshot: CapacitySnapshot): Promise<void> {
  await runTx(async (client) => {
    await client.query(UPSERT_CAPACITY, [String(snapshot.exerciseYear), snapshot]);
  });
}

async function pgGetCapacity(pool: Pool, year: number): Promise<CapacitySnapshot | null> {
  const res = await pool.query<{ data: CapacitySnapshot }>("SELECT data FROM capacity WHERE id = $1", [String(year)]);
  const row = res.rows[0];
  if (row !== undefined) return row.data;
  const legacy = await pool.query<{ data: CapacitySnapshot }>("SELECT data FROM capacity WHERE id = $1", [LEGACY_CAPACITY_ID]);
  const old = legacy.rows[0];
  return old !== undefined && old.data.exerciseYear === year ? old.data : null;
}

// Board snapshots (ADR 042): one row each, the summary stored beside the
// whole so the list never reads the cards. Kept for good.
async function pgSaveSnapshot(runTx: Tx, snapshot: BoardSnapshot): Promise<void> {
  await runTx(async (client) => {
    await client.query("INSERT INTO snapshots (id, summary, data) VALUES ($1, $2, $3)", [
      snapshot.id, summarizeSnapshot(snapshot), snapshot,
    ]);
  });
}

async function pgListSnapshots(pool: Pool): Promise<SnapshotSummary[]> {
  const res = await pool.query<{ summary: SnapshotSummary }>("SELECT summary FROM snapshots ORDER BY summary->>'ts' DESC, id DESC");
  return res.rows.map((row) => (row as { summary: SnapshotSummary }).summary);
}

async function pgLoadSnapshot(pool: Pool, id: string): Promise<BoardSnapshot | null> {
  const res = await pool.query<{ data: BoardSnapshot }>("SELECT data FROM snapshots WHERE id = $1", [id]);
  const row = res.rows[0];
  return row === undefined ? null : row.data;
}

// The restore of the base cards (ADR 042): the table replaced whole in one
// transaction, insertion order kept by the identity column.
async function pgRestoreCards(runTx: Tx, cards: Card[]): Promise<void> {
  await runTx(async (client) => {
    await client.query("DELETE FROM cards");
    for (const card of cards) await client.query(UPSERT_CARD, [card.id, card]);
  });
}

async function pgLastSeq(pool: Pool): Promise<number> {
  const res = await pool.query<{ seq: string }>("SELECT COALESCE(MAX(seq), 0) AS seq FROM card_events");
  return Number((res.rows[0] as { seq: string }).seq);
}

async function pgListBaseCards(pool: Pool): Promise<Card[]> {
  const res = await pool.query<{ data: Card }>("SELECT data FROM cards ORDER BY ord ASC");
  return res.rows.map((row) => (row as { data: Card }).data);
}

// Runs `work` in a transaction against a pooled client (commit, or rollback
// on throw). The client is always released back to the pool.
function makeTx(pool: Pool): Tx {
  return async (work) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}

// The read side of the port: plain queries on the pool, no transaction.
function pgReaders(pool: Pool, assertOpen: () => void): Pick<BoardStorage, "listEvents" | "listBaseCards" | "getCapacity"> {
  return {
    async listEvents(filter = {}) {
      assertOpen();
      return pgListEvents(pool, filter);
    },
    async listBaseCards() {
      assertOpen();
      return pgListBaseCards(pool);
    },
    async getCapacity(year) {
      assertOpen();
      return pgGetCapacity(pool, year);
    },
  };
}

// The snapshot side of the port (ADR 042).
function pgSnapshots(
  pool: Pool, runTx: Tx, assertOpen: () => void,
): Pick<BoardStorage, "saveSnapshot" | "listSnapshots" | "loadSnapshot" | "restoreCards" | "lastSeq"> {
  return {
    async saveSnapshot(snapshot) {
      assertOpen();
      await pgSaveSnapshot(runTx, snapshot);
    },
    async listSnapshots() {
      assertOpen();
      return pgListSnapshots(pool);
    },
    async loadSnapshot(id) {
      assertOpen();
      return pgLoadSnapshot(pool, id);
    },
    async restoreCards(cards) {
      assertOpen();
      await pgRestoreCards(runTx, cards);
    },
    async lastSeq() {
      assertOpen();
      return pgLastSeq(pool);
    },
  };
}

// The BoardStorage object over an open pool; `open` guards use-after-close.
function buildStorage(pool: Pool, runTx: Tx): BoardStorage {
  let open = true;
  const assertOpen = (): void => {
    if (!open) throw new Error("Stockage Postgres : opération sur un magasin fermé.");
  };
  return {
    async importCards(cards, events) {
      assertOpen();
      await pgImport(runTx, cards, events);
    },
    async insertCard(card, created) {
      assertOpen();
      return pgInsert(runTx, card, created);
    },
    async appendEvent(input) {
      assertOpen();
      return runTx((client) => insertEvent(client, input));
    },
    ...pgReaders(pool, assertOpen),
    ...pgSnapshots(pool, runTx, assertOpen),
    async importCapacity(snapshot) {

      assertOpen();
      await pgImportCapacity(runTx, snapshot);
    },
    async close() {
      if (!open) return;
      open = false;
      await pool.end();
    },
  };
}

/**
 * Opens a PostgreSQL-backed BoardStorage, creating the schema if needed.
 * Inputs: an optional connection string (else `pg` reads PG* env vars); and
 * appendOnly (default true) — when false, the UPDATE/DELETE guard on the log
 * is dropped so the database can be hand-edited directly (demo/dev only).
 * Output: an open BoardStorage; every method rejects once close() ran.
 * Failure: rejects when the database is unreachable, the schema DDL fails, or
 * an operation errors (a duplicate insertCard id, a non-serializable payload).
 */
export async function createPostgresStorage(connectionString?: string, appendOnly = true): Promise<BoardStorage> {
  const pool = connectionString ? new Pool({ connectionString }) : new Pool();
  // An idle pooled connection can emit 'error' with no query in flight (a DB
  // restart, failover or network blip). An 'error' event with no listener is a
  // fatal uncaught exception in Node — attach one so the middle logs it and
  // keeps running (the pool reconnects on the next query) instead of crashing.
  pool.on("error", (err) => logError("pg pool", err));
  await pool.query(SCHEMA);
  await pool.query(appendOnly ? APPEND_ONLY_ON : APPEND_ONLY_OFF);
  return buildStorage(pool, makeTx(pool));
}
