// Restores that put back exactly what the take froze (ADR 058): the
// capacity of a year the snapshot held none for is removed, and an applied
// config comes back only onto the versioned model it was applied on —
// otherwise it is set aside into the history (ADR 038).

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardConfig } from "../core/types.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { createConfigStore } from "./config-store.ts";
import { restoreSnapshot, takeSnapshot } from "./snapshots.ts";
import { stubConfigStore, stubStorage } from "./test-helpers.ts";

const NOW = new Date("2026-09-30T10:00:00.000Z");

function withDataDir(work: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-restore-"));
  return work(dir).finally(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
}

// Model B: the versioned model after a developer fix.
function modelB(): BoardConfig {
  const next = testConfig();
  next.andonThresholdDays = 11;
  return next;
}

test("a restore removes the capacity of a year the snapshot held none for — the others come back", async () => {
  const defaults = testConfig();
  const year = defaults.exercise.year;
  const storage = stubStorage([testCard({ id: "S001" })]);
  const configStore = stubConfigStore(defaults);
  const before = await takeSnapshot({ storage, configStore }, "avant chargement", "import-csv", NOW);
  await storage.importCapacity({ exerciseYear: year, persons: [], assignments: [{ personId: "p-1", cardId: "S001", jh: 4, done: 1 }] });
  const result = await restoreSnapshot({ storage, configStore }, before.id, "pmo", NOW);
  assert.equal(await storage.getCapacity(year), null, "the undone import's capacity is gone");
  assert.deepEqual(result.capacityCleared, [year]);
  // A snapshot that held the year's capacity puts it back, nothing cleared for it.
  await storage.importCapacity({ exerciseYear: year, persons: [], assignments: [{ personId: "p-1", cardId: "S001", jh: 4, done: 1 }] });
  const held = await takeSnapshot({ storage, configStore }, "avec capacité", "pmo", NOW);
  await storage.importCapacity({ exerciseYear: year, persons: [], assignments: [] });
  const again = await restoreSnapshot({ storage, configStore }, held.id, "pmo", NOW);
  assert.deepEqual(again.capacityCleared, []);
  assert.equal((await storage.getCapacity(year))?.assignments.length, 1);
});

test("a config applied on another versioned model is set aside at the restore, never re-adopted (ADR 038)", () =>
  withDataDir(async (dir) => {
    const storage = stubStorage();
    const onA = createConfigStore(dir, testConfig());
    const applied = { ...testConfig(), andonThresholdDays: 9 };
    onA.setRuntime(applied, "admin");
    const taken = await takeSnapshot({ storage, configStore: onA }, "avant chargement", "import-csv", NOW);
    // Restart on model B: the applied config is set aside at startup (ADR 038).
    const onB = createConfigStore(dir, modelB());
    assert.equal(onB.getOverride(), null);
    const result = await restoreSnapshot({ storage, configStore: onB }, taken.id, "pmo", NOW);
    assert.equal(result.configSetAside, true);
    assert.equal(onB.getOverride(), null, "the versioned model runs");
    assert.equal(result.config.andonThresholdDays, 11);
    assert.equal(existsSync(join(dir, "config.json")), false);
    const history = readFileSync(join(dir, "config-history.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { note?: string; config: BoardConfig | null });
    const last = history.at(-1);
    assert.match(last?.note ?? "", /écartée à la restauration/);
    assert.equal(last?.config?.andonThresholdDays, 9, "the history keeps the config set aside");
    assert.equal(createConfigStore(dir, modelB()).getOverride(), null, "a restart on B stays on B");
  }));

test("a config applied on the running model comes back; a snapshot from before ADR 058 only when it is the one running", () =>
  withDataDir(async (dir) => {
    const storage = stubStorage();
    const store = createConfigStore(dir, testConfig());
    const applied = { ...testConfig(), andonThresholdDays: 9 };
    store.setRuntime(applied, "admin");
    const taken = await takeSnapshot({ storage, configStore: store }, "t0", "pmo", NOW);
    store.restoreOverride(null, "admin");
    const result = await restoreSnapshot({ storage, configStore: store }, taken.id, "pmo", NOW);
    assert.equal(result.configSetAside, false);
    assert.deepEqual(store.getOverride(), applied);
    assert.deepEqual(createConfigStore(dir, testConfig()).getOverride(), applied, "stamped on the running model: kept at restart");
    // Legacy snapshot (no stamp): its override is trusted only when it is the running one.
    const legacy = await storage.loadSnapshot(taken.id);
    const { configDefaultsHash: _stamp, ...unstamped } = legacy!;
    await storage.saveSnapshot({ ...unstamped, id: "snap-legacy" });
    assert.equal((await restoreSnapshot({ storage, configStore: store }, "snap-legacy", "pmo", NOW)).configSetAside, false);
    store.setRuntime({ ...testConfig(), andonThresholdDays: 7 }, "admin");
    assert.equal((await restoreSnapshot({ storage, configStore: store }, "snap-legacy", "pmo", NOW)).configSetAside, true);
    assert.equal(store.getOverride(), null);
  }));
