// Conformance suite for BoardStorage drivers (ADR 008/011): every driver must
// satisfy the same observable contract — append-only ids, atomic imports,
// persistence across reopen, fold parity with the in-memory store. The
// PostgreSQL driver (`pg`) joins DRIVERS below once authorized, re-proving
// parity unchanged. (node:sqlite was retired with the Node-22 re-platform.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardStorage } from "../../core/ports.ts";
import { InMemoryEventStore, lifecycleEvent, movedEvent } from "../../core/events.ts";
import { foldEvents } from "../../core/state.ts";
import { testCard } from "../../core/test-helpers.ts";
import { createJsonlStorage } from "./jsonl.ts";

const TS = "2026-06-01T10:00:00.000Z";

interface Driver {
  name: string;
  open(dir: string): BoardStorage;
}

const DRIVERS: Driver[] = [
  { name: "jsonl", open: (dir) => createJsonlStorage(join(dir, "board.jsonl")) },
];

// Fresh temp dir per test; the store must be closed before cleanup or
// Windows keeps the database file locked.
function withTempDir(work: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "kanban-storage-"));
  try {
    work(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

function withStore(driver: Driver, work: (store: BoardStorage, dir: string) => void): void {
  withTempDir((dir) => {
    const store = driver.open(dir);
    try {
      work(store, dir);
    } finally {
      store.close();
    }
  });
}

for (const driver of DRIVERS) {
  test(`[${driver.name}] a fresh store is empty`, () => {
    withStore(driver, (store) => {
      assert.deepEqual(store.listEvents(), []);
      assert.deepEqual(store.listBaseCards(), []);
    });
  });

  test(`[${driver.name}] appendEvent assigns sequential evt-<seq> ids`, () => {
    withStore(driver, (store) => {
      const first = store.appendEvent(lifecycleEvent("created", "S001", "local", TS));
      const second = store.appendEvent(
        lifecycleEvent("blocked", "S001", "local", TS, { reason: "attente" }),
      );
      assert.equal(first.id, "evt-1");
      assert.equal(second.id, "evt-2");
      assert.deepEqual(store.listEvents().map((event) => event.id), ["evt-1", "evt-2"]);
    });
  });

  test(`[${driver.name}] events round-trip exactly, payload included`, () => {
    withStore(driver, (store) => {
      const input = movedEvent(
        "S042",
        { laneId: "laneA", columnId: "col1" },
        { laneId: "laneB", columnId: "col3" },
        "local",
        TS,
      );
      const stored = store.appendEvent(input);
      assert.deepEqual(store.listEvents(), [stored]);
      assert.deepEqual(stored.payload, { fromLane: "laneA", toLane: "laneB" });
    });
  });

  test(`[${driver.name}] appendEvent's return mirrors the persisted payload`, () => {
    withStore(driver, (store) => {
      // JSON.stringify drops undefined keys and coerces NaN/Infinity to
      // null; the returned event must reflect the stored row, not the raw
      // input payload — otherwise the caller's cache diverges from a reload.
      const input = lifecycleEvent("edited", "S001", "local", TS, {
        patch: { title: "Titre" },
        dropped: undefined,
        coerced: NaN,
      });
      const returned = store.appendEvent(input);
      assert.deepEqual(store.listEvents(), [returned]);
      assert.equal("dropped" in returned.payload, false);
      assert.equal(returned.payload["coerced"], null);
    });
  });

  test(`[${driver.name}] seq stays monotonic across close and reopen`, () => {
    withTempDir((dir) => {
      const store = driver.open(dir);
      try {
        store.appendEvent(lifecycleEvent("created", "S001", "local", TS));
        store.appendEvent(lifecycleEvent("created", "S002", "local", TS));
      } finally {
        store.close();
      }
      const reopened = driver.open(dir);
      try {
        const third = reopened.appendEvent(lifecycleEvent("created", "S003", "local", TS));
        assert.equal(third.id, "evt-3");
        assert.equal(reopened.listEvents().length, 3);
      } finally {
        reopened.close();
      }
    });
  });

  test(`[${driver.name}] importCards round-trips full cards and their events`, () => {
    withStore(driver, (store) => {
      const cardA = testCard({
        id: "S100",
        tags: ["erp", "priorite"],
        dependencies: ["S101"],
        budget: 1500.5,
        consumed: 200,
        blocked: true,
        blockedReason: "attente budget",
        blockedSince: TS,
      });
      const cardB = testCard({ id: "S101", typeId: null, codename: null, owner: "" });
      store.importCards(
        [cardA, cardB],
        [
          lifecycleEvent("imported", "S100", "sync", TS),
          lifecycleEvent("imported", "S101", "sync", TS),
        ],
      );
      assert.deepEqual(store.listBaseCards(), [cardA, cardB]);
      assert.deepEqual(store.listEvents().map((event) => event.id), ["evt-1", "evt-2"]);
    });
  });

  test(`[${driver.name}] importCards upserts base cards by id`, () => {
    withStore(driver, (store) => {
      store.importCards([testCard({ id: "S100", title: "Avant" })], []);
      store.importCards([testCard({ id: "S100", title: "Après" })], []);
      const cards = store.listBaseCards();
      assert.equal(cards.length, 1);
      assert.equal(cards[0]?.title, "Après");
    });
  });

  test(`[${driver.name}] a failed import leaves nothing behind`, () => {
    withStore(driver, (store) => {
      const circular: Record<string, unknown> = {};
      circular["self"] = circular; // not JSON-serializable: the append throws
      assert.throws(() =>
        store.importCards(
          [testCard({ id: "S100" })],
          [lifecycleEvent("imported", "S100", "sync", TS, circular)],
        ),
      );
      assert.deepEqual(store.listBaseCards(), []);
      assert.deepEqual(store.listEvents(), []);
    });
  });

  test(`[${driver.name}] folds identically to the in-memory store`, () => {
    withStore(driver, (store) => {
      const base = [testCard({ id: "S001" }), testCard({ id: "S002", columnId: "col2" })];
      const inputs = [
        movedEvent(
          "S001",
          { laneId: "laneA", columnId: "col1" },
          { laneId: "laneB", columnId: "col3" },
          "local",
          "2026-06-02T08:00:00.000Z",
        ),
        lifecycleEvent("blocked", "S002", "local", "2026-06-02T09:00:00.000Z", {
          reason: "attente",
        }),
        lifecycleEvent("edited", "S001", "local", "2026-06-03T10:00:00.000Z", {
          patch: { title: "Titre revu" },
        }),
      ];
      const memory = new InMemoryEventStore();
      for (const input of inputs) {
        memory.append(input);
        store.appendEvent(input);
      }
      assert.deepEqual(foldEvents(base, store.listEvents()), foldEvents(base, memory.list()));
    });
  });

  test(`[${driver.name}] close is idempotent, methods then throw`, () => {
    withTempDir((dir) => {
      const store = driver.open(dir);
      store.close();
      store.close();
      assert.throws(() => store.appendEvent(lifecycleEvent("created", "S001", "local", TS)));
      assert.throws(() => store.listEvents());
    });
  });
}
