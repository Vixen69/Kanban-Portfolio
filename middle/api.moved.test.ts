// "moved" intent validation, split from api.test.ts to respect the
// 300-line file cap: server-derived origin, and the manual-ordering rules
// of ADR 019 (same-cell moves are reorders, beforeId must sit in the
// target cell).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "../core/types.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { postEvent } from "./api.ts";
import { stubStorage } from "./test-helpers.ts";

const config = testConfig();

test("a valid move is stamped by the server with the current cell as origin", async () => {
  const storage = stubStorage();
  const result = await postEvent(storage, config, {
    type: "moved",
    cardId: "S001",
    toLaneId: "laneB",
    toColumnId: "col2",
  });
  assert.equal(result.status, 201);
  const event = result.body as CardEvent;
  assert.equal(event.id, "evt-1");
  assert.equal(event.fromColumn, "col1"); // server-derived from folded state
  assert.equal(event.toColumn, "col2");
});

test("a same-cell move is only accepted as a reorder with a valid beforeId (ADR 019)", async () => {
  // stub board: S001 and S002 both in laneA/col1.
  const storage = stubStorage([testCard({ id: "S001" }), testCard({ id: "S002" })]);
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "col1" }),
    /Carte déjà dans cette cellule/,
  );
  const result = await postEvent(storage, config, {
    type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "col1", beforeId: "S002",
  });
  assert.equal(result.status, 201);
  const event = result.body as CardEvent;
  assert.equal(event.payload["beforeId"], "S002");
  assert.equal(event.fromColumn, "col1");
  assert.equal(event.toColumn, "col1");
});

test("an archived card cannot be moved, nor targeted by a beforeId (ADR 017)", async () => {
  const storage = stubStorage([testCard({ id: "S001" }), testCard({ id: "S002" })]);
  await postEvent(storage, config, { type: "archived", cardId: "S001" });
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "col2" }),
    /Carte archivée : désarchiver avant de déplacer/,
  );
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S002", toLaneId: "laneA", toColumnId: "col1", beforeId: "S001" }),
    /Carte cible de l’insertion hors de la cellule visée/,
  );
});

test("concurrent intents are serialized: the second validates against the first's result", async () => {
  // Slow reads widen the race window; without serialization both intents
  // would fold the same snapshot and the second would record fromColumn col1.
  const base = stubStorage([testCard({ id: "S001" }), testCard({ id: "S002" })]);
  const storage = {
    ...base,
    async listEvents() {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return base.listEvents();
    },
  };
  const [first, second] = await Promise.all([
    postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "col2" }),
    postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "col1", beforeId: "S002" }),
  ]);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  // The second intent saw the first's result: its origin is col2, not col1.
  assert.equal((second.body as CardEvent).fromColumn, "col2");
});

test("beforeId must reference another card sitting in the target cell", async () => {
  const storage = stubStorage([
    testCard({ id: "S001" }),
    testCard({ id: "S002", columnId: "col2" }),
  ]);
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "col1", beforeId: "S001" }),
    /Carte cible de l’insertion invalide/,
  );
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "col1", beforeId: "S002" }),
    /Carte cible de l’insertion hors de la cellule visée/,
  );
  await assert.rejects(
    () => postEvent(storage, config, { type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "col1", beforeId: "GHOST" }),
    /Carte cible de l’insertion hors de la cellule visée/,
  );
});
