// The JSONL driver's listEvents filter (ADR 040): strictly after a sequence
// (the incremental refresh), of some cards (the per-action validation
// fold), both, or nothing. The Postgres driver proves the same in
// postgres.test.ts (env-guarded).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lifecycleEvent } from "../../core/events.ts";
import { testCard } from "../../core/test-helpers.ts";
import { createJsonlStorage } from "./jsonl.ts";

test("[jsonl] listEvents honours the filter: after a sequence, of some cards, both", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kanban-events-filter-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  try {
    await storage.importCards([testCard({ id: "A" }), testCard({ id: "B" })], [
      lifecycleEvent("created", "A", "t", "2026-01-01T00:00:00.000Z"),
      lifecycleEvent("created", "B", "t", "2026-01-02T00:00:00.000Z"),
      lifecycleEvent("commented", "A", "t", "2026-01-03T00:00:00.000Z", { text: "x" }),
    ]);
    assert.deepEqual((await storage.listEvents()).map((e) => e.id), ["evt-1", "evt-2", "evt-3"]);
    assert.deepEqual((await storage.listEvents({ afterSeq: 1 })).map((e) => e.id), ["evt-2", "evt-3"]);
    assert.deepEqual((await storage.listEvents({ afterSeq: 3 })), [], "nothing after the last one");
    assert.deepEqual((await storage.listEvents({ cardIds: ["A"] })).map((e) => e.id), ["evt-1", "evt-3"]);
    assert.deepEqual((await storage.listEvents({ cardIds: ["A"], afterSeq: 1 })).map((e) => e.id), ["evt-3"]);
    assert.deepEqual(await storage.listEvents({ cardIds: [] }), []);
  } finally {
    await storage.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
