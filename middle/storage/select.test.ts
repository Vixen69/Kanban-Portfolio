import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lifecycleEvent } from "../../core/events.ts";
import { testCard } from "../../core/test-helpers.ts";
import { createStorage, STORAGE_DRIVERS } from "./select.ts";

const TS = "2026-06-01T10:00:00.000Z";

test("an unknown driver fails loudly, naming the available drivers", async () => {
  await assert.rejects(
    () => createStorage("better-sqlite3", "x"),
    /Pilote de stockage inconnu.*better-sqlite3.*jsonl.*postgres/s,
  );
});

test("postgres is a selectable driver id", () => {
  // Behavior against a live database is covered by storage/postgres.test.ts
  // (env-guarded); here we only assert the driver is offered.
  assert.ok((STORAGE_DRIVERS as readonly string[]).includes("postgres"));
});

test("jsonl is selectable and returns a working storage", async () => {
  assert.ok((STORAGE_DRIVERS as readonly string[]).includes("jsonl"));
  const dir = mkdtempSync(join(tmpdir(), "kanban-select-"));
  try {
    const store = await createStorage("jsonl", join(dir, "board.jsonl"));
    try {
      const stored = await store.appendEvent(lifecycleEvent("created", "S001", "local", TS));
      assert.equal(stored.id, "evt-1");
      assert.equal((await store.listEvents()).length, 1);
      await store.insertCard(testCard({ id: "S002" }), lifecycleEvent("created", "S002", "local", TS));
      assert.equal((await store.listBaseCards()).length, 1);
      assert.equal((await store.listEvents()).length, 2);
    } finally {
      await store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
