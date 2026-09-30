// ADR 058/059 through the middle, over the synthetic fixtures and a JSONL
// store: two loads at once write each card once; a card deleted on the
// board is skipped and named; a hand-made card carrying an export code is
// adopted, and the capacity snapshot follows it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardStorage } from "../core/ports.ts";
import type { BoardConfig } from "../core/types.ts";
import type { InputFile } from "../adapters/csv-import/index.ts";
import { validateBoardConfig } from "../core/config.ts";
import { lifecycleEvent } from "../core/events.ts";
import { foldEvents } from "../core/state.ts";
import { testCard } from "../core/test-helpers.ts";
import { loadImport } from "./import.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";

const CONFIG: BoardConfig = validateBoardConfig(
  JSON.parse(readFileSync(new URL("../config/board.json", import.meta.url), "utf8")),
);
const NOW = new Date("2026-09-08T09:00:00.000Z");
const FIXTURES = new URL("../fixtures/import/", import.meta.url);

function files(): InputFile[] {
  return readdirSync(FIXTURES).filter((name) => name.endsWith(".csv")).map((name) => ({
    name, bytes: new Uint8Array(readFileSync(new URL(name, FIXTURES))),
  }));
}

async function withStorage(work: (storage: BoardStorage) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-import-idem-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  try {
    await work(storage);
  } finally {
    await storage.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

// The store with the round-trip latency of a database on every read.
function slow(storage: BoardStorage): BoardStorage {
  const later = <T>(value: Promise<T>): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), 30));
  return { ...storage, listEvents: (f) => later(storage.listEvents(f)), listBaseCards: () => later(storage.listBaseCards()) };
}

test("two loads at once: the second reads what the first wrote — each card imported once", () =>
  withStorage(async (storage) => {
    const store = slow(storage);
    const [a, b] = await Promise.all([loadImport(store, CONFIG, files(), NOW), loadImport(store, CONFIG, files(), NOW)]);
    assert.ok(a.load.created > 0);
    assert.equal(b.load.created, 0);
    const imported = (await storage.listEvents()).filter((e) => e.type === "imported");
    assert.equal(imported.length, a.load.created);
  }));

test("a card deleted on the board is not re-created by a load: skipped, counted, named, nothing written", () =>
  withStorage(async (storage) => {
    await loadImport(storage, CONFIG, files(), NOW);
    await storage.appendEvent(lifecycleEvent("deleted", "PE10002@2026", "pmo", NOW.toISOString()));
    const before = (await storage.listEvents()).length;
    const again = await loadImport(storage, CONFIG, files(), NOW);
    assert.deepEqual([again.load.created, again.load.deletedSkipped], [0, 1]);
    assert.deepEqual(again.changes.deletedSkipped.map((c) => c.cardId), ["PE10002@2026"]);
    assert.equal((await storage.listEvents()).length, before, "no phantom « imported » event");
  }));

test("a hand-made card carrying an export code is adopted: one card, the capacity follows its id", () =>
  withStorage(async (storage) => {
    const hand = testCard({
      id: "S001", title: "Atelier (à la main)", codename: "PE10001", source: "manual", domain: "infra",
      laneId: "projets", columnId: "demandes", typeId: "etude", createdAt: "2026-09-01T08:00:00.000Z",
    });
    await storage.insertCard(hand, { ...lifecycleEvent("created", "S001", "pmo", hand.createdAt), toColumn: "demandes" });
    const result = await loadImport(storage, CONFIG, files(), NOW);
    assert.equal(result.load.adopted, 1);
    assert.deepEqual(result.changes.adopted.map((a) => [a.cardId, a.code, a.manualTitle]), [["S001", "PE10001", "Atelier (à la main)"]]);
    const board = foldEvents(await storage.listBaseCards(), await storage.listEvents());
    assert.equal(board.some((c) => c.id === "PE10001@2026"), false, "no duplicate");
    assert.deepEqual([board.find((c) => c.id === "S001")?.source, board.find((c) => c.id === "S001")?.sciformaId], ["csv", "PE10001"]);
    const capacity = await storage.getCapacity(2026);
    assert.ok(capacity?.assignments.some((a) => a.cardId === "S001"), "the capacity snapshot names the adopted card");
    assert.equal(capacity?.assignments.some((a) => a.cardId === "PE10001@2026"), false);
  }));
