// API handler logic, exercised directly against a JSONL store in a temp dir —
// no HTTP. Focus: server authority over id/ts/actor and topology validation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardStorage } from "../core/ports.ts";
import { foldEvents } from "../core/state.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";
import { BadRequest, getBoard, getConfig, postEvent, SERVER_ACTOR } from "./api.ts";

const config = testConfig();

// A fresh JSONL store seeded with one card (id S001, laneA / col1), torn down
// (store closed, temp dir removed) regardless of outcome.
function withSeeded(work: (storage: BoardStorage) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "kanban-api-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  storage.importCards([testCard({ id: "S001" })], []);
  try {
    work(storage);
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

test("getConfig returns the board topology", () => {
  assert.deepEqual(getConfig(config).body, config);
});

test("getBoard returns base cards and the event log", () => {
  withSeeded((storage) => {
    const result = getBoard(storage);
    assert.equal(result.status, 200);
    const body = result.body as { cards: unknown[]; events: unknown[] };
    assert.equal(body.cards.length, 1);
    assert.equal(body.events.length, 0);
  });
});

test("a valid move is stamped by the server and persisted", () => {
  withSeeded((storage) => {
    const result = postEvent(storage, config, {
      type: "moved",
      cardId: "S001",
      toLaneId: "laneB",
      toColumnId: "col2",
    });
    assert.equal(result.status, 201);
    const event = result.body as { id: string; actor: string; fromColumn: string; toColumn: string };
    assert.equal(event.id, "evt-1");
    assert.equal(event.actor, SERVER_ACTOR);
    assert.equal(event.fromColumn, "col1"); // server-derived from current state
    assert.equal(event.toColumn, "col2");
  });
});

test("the server ignores any client-supplied actor or timestamp", () => {
  withSeeded((storage) => {
    const result = postEvent(storage, config, {
      type: "unblocked",
      cardId: "S001",
      actor: "pirate",
      ts: "1999-01-01T00:00:00.000Z",
    });
    const event = result.body as { actor: string; ts: string };
    assert.equal(event.actor, SERVER_ACTOR);
    assert.notEqual(event.ts, "1999-01-01T00:00:00.000Z");
  });
});

test("an edit applies through the fold whitelist", () => {
  withSeeded((storage) => {
    postEvent(storage, config, { type: "edited", cardId: "S001", patch: { title: "Titre revu" } });
    const states = foldEvents(storage.listBaseCards(), storage.listEvents());
    assert.equal(states.find((card) => card.id === "S001")?.title, "Titre revu");
  });
});

test("invalid intents are rejected with BadRequest", () => {
  withSeeded((storage) => {
    const cases: unknown[] = [
      { type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "ghost" }, // unknown column
      { type: "moved", cardId: "S001", toLaneId: "ghost", toColumnId: "col2" }, // unknown lane
      { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "col1" }, // already in this cell
      { type: "moved", cardId: "ZZZ", toLaneId: "laneB", toColumnId: "col2" }, // unknown card
      { type: "blocked", cardId: "S001" }, // missing reason
      { type: "created", cardId: "S001" }, // not a postable type
      { type: "edited", cardId: "S001", patch: "nope" }, // patch not an object
      { type: "edited", cardId: "S001", patch: { hasOwnProperty: 1 } }, // prototype-named key
      { type: "edited", cardId: "S001", patch: { id: "forged" } }, // non-editable field
      "not an object",
    ];
    for (const intent of cases) {
      assert.throws(() => postEvent(storage, config, intent), BadRequest);
    }
    assert.equal(storage.listEvents().length, 0); // nothing was persisted
  });
});
