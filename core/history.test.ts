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

test("history: an entry, exit or return carries the load's reason when the log holds one; older events read as before", () => {
  const out = "écarté du périmètre COUT PREV : état « Reporté » hors des états retenus";
  const cases: Array<{ name: string; event: CardEvent; kind: string; reason: string | null }> = [
    { name: "imported with its reason", kind: "move", reason: "nouveau dans le périmètre COUT PREV",
      event: event({ id: "evt-1", ts: "2026-09-01T00:00:00.000Z", type: "imported", toColumn: "col1", payload: { laneId: "laneA", reason: "nouveau dans le périmètre COUT PREV" } }) },
    { name: "unlisted with its reason", kind: "unlisted", reason: out,
      event: event({ id: "evt-2", ts: "2026-09-02T00:00:00.000Z", type: "unlisted", payload: { reason: out } }) },
    { name: "relisted with its reason", kind: "relisted", reason: "de nouveau dans le périmètre COUT PREV",
      event: event({ id: "evt-3", ts: "2026-09-03T00:00:00.000Z", type: "relisted", payload: { reason: "de nouveau dans le périmètre COUT PREV" } }) },
    { name: "unlisted written before (no reason)", kind: "unlisted", reason: null,
      event: event({ id: "evt-4", ts: "2026-09-04T00:00:00.000Z", type: "unlisted" }) },
    { name: "a blank or malformed reason reads as none", kind: "relisted", reason: null,
      event: event({ id: "evt-5", ts: "2026-09-05T00:00:00.000Z", type: "relisted", payload: { reason: 12 } }) },
    { name: "a hand move never borrows a reason", kind: "move", reason: null,
      event: event({ id: "evt-6", ts: "2026-09-06T00:00:00.000Z", type: "moved", fromColumn: "col1", toColumn: "col2", payload: { reason: "x" } }) },
  ];
  for (const c of cases) {
    const [entry] = cardHistory([c.event], "S001", CONFIG);
    assert.deepEqual([entry?.kind, entry?.reason], [c.kind, c.reason], c.name);
  }
});

test("history follows the fold order: a future-dated import of an old log stays below the hand move (ADR 058 amendment)", () => {
  const events: CardEvent[] = [
    event({ id: "evt-1", ts: "2026-11-02T00:00:00.000Z", type: "imported", toColumn: "col1" }),
    event({ id: "evt-2", ts: "2026-09-10T00:00:00.000Z", type: "moved", fromColumn: "col1", toColumn: "col2", actor: "anonymous" }),
  ];
  assert.deepEqual(cardHistory(events, "S001", CONFIG).map((e) => [e.fromName, e.toName, e.ts]), [
    ["Colonne 1", "Colonne 2", "2026-09-10T00:00:00.000Z"],
    [null, "Colonne 1", "2026-11-02T00:00:00.000Z"],
  ]);
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

test("« Mise en pause », « Reprise », and a card sent straight from Demandes into Pause (ADR 052)", () => {
  const config = {
    ...CONFIG,
    columns: [
      { id: "demandes", name: "Demandes", gate: null, review: null, gateStart: null, note: "" },
      { id: "qualification", name: "Qualification", gate: null, review: null, gateStart: null, note: "" },
      { id: "actifs", name: "Actifs", gate: null, review: null, gateStart: null, note: "" },
      { id: "pause", name: "Pause", gate: null, review: null, gateStart: null, note: "" },
    ],
  };
  const move = (id: number, from: string, to: string) => event({
    id: `evt-${id}`, ts: `2026-0${id}-01T00:00:00.000Z`, type: "moved", actor: "anonymous",
    fromColumn: from, toColumn: to, payload: { fromLaneId: "laneA", laneId: "laneA" },
  });
  const history = cardHistory([move(1, "actifs", "pause"), move(2, "pause", "actifs"), move(3, "demandes", "pause")], "S001", config);
  // Pause has canals: leaving the intake straight into it is also the qualification.
  assert.deepEqual(history.map((entry) => entry.gesture), ["Mise en pause · Qualifiée : Lane A", "Reprise", "Mise en pause"]);
});
