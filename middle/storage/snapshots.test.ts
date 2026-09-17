// The snapshot side of the BoardStorage port on the JSONL driver (ADR 042):
// snapshots kept for good and listed newest first, the base cards replaced
// whole by a restore, the log's position — all of it surviving a reopen.
// The Postgres driver proves the same in postgres.test.ts (env-guarded).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardStorage } from "../../core/ports.ts";
import type { BoardSnapshot } from "../../core/snapshot.ts";
import { lifecycleEvent } from "../../core/events.ts";
import { testCard } from "../../core/test-helpers.ts";
import { createJsonlStorage } from "./jsonl.ts";

const TS = "2026-09-17T10:00:00.000Z";

function snapshot(id: string, ts: string, cardIds: string[]): BoardSnapshot {
  return {
    id, ts, actor: "pmo", label: `instantané ${id}`, logSeq: 1, exerciseYear: 2026,
    cards: cardIds.map((cardId) => testCard({ id: cardId })), capacity: [], configOverride: null,
  };
}

async function withReopen(work: (open: () => BoardStorage) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-snapshots-"));
  try {
    await work(() => createJsonlStorage(join(dir, "board.jsonl")));
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

test("jsonl: snapshots are saved, listed newest first, loaded whole, and survive a reopen", async () => {
  await withReopen(async (open) => {
    let store = open();
    assert.equal(await store.lastSeq(), 0);
    await store.appendEvent(lifecycleEvent("created", "S001", "a", TS));
    assert.equal(await store.lastSeq(), 1);
    await store.saveSnapshot(snapshot("s-old", "2026-09-01T00:00:00.000Z", ["S001"]));
    await store.saveSnapshot(snapshot("s-new", "2026-09-02T00:00:00.000Z", ["S001", "S002"]));
    await assert.rejects(store.saveSnapshot(snapshot("s-new", TS, [])), /existe déjà/);
    await store.close();
    store = open();
    try {
      const list = await store.listSnapshots();
      assert.deepEqual(list.map((entry) => [entry.id, entry.cardCount]), [["s-new", 2], ["s-old", 1]]);
      const loaded = await store.loadSnapshot("s-old");
      assert.equal(loaded?.cards.length, 1);
      assert.equal(await store.loadSnapshot("nope"), null);
      assert.equal(await store.lastSeq(), 1);
    } finally {
      await store.close();
    }
  });
});

test("jsonl: restoreCards replaces the base cards whole, the log stands, and the reopen agrees", async () => {
  await withReopen(async (open) => {
    let store = open();
    await store.importCards([testCard({ id: "S001", title: "avant" }), testCard({ id: "S002" })], [
      lifecycleEvent("created", "S001", "a", TS),
    ]);
    await store.restoreCards([testCard({ id: "S001", title: "après" }), testCard({ id: "S003" })]);
    const ids = (await store.listBaseCards()).map((card) => [card.id, card.title]);
    assert.deepEqual(ids, [["S001", "après"], ["S003", testCard({ id: "S003" }).title]]);
    assert.equal((await store.listEvents()).length, 1);
    await store.close();
    store = open();
    try {
      assert.deepEqual((await store.listBaseCards()).map((card) => card.id), ["S001", "S003"]);
      assert.equal((await store.listEvents()).length, 1);
    } finally {
      await store.close();
    }
  });
});
