// The year switch route: refused unless it is the next year; writes the
// pins, the archivings and the activations in one batch, then records the
// new current exercise — which survives a store re-open.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { lifecycleEvent } from "../core/events.ts";
import { createConfigStore } from "./config-store.ts";
import { BadRequest } from "./errors.ts";
import { postExerciseSwitch } from "./exercise.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";

test("postExerciseSwitch: next year only; pins, archives, activates; the new year is served and persisted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kanban-switch-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  try {
    const config = testConfig();
    const store = createConfigStore(dir, config);
    const current = config.exercise.year;
    const cards = [testCard({ id: "legacy" }), testCard({ id: "old", exercise: current }), testCard({ id: "next", exercise: current + 1 })];
    await storage.importCards(cards, cards.map((c, i) => ({
      ...lifecycleEvent("imported", c.id, "import-csv", `2026-0${i + 1}-01T00:00:00.000Z`, { laneId: c.laneId }), toColumn: c.columnId,
    })));
    await assert.rejects(() => postExerciseSwitch(storage, store, { year: current + 2 }), BadRequest);
    await assert.rejects(() => postExerciseSwitch(storage, store, { year: current }), /l’exercice suivant est/);
    const result = await postExerciseSwitch(storage, store, { year: current + 1 });
    const body = result.body as { year: number; pinned: number; archived: number; activated: number; config: { exercise: { year: number } } };
    assert.deepEqual([result.status, body.year, body.pinned, body.archived, body.activated], [200, current + 1, 1, 2, 1]);
    assert.equal(body.config.exercise.year, current + 1);
    assert.equal(store.getRuntime().exercise.year, current + 1);
    const types = (await storage.listEvents()).filter((e) => e.type !== "imported").map((e) => [e.type, e.cardId]);
    assert.deepEqual(types, [["edited", "legacy"], ["archived", "legacy"], ["archived", "old"], ["activated", "next"]]);
    assert.equal(createConfigStore(dir, config).getExerciseYear(), current + 1, "exercise.json survives a restart");
  } finally {
    await storage.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
