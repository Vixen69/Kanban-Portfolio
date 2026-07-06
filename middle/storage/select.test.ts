import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lifecycleEvent } from "../../core/events.ts";
import { testCard } from "../../core/test-helpers.ts";
import { createStorage, STORAGE_DRIVERS } from "./select.ts";

const TS = "2026-06-01T10:00:00.000Z";

test("an unknown driver fails loudly, naming the available drivers", () => {
  assert.throws(
    () => createStorage("better-sqlite3", "x"),
    /Pilote de stockage inconnu.*better-sqlite3.*jsonl/s,
  );
});

test("postgres is reserved and refuses until pg is authorized", () => {
  assert.throws(() => createStorage("postgres", "x"), /pas encore disponible.*pg/s);
});

test("jsonl is selectable and returns a working storage", () => {
  assert.ok((STORAGE_DRIVERS as readonly string[]).includes("jsonl"));
  const dir = mkdtempSync(join(tmpdir(), "kanban-select-"));
  try {
    const store = createStorage("jsonl", join(dir, "board.jsonl"));
    try {
      const stored = store.appendEvent(lifecycleEvent("created", "S001", "local", TS));
      assert.equal(stored.id, "evt-1");
      assert.equal(store.listEvents().length, 1);
      store.insertCard(testCard({ id: "S002" }));
      assert.equal(store.listBaseCards().length, 1);
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
