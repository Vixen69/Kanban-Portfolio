// What changed since an instantané (ADR 053): the board at the snapshot's
// log position against the board now.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, CardEvent } from "./types.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import { foldEvents } from "./state.ts";
import { boardAt, diffBoards } from "./snapshot-diff.ts";

// testConfig: col1 and col2 have no canal (ADR 039), col3 has canals.
const config: BoardConfig = testConfig();

function ev(seq: number, cardId: string, type: CardEvent["type"], extra: Partial<CardEvent> = {}): CardEvent {
  return { id: `evt-${seq}`, ts: `2026-09-${String(seq).padStart(2, "0")}T10:00:00.000Z`, actor: "import-csv", cardId, type, fromColumn: null, toColumn: null, payload: {}, ...extra };
}

test("boardAt reads the board as it was at a log position", () => {
  const cards = [testCard({ id: "S1", columnId: "col1" })];
  const events = [ev(1, "S1", "moved", { fromColumn: "col1", toColumn: "col3", payload: { fromLaneId: "laneA", laneId: "laneA" } })];
  assert.equal(boardAt(cards, events, 0)[0]?.columnId, "col1");
  assert.equal(boardAt(cards, events, 1)[0]?.columnId, "col3");
});

test("diffBoards: every kind of change, grouped and named", () => {
  const snapshotCards = [
    testCard({ id: "S1", title: "Alpha" }), testCard({ id: "S2", title: "Bravo" }), testCard({ id: "S3", title: "Charlie", columnId: "col3" }),
    testCard({ id: "S4", title: "Delta" }), testCard({ id: "S5", title: "Echo" }),
  ];
  const before = foldEvents(snapshotCards, []);
  const nowCards = [
    ...snapshotCards.filter((card) => card.id !== "S5"),
    testCard({ id: "S6", title: "Foxtrot" }),
  ];
  const after = foldEvents(nowCards, [
    ev(1, "S1", "unlisted"),
    ev(2, "S2", "moved", { fromColumn: "col1", toColumn: "col3", payload: { fromLaneId: "laneA", laneId: "laneA" } }),
    ev(3, "S3", "edited", { payload: { patch: { domain: "beta", title: "Charlie 2" } } }),
    ev(4, "S4", "archived"),
  ]);
  const changes = diffBoards(config, before, after);
  assert.deepEqual(changes.map((c) => [c.kind, c.cardId, c.from, c.to]), [
    ["added", "S6", null, null],
    ["absent", "S1", null, null],
    ["removed", "S5", null, null],
    ["moved", "S2", "col1", "col3|laneA"],
    ["domain", "S3", "alpha", "beta"],
    ["title", "S3", "Charlie", "Charlie 2"],
    ["archived", "S4", null, null],
  ]);
});

test("diffBoards: a canal change hidden in a canal-less column is not a move; nothing changed, nothing listed", () => {
  const cards = [testCard({ id: "S1", columnId: "col1", laneId: "laneA" })];
  const before = foldEvents(cards, []);
  const after = foldEvents([testCard({ id: "S1", columnId: "col1", laneId: "laneB" })], []);
  assert.deepEqual(diffBoards(config, before, after), []);
  assert.deepEqual(diffBoards(config, before, before), []);
});

test("diffBoards (ADR 055): the refreshed values after the text facts, figures in their order, numbers not strings", () => {
  const cards = [
    testCard({ id: "S1", title: "Alpha", budgetEstimated: 100, chargeByProfile: [{ profileId: "pA", jh: 20, done: 5 }] }),
    testCard({ id: "S2", title: "Bravo", budgetRdli: 50, owner: "Alice" }),
  ];
  const before = foldEvents(cards, []);
  const after = foldEvents(cards, [
    ev(1, "S1", "edited", { payload: { patch: { budgetEstimated: 80, chargeByProfile: [{ profileId: "pA", jh: 20, done: 15 }] } } }),
    ev(2, "S2", "edited", { payload: { patch: { budgetRdli: 60, owner: "Bruno", title: "Bravo 2" } } }),
  ]);
  const changes = diffBoards(config, before, after);
  assert.deepEqual(changes.map((c) => [c.kind, c.cardId, c.kind === "figure" ? c.figure.fact : c.from]), [
    ["title", "S2", "Bravo"],
    ["owner", "S2", "Alice"],
    ["figure", "S2", "budgetRdli"],
    ["figure", "S1", "budgetEstimated"],
    ["plan", "S1", null],
  ]);
  const plan = changes.find((c) => c.kind === "plan");
  assert.ok(plan?.kind === "plan");
  assert.deepEqual([plan.plan.before.raf, plan.plan.after.raf], [15, 5]);
});
