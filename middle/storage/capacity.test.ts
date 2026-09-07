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
        assert.equal(await first.getCapacity(), null);
        const snapshot = {
          exerciseYear: 2026,
          persons: [{ id: "p-1", name: "Un", domain: "alpha", subDomain: null, profileId: "pA", metier: "A", external: false, capacityJh: 200, source: "profils" as const }],
          assignments: [{ personId: "p-1", cardId: "S001", jh: 40, done: 10 }],
        };
        await first.importCapacity(snapshot);
        snapshot.assignments[0]!.jh = 999; // the caller's object is not the store's
        const read = await first.getCapacity();
        assert.equal(read?.assignments[0]?.jh, 40);
        await first.importCapacity({ exerciseYear: 2027, persons: [], assignments: [] });
        assert.deepEqual(await first.getCapacity(), { exerciseYear: 2027, persons: [], assignments: [] });
      } finally {
        await first.close();
      }
      const again = driver.open(dir);
      try {
        assert.deepEqual(await again.getCapacity(), { exerciseYear: 2027, persons: [], assignments: [] });
      } finally {
        await again.close();
      }
    });
  });
}
