// Conformance of the capacity snapshot (ADR 024) for the JSONL driver: a
// fact table beside the log — null until imported, replaced whole, persisted
// across reopen, never aliased. The Postgres driver proves the same in
// storage/postgres.test.ts (env-guarded).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardStorage } from "../../core/ports.ts";
import { createJsonlStorage } from "./jsonl.ts";

interface Driver {
  name: string;
  open(dir: string): BoardStorage;
}

const DRIVERS: Driver[] = [{ name: "jsonl", open: (dir) => createJsonlStorage(join(dir, "board.jsonl")) }];

async function withTempDir(work: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-capacity-"));
  try {
    await work(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ADR 024: the capacity snapshot is a fact table replaced whole — the last
// import wins, it survives a reopen, and read-back never aliases the input.
for (const driver of DRIVERS) {
  test(`[${driver.name}] capacity snapshot: null until imported, replaced whole, persisted across reopen`, async () => {
    await withTempDir(async (dir) => {
      const first = driver.open(dir);
      try {
        assert.equal(await first.getCapacity(2026), null);
        const snapshot = {
          exerciseYear: 2026,
          persons: [{ id: "p-1", name: "Un", domain: "alpha", subDomain: null, profileId: "pA", metier: "A", external: false, capacityJh: 200, plannedJh: 260, doneJh: 90, source: "profils" as const }],
          assignments: [{ personId: "p-1", cardId: "S001", jh: 40, done: 10 }],
        };
        await first.importCapacity(snapshot);
        snapshot.assignments[0]!.jh = 999; // the caller's object is not the store's
        const read = await first.getCapacity(2026);
        assert.equal(read?.assignments[0]?.jh, 40);
        await first.importCapacity({ exerciseYear: 2027, persons: [], assignments: [] });
        assert.deepEqual(await first.getCapacity(2027), { exerciseYear: 2027, persons: [], assignments: [] });
        assert.equal((await first.getCapacity(2026))?.assignments[0]?.jh, 40, "one snapshot per exercise year (ADR 035)");
      } finally {
        await first.close();
      }
      const again = driver.open(dir);
      try {
        assert.deepEqual(await again.getCapacity(2027), { exerciseYear: 2027, persons: [], assignments: [] });
      } finally {
        await again.close();
      }
    });
  });

  // ADR 058: the restore of a snapshot taken while a year had no capacity removes it.
  test(`[${driver.name}] clearCapacity: the year reads null, the others stand, it survives a reopen, twice is a no-op`, async () => {
    await withTempDir(async (dir) => {
      const first = driver.open(dir);
      try {
        await first.importCapacity({ exerciseYear: 2026, persons: [], assignments: [] });
        await first.importCapacity({ exerciseYear: 2027, persons: [], assignments: [] });
        await first.clearCapacity(2027);
        await first.clearCapacity(2027);
        await first.clearCapacity(2030);
        assert.equal(await first.getCapacity(2027), null);
        assert.deepEqual(await first.getCapacity(2026), { exerciseYear: 2026, persons: [], assignments: [] });
      } finally {
        await first.close();
      }
      const again = driver.open(dir);
      try {
        assert.equal(await again.getCapacity(2027), null, "the clearing is replayed on open");
        assert.notEqual(await again.getCapacity(2026), null);
        await again.importCapacity({ exerciseYear: 2027, persons: [], assignments: [] });
        assert.notEqual(await again.getCapacity(2027), null, "a later import of the year stands again");
      } finally {
        await again.close();
      }
    });
  });
}
