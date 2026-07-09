// Multi-step handler scenarios over one storage: moved intents validated
// against the POST-move FOLDED position (not the import snapshot), the
// laneId round-trip through payload.laneId, lane-only moves, and id
// allocation across deletions (a deleted card's id is never reused).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardStorage } from "../core/ports.ts";
import type { CardEventInput } from "../core/events.ts";
import type { Card, CardEvent } from "../core/types.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { BadRequest, postEvent } from "./api.ts";
import { postCard } from "./cards.ts";

const config = testConfig();

// In-memory BoardStorage stub: base cards + append-only events, ids evt-<n>.
function stubStorage(cards: Card[] = [testCard({ id: "S001" })]): BoardStorage {
  const baseCards = cards.map((card) => ({ ...card }));
  const events: CardEvent[] = [];
  let seq = 0;
  const append = (input: CardEventInput): CardEvent => {
    seq += 1;
    const event: CardEvent = { ...input, id: `evt-${seq}` };
    events.push(event);
    return event;
  };
  return {
    async importCards() {
      throw new Error("importCards non utilisé dans ces tests");
    },
    async insertCard(card: Card, created: CardEventInput): Promise<CardEvent> {
      if (baseCards.some((c) => c.id === card.id)) throw new Error(`id dupliqué : ${card.id}`);
      baseCards.push({ ...card });
      return append(created);
    },
    async appendEvent(input: CardEventInput): Promise<CardEvent> {
      return append(input);
    },
    async listEvents() {
      return events.slice();
    },
    async listBaseCards() {
      return baseCards.map((card) => ({ ...card }));
    },
    async close() {},
  };
}

const CARD_BODY = {
  title: "Nouveau sujet",
  domain: "beta",
  laneId: "laneB",
  typeId: "t2",
  nature: "complex",
  criticality: "top",
  owner: "Mme Chef",
};

test("a second move is validated against the folded position, not the snapshot", async () => {
  const storage = stubStorage(); // S001 base cell: laneA/col1
  const first = await postEvent(storage, config, {
    type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "col2",
  });
  assert.equal(first.status, 201);
  const firstEvent = first.body as CardEvent;
  assert.equal(firstEvent.fromColumn, "col1");
  assert.equal(firstEvent.payload["laneId"], "laneB");
  // The identical intent must now be a same-cell move — proving the
  // validation reads the folded position, never the import snapshot.
  await assert.rejects(
    () => postEvent(storage, config, {
      type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "col2",
    }),
    /Carte déjà dans cette cellule/,
  );
  assert.equal((await storage.listEvents()).length, 1); // the repeat persisted nothing
});

test("a lane-only move (same column, other canal) is legal and round-trips laneId", async () => {
  const storage = stubStorage();
  await postEvent(storage, config, {
    type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "col2",
  });
  const laneOnly = await postEvent(storage, config, {
    type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "col2",
  });
  assert.equal(laneOnly.status, 201);
  const event = laneOnly.body as CardEvent;
  assert.equal(event.fromColumn, "col2"); // origin from the folded position
  assert.equal(event.toColumn, "col2");
  assert.equal(event.payload["laneId"], "laneA");
  // Back in the original cell of the snapshot? No: laneA/col2 ≠ laneA/col1,
  // and a repeat of the lane-only move is a same-cell rejection.
  await assert.rejects(
    () => postEvent(storage, config, {
      type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "col2",
    }),
    BadRequest,
  );
});

test("a deleted card's id is never reallocated to a new card", async () => {
  const storage = stubStorage([testCard({ id: "S001" })]);
  await postEvent(storage, config, { type: "deleted", cardId: "S001" });
  const first = (await postCard(storage, config, CARD_BODY)).body as { card: Card };
  assert.equal(first.card.id, "S002"); // never "S001" — snapshots keep the id
  // Consecutive creation: the freshly inserted card feeds the next id.
  const second = (await postCard(storage, config, CARD_BODY)).body as { card: Card };
  assert.equal(second.card.id, "S003");
});
