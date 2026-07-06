import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { cardHistory } from "./history.ts";
import { testConfig } from "./test-helpers.ts";

const CONFIG = testConfig();

function event(partial: Partial<CardEvent> & Pick<CardEvent, "id" | "ts" | "type">): CardEvent {
  return { actor: "sciforma-sync", cardId: "S001", fromColumn: null, toColumn: null, payload: {}, ...partial };
}

const EVENTS: CardEvent[] = [
  event({ id: "evt-1", ts: "2026-01-01T00:00:00.000Z", type: "imported", toColumn: "col1", payload: { laneId: "laneA" } }),
  event({ id: "evt-2", ts: "2026-02-01T00:00:00.000Z", type: "moved", fromColumn: "col1", toColumn: "col2", actor: "anonymous" }),
  event({ id: "evt-3", ts: "2026-03-01T00:00:00.000Z", type: "blocked", payload: { reason: "attente" } }),
  event({ id: "evt-4", ts: "2026-03-05T00:00:00.000Z", type: "unblocked" }),
  event({ id: "evt-5", ts: "2026-03-06T00:00:00.000Z", type: "edited", payload: { patch: { title: "x" } } }),
  event({ id: "evt-6", ts: "2026-03-07T00:00:00.000Z", type: "commented", payload: { text: "ok" } }),
  event({ id: "evt-7", ts: "2026-03-08T00:00:00.000Z", type: "deleted" }),
  event({ id: "evt-8", ts: "2026-04-01T00:00:00.000Z", type: "moved", cardId: "GHOST", toColumn: "col3" }),
];

test("history keeps only this card's movements, most recent first", () => {
  assert.deepEqual(cardHistory(EVENTS, "S001", CONFIG), [
    { fromName: "Colonne 1", toName: "Colonne 2", ts: "2026-02-01T00:00:00.000Z", actor: "anonymous" },
    { fromName: null, toName: "Colonne 1", ts: "2026-01-01T00:00:00.000Z", actor: "sciforma-sync" },
  ]);
});

test("created behaves like imported: fromName null, destination named", () => {
  const history = cardHistory(
    [event({ id: "evt-1", ts: "2026-05-01T00:00:00.000Z", type: "created", toColumn: "col2", actor: "anonymous" })],
    "S001",
    CONFIG,
  );
  assert.deepEqual(history, [
    { fromName: null, toName: "Colonne 2", ts: "2026-05-01T00:00:00.000Z", actor: "anonymous" },
  ]);
});

test("unknown column ids fall back to the raw id, missing destination to Entrée", () => {
  const history = cardHistory(
    [
      event({ id: "evt-1", ts: "2026-01-01T00:00:00.000Z", type: "created" }),
      event({ id: "evt-2", ts: "2026-01-02T00:00:00.000Z", type: "moved", fromColumn: "ghost-col", toColumn: "col1" }),
    ],
    "S001",
    CONFIG,
  );
  assert.equal(history[1]?.toName, "Entrée");
  assert.equal(history[0]?.fromName, "ghost-col");
  assert.equal(history[0]?.toName, "Colonne 1");
});

test("equal timestamps order by the numeric suffix of the event id, newest first", () => {
  const ts = "2026-01-01T00:00:00.000Z";
  const history = cardHistory(
    [
      event({ id: "evt-10", ts, type: "moved", fromColumn: "col2", toColumn: "col3" }),
      event({ id: "evt-2", ts, type: "moved", fromColumn: "col1", toColumn: "col2" }),
    ],
    "S001",
    CONFIG,
  );
  assert.deepEqual(history.map((entry) => entry.toName), ["Colonne 3", "Colonne 2"]);
});

test("a card with no movement events yields an empty history", () => {
  assert.deepEqual(cardHistory(EVENTS, "S999", CONFIG), []);
});
