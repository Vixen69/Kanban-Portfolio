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

test("history narrates movements and blockages, most recent first (design v11)", () => {
  assert.deepEqual(cardHistory(EVENTS, "S001", CONFIG), [
    { kind: "unblock", fromName: null, toName: null, reason: null, detail: null, gesture: null, ts: "2026-03-05T00:00:00.000Z", actor: "sciforma-sync" },
    { kind: "block", fromName: null, toName: null, reason: "attente", detail: null, gesture: null, ts: "2026-03-01T00:00:00.000Z", actor: "sciforma-sync" },
    { kind: "move", fromName: "Colonne 1", toName: "Colonne 2", reason: null, detail: null, gesture: "Faire entrer", ts: "2026-02-01T00:00:00.000Z", actor: "anonymous" },
    { kind: "move", fromName: null, toName: "Colonne 1", reason: null, detail: null, gesture: null, ts: "2026-01-01T00:00:00.000Z", actor: "sciforma-sync" },
  ]);
});

test("created behaves like imported: fromName null, destination named", () => {
  const history = cardHistory(
    [event({ id: "evt-1", ts: "2026-05-01T00:00:00.000Z", type: "created", toColumn: "col2", actor: "anonymous" })],
    "S001",
    CONFIG,
  );
  assert.deepEqual(history, [
    { kind: "move", fromName: null, toName: "Colonne 2", reason: null, detail: null, gesture: null, ts: "2026-05-01T00:00:00.000Z", actor: "anonymous" },
  ]);
});

test("a blocked event without a string reason yields reason null", () => {
  const history = cardHistory(
    [event({ id: "evt-1", ts: "2026-05-01T00:00:00.000Z", type: "blocked", payload: {} })],
    "S001",
    CONFIG,
  );
  assert.deepEqual(history, [
    { kind: "block", fromName: null, toName: null, reason: null, detail: null, gesture: null, ts: "2026-05-01T00:00:00.000Z", actor: "sciforma-sync" },
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

test("a same-cell reorder is not narrated (ADR 019)", () => {
  const history = cardHistory(
    [
      event({ id: "evt-1", ts: "2026-01-01T00:00:00.000Z", type: "created", toColumn: "col1", payload: { laneId: "laneA" } }),
      event({
        id: "evt-2", ts: "2026-01-05T00:00:00.000Z", type: "moved",
        fromColumn: "col1", toColumn: "col1",
        payload: { fromLaneId: "laneA", laneId: "laneA", beforeId: "S099" },
      }),
    ],
    "S001",
    CONFIG,
  );
  assert.equal(history.length, 1);
  assert.equal(history[0]?.toName, "Colonne 1");
});

test("a card with no narrated events yields an empty history", () => {
  assert.deepEqual(cardHistory(EVENTS, "S999", CONFIG), []);
});

test("hand moves carry their gesture's words; the import's do not (ADR 052)", () => {
  const config = { ...CONFIG, lanes: [...CONFIG.lanes] };
  const move = (id: number, from: [string, string], to: [string, string], actor = "anonymous") => event({
    id: `evt-${id}`, ts: `2026-0${id}-01T00:00:00.000Z`, type: "moved", actor,
    fromColumn: from[1], toColumn: to[1], payload: { fromLaneId: from[0], laneId: to[0] },
  });
  const history = cardHistory([
    move(1, ["laneA", "col2"], ["laneB", "col3"]),
    move(2, ["laneB", "col3"], ["laneA", "col3"]),
    move(3, ["laneA", "col3"], ["laneB", "col3"], "import-csv"),
  ], "S001", config);
  assert.deepEqual(history.map((entry) => entry.gesture), [
    null,
    "Requalifiée : Lane B → Lane A",
    "Qualifiée : Lane B",
  ]);
});

test("a decision line reads the fiche's blocks (ADR 052)", () => {
  const history = cardHistory([event({
    id: "evt-1", ts: "2026-05-01T00:00:00.000Z", type: "decided",
    payload: { decisionId: "D4", grounds: ["n_avance_pas"], reason: "Plus de sponsor.", reviewDate: "2026-11-02", pauseKind: "tactique", liftCondition: "Un sponsor nommé", decidedOn: "2026-10-01" },
  })], "S001", CONFIG);
  assert.equal(history[0]?.detail, "D4 Mettre en pause · pause tactique · N’avance pas · réexamen le 02/11/2026 · décidée le 01/10/2026");
  assert.equal(history[0]?.reason, "Plus de sponsor. — Pour la lever : Un sponsor nommé");
});
