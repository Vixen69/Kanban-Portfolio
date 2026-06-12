import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { cardHistory } from "./history.ts";
import { testConfig } from "./test-helpers.ts";

const CONFIG = testConfig();

function event(partial: Partial<CardEvent> & Pick<CardEvent, "id" | "ts" | "type">): CardEvent {
  return { actor: "test", cardId: "S001", fromColumn: null, toColumn: null, payload: {}, ...partial };
}

const EVENTS: CardEvent[] = [
  event({ id: "evt-1", ts: "2026-01-01T00:00:00.000Z", type: "created", toColumn: "col1" }),
  event({ id: "evt-2", ts: "2026-02-01T00:00:00.000Z", type: "moved", fromColumn: "col1", toColumn: "col2" }),
  event({ id: "evt-3", ts: "2026-03-01T00:00:00.000Z", type: "blocked", payload: { reason: "attente" } }),
  event({ id: "evt-4", ts: "2026-03-05T00:00:00.000Z", type: "unblocked" }),
  event({ id: "evt-5", ts: "2026-03-06T00:00:00.000Z", type: "edited", payload: { title: "x" } }),
  event({ id: "evt-6", ts: "2026-04-01T00:00:00.000Z", type: "moved", cardId: "GHOST", toColumn: "col3" }),
];

test("history narrates created, moved, blocked, unblocked — newest first", () => {
  const history = cardHistory(EVENTS, "S001", CONFIG);
  assert.deepEqual(history.map((entry) => entry.kind), ["unblocked", "blocked", "moved", "created"]);
  assert.equal(history[3]?.toName, "Colonne 1");
  assert.equal(history[2]?.fromName, "Colonne 1");
  assert.equal(history[2]?.toName, "Colonne 2");
  assert.equal(history[1]?.reason, "attente");
});

test("edited events and other cards' events are excluded", () => {
  const history = cardHistory(EVENTS, "S001", CONFIG);
  assert.equal(history.length, 4);
});

test("unknown column ids fall back to the raw id", () => {
  const history = cardHistory(
    [event({ id: "evt-1", ts: "2026-01-01T00:00:00.000Z", type: "moved", fromColumn: "ghost-col", toColumn: "col1" })],
    "S001",
    CONFIG,
  );
  assert.equal(history[0]?.fromName, "ghost-col");
  assert.equal(history[0]?.toName, "Colonne 1");
});
