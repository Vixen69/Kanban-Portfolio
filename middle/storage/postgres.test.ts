// Conformance for the Postgres driver against a LIVE database (ADR 016). It
// proves the same observable contract as the JSONL driver (storage/
// conformance), plus the append-only trigger. Guarded by KANBAN_PG_TEST_URL:
// with no live DB (normal `npm test`) every case skips; CI/local points it at
// the docker `db` service. node:test runs top-level tests serially, so the
// per-test schema reset is race-free.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { InMemoryEventStore, lifecycleEvent, movedEvent } from "../../core/events.ts";
import { foldEvents } from "../../core/state.ts";
import { testCard } from "../../core/test-helpers.ts";
import type { BoardStorage } from "../../core/ports.ts";
import { createPostgresStorage } from "./postgres.ts";

const URL = process.env["KANBAN_PG_TEST_URL"];
const SKIP = URL ? false : "KANBAN_PG_TEST_URL non défini — Postgres non testé";
const TS = "2026-06-01T10:00:00.000Z";

// Drops every object the driver creates, so the next open starts clean
// (parity with JSONL's fresh temp dir per test).
async function reset(): Promise<void> {
  const pool = new Pool({ connectionString: URL });
  await pool.query(
    "DROP TABLE IF EXISTS card_events; DROP TABLE IF EXISTS cards; " +
      "DROP SEQUENCE IF EXISTS card_events_seq; DROP FUNCTION IF EXISTS card_events_immutable() CASCADE;",
  );
  await pool.end();
}

const open = (): Promise<BoardStorage> => createPostgresStorage(URL);

async function withStore(work: (s: BoardStorage) => Promise<void>): Promise<void> {
  await reset();
  const store = await open();
  try {
    await work(store);
  } finally {
    await store.close();
  }
}

test("[pg] a fresh store is empty", { skip: SKIP }, () =>
  withStore(async (s) => {
    assert.deepEqual(await s.listEvents(), []);
    assert.deepEqual(await s.listBaseCards(), []);
  }));

test("[pg] appendEvent assigns sequential evt-<seq> ids", { skip: SKIP }, () =>
  withStore(async (s) => {
    const a = await s.appendEvent(lifecycleEvent("created", "S001", "local", TS));
    const b = await s.appendEvent(lifecycleEvent("blocked", "S001", "local", TS, { reason: "x" }));
    assert.equal(a.id, "evt-1");
    assert.equal(b.id, "evt-2");
    assert.deepEqual((await s.listEvents()).map((e) => e.id), ["evt-1", "evt-2"]);
  }));

test("[pg] events round-trip exactly, payload included", { skip: SKIP }, () =>
  withStore(async (s) => {
    const input = movedEvent("S042", { laneId: "laneA", columnId: "col1" }, { laneId: "laneB", columnId: "col3" }, "local", TS);
    const stored = await s.appendEvent(input);
    assert.deepEqual(await s.listEvents(), [stored]);
    assert.deepEqual(stored.payload, { fromLaneId: "laneA", laneId: "laneB" });
  }));

test("[pg] appendEvent's return mirrors the persisted payload (undefined dropped, NaN null)", { skip: SKIP }, () =>
  withStore(async (s) => {
    const returned = await s.appendEvent(
      lifecycleEvent("edited", "S001", "local", TS, { patch: { title: "T" }, dropped: undefined, coerced: NaN }),
    );
    assert.deepEqual(await s.listEvents(), [returned]);
    assert.equal("dropped" in returned.payload, false);
    assert.equal(returned.payload["coerced"], null);
  }));

test("[pg] seq stays monotonic across close and reopen", { skip: SKIP }, async () => {
  await reset();
  const first = await open();
  try {
    await first.appendEvent(lifecycleEvent("created", "S001", "local", TS));
    await first.appendEvent(lifecycleEvent("created", "S002", "local", TS));
  } finally {
    await first.close();
  }
  const again = await open();
  try {
    const third = await again.appendEvent(lifecycleEvent("created", "S003", "local", TS));
    assert.equal(third.id, "evt-3");
    assert.equal((await again.listEvents()).length, 3);
  } finally {
    await again.close();
  }
});

test("[pg] importCards round-trips full cards and their events, upserts by id", { skip: SKIP }, () =>
  withStore(async (s) => {
    const a = testCard({ id: "S100", tags: ["erp"], effortConsumed: 45.5, blocked: true, blockedReason: "x", blockedSince: TS });
    const b = testCard({ id: "S101", typeId: null, codename: null, owner: "" });
    await s.importCards([a, b], [lifecycleEvent("imported", "S100", "sync", TS), lifecycleEvent("imported", "S101", "sync", TS)]);
    assert.deepEqual(await s.listBaseCards(), [a, b]);
    assert.deepEqual((await s.listEvents()).map((e) => e.id), ["evt-1", "evt-2"]);
    await s.importCards([testCard({ id: "S100", title: "Après" })], []);
    const cards = await s.listBaseCards();
    assert.equal(cards.length, 2);
    assert.equal(cards.find((c) => c.id === "S100")?.title, "Après");
  }));

test("[pg] a failed import leaves nothing behind (rollback)", { skip: SKIP }, () =>
  withStore(async (s) => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    await assert.rejects(() =>
      s.importCards([testCard({ id: "S100" })], [lifecycleEvent("imported", "S100", "sync", TS, circular)]));
    assert.deepEqual(await s.listBaseCards(), []);
    assert.deepEqual(await s.listEvents(), []);
  }));

test("[pg] insertCard stores the card AND its created event; refuses a duplicate id", { skip: SKIP }, () =>
  withStore(async (s) => {
    const stored = await s.insertCard(testCard({ id: "S151", source: "manual" }), lifecycleEvent("created", "S151", "local", TS));
    assert.equal(stored.id, "evt-1");
    assert.equal((await s.listBaseCards()).length, 1);
    await assert.rejects(
      () => s.insertCard(testCard({ id: "S151" }), lifecycleEvent("created", "S151", "local", TS)),
      /existe déjà/,
    );
    assert.equal((await s.listEvents()).length, 1);
  }));

test("[pg] insertCard refuses an id already taken by an import", { skip: SKIP }, () =>
  withStore(async (s) => {
    await s.importCards([testCard({ id: "S100" })], []);
    await assert.rejects(
      () => s.insertCard(testCard({ id: "S100" }), lifecycleEvent("created", "S100", "local", TS)),
      /existe déjà/,
    );
    assert.equal((await s.listEvents()).length, 0);
  }));

test("[pg] an inserted card survives close and reopen", { skip: SKIP }, async () => {
  await reset();
  const card = testCard({ id: "S151", source: "manual" });
  const s1 = await open();
  try {
    await s1.insertCard(card, lifecycleEvent("created", "S151", "local", TS));
  } finally {
    await s1.close();
  }
  const s2 = await open();
  try {
    assert.deepEqual(await s2.listBaseCards(), [card]);
    await assert.rejects(() => s2.insertCard(testCard({ id: "S151" }), lifecycleEvent("created", "S151", "local", TS)), /existe déjà/);
  } finally {
    await s2.close();
  }
});

test("[pg] folds identically to the in-memory store", { skip: SKIP }, () =>
  withStore(async (s) => {
    const base = [testCard({ id: "S001" }), testCard({ id: "S002", columnId: "col2" })];
    const inputs = [
      movedEvent("S001", { laneId: "laneA", columnId: "col1" }, { laneId: "laneB", columnId: "col3" }, "local", "2026-06-02T08:00:00.000Z"),
      lifecycleEvent("blocked", "S002", "local", "2026-06-02T09:00:00.000Z", { reason: "attente" }),
      lifecycleEvent("edited", "S001", "local", "2026-06-03T10:00:00.000Z", { patch: { title: "Revu" } }),
    ];
    const memory = new InMemoryEventStore();
    for (const input of inputs) {
      memory.append(input);
      await s.appendEvent(input);
    }
    assert.deepEqual(foldEvents(base, await s.listEvents()), foldEvents(base, memory.list()));
  }));

test("[pg] close is idempotent, methods then reject", { skip: SKIP }, async () => {
  await reset();
  const s = await open();
  await s.close();
  await s.close();
  await assert.rejects(() => s.appendEvent(lifecycleEvent("created", "S001", "local", TS)));
  await assert.rejects(() => s.listEvents());
});

test("[pg] card_events is append-only (UPDATE and DELETE are blocked)", { skip: SKIP }, () =>
  withStore(async (s) => {
    await s.appendEvent(lifecycleEvent("created", "S001", "local", TS));
    const pool = new Pool({ connectionString: URL });
    try {
      await assert.rejects(() => pool.query("UPDATE card_events SET data = '{}'::jsonb"), /append-only/);
      await assert.rejects(() => pool.query("DELETE FROM card_events"), /append-only/);
    } finally {
      await pool.end();
    }
  }));

test("[pg] append-only OFF (demo switch) drops the guard — UPDATE succeeds", { skip: SKIP }, async () => {
  await reset();
  const s = await createPostgresStorage(URL, false);
  try {
    await s.appendEvent(lifecycleEvent("created", "S001", "local", TS));
    const pool = new Pool({ connectionString: URL });
    try {
      await assert.doesNotReject(() => pool.query("UPDATE card_events SET data = '{}'::jsonb"));
    } finally {
      await pool.end();
    }
  } finally {
    await s.close();
  }
});

test("[pg] reopening with the default RESTORES the append-only guard after a demo session", { skip: SKIP }, async () => {
  // The load-bearing inverse: a demo session dropped the trigger; the next
  // default open must recreate it, or « the event log is the truth » silently
  // dies in delivery (Lancer en Docker.cmd sets KANBAN_PG_APPEND_ONLY=0).
  await reset();
  const demo = await createPostgresStorage(URL, false);
  try {
    await demo.appendEvent(lifecycleEvent("created", "S001", "local", TS));
  } finally {
    await demo.close();
  }
  const restored = await createPostgresStorage(URL); // default appendOnly=true
  try {
    const pool = new Pool({ connectionString: URL });
    try {
      await assert.rejects(() => pool.query("UPDATE card_events SET data = '{}'::jsonb"), /append-only/);
      await assert.rejects(() => pool.query("DELETE FROM card_events"), /append-only/);
    } finally {
      await pool.end();
    }
  } finally {
    await restored.close();
  }
});
