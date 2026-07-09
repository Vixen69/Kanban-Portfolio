// PostgreSQL driver for the BoardStorage port (ADR 016). node-postgres (`pg`)
// — the standard client, parameterized SQL, no ORM. Async (pg has no sync
// API). Schema: `cards` (import-time snapshots, upserted by id, ordered by an
// identity column) and the append-only `card_events` (a bigint sequence
// drives the "evt-<seq>" ids); a trigger blocks UPDATE/DELETE on the log.
// Same observable contract as the JSONL driver (storage/conformance).

import { Pool, type PoolClient } from "pg";
import type { BoardStorage } from "../../core/ports.ts";
import type { CardEventInput } from "../../core/events.ts";
import type { Card, CardEvent } from "../../core/types.ts";

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

async function pgListEvents(pool: Pool): Promise<CardEvent[]> {
  const res = await pool.query<{ data: CardEvent }>("SELECT data FROM card_events ORDER BY seq ASC");
  return res.rows.map((row) => (row as { data: CardEvent }).data);
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
    async listEvents() {
      assertOpen();
      return pgListEvents(pool);
    },
    async listBaseCards() {
      assertOpen();
      return pgListBaseCards(pool);
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
 * Inputs: an optional connection string (else `pg` reads PG* env vars).
 * Output: an open BoardStorage; every method rejects once close() ran.
 * Failure: rejects when the database is unreachable, the schema DDL fails, or
 * an operation errors (a duplicate insertCard id, a non-serializable payload).
 */
export async function createPostgresStorage(connectionString?: string): Promise<BoardStorage> {
  const pool = connectionString ? new Pool({ connectionString }) : new Pool();
  await pool.query(SCHEMA);
  return buildStorage(pool, makeTx(pool));
}
