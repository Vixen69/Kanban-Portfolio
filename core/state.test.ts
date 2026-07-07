import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { EDITABLE_FIELDS, foldEvents, toCard } from "./state.ts";
import { testCard } from "./test-helpers.ts";

function event(partial: Partial<CardEvent> & Pick<CardEvent, "id" | "ts" | "type" | "cardId">): CardEvent {
  return { actor: "test", fromColumn: null, toColumn: null, payload: {}, ...partial };
}

test("toCard maps budget→budgetEstimated and consumed→budgetConsumed", () => {
  const withMoney = toCard(testCard(), { budget: 100, consumed: 40, remaining: 60 });
  assert.equal(withMoney.budgetEstimated, 100);
  assert.equal(withMoney.budgetConsumed, 40);
  // remaining is never stored — derived at display time.
  assert.equal("remaining" in withMoney, false);
  const withoutMoney = toCard(testCard({ budgetEstimated: 999 }), null);
  assert.equal(withoutMoney.budgetEstimated, null);
  assert.equal(withoutMoney.budgetConsumed, null);
});

test("EDITABLE_FIELDS is exactly the v2 CardPatch key set", () => {
  assert.deepEqual(
    [...EDITABLE_FIELDS].sort(),
    [
      "alerts", "budgetConsumed", "budgetEngaged", "budgetEstimated", "budgetRdli",
      "chargeByProfile", "codename", "contentionNote", "contentionProfiles",
      "criticality", "custom", "dateRdr", "domain", "effortConsumed",
      "effortEstimated", "loadPlan", "nature", "notes", "owner",
      "projectConstraints", "resources", "risks", "tags", "title", "typeId",
    ].sort(),
  );
});

test("no events: position from import, enteredColumnAt = createdAt, no comments", () => {
  const card = testCard({ createdAt: "2026-02-01T00:00:00.000Z" });
  const [state] = foldEvents([card], []);
  assert.equal(state?.columnId, "col1");
  assert.equal(state?.enteredColumnAt, "2026-02-01T00:00:00.000Z");
  assert.deepEqual(state?.comments, []);
});

test("created/imported set enteredColumnAt, column and payload lane", () => {
  const card = testCard({ columnId: "col2", laneId: "laneB" });
  const [state] = foldEvents(
    [card],
    [event({ id: "evt-1", ts: "2026-01-15T00:00:00.000Z", type: "imported", cardId: "S001", toColumn: "col1", payload: { laneId: "laneA" } })],
  );
  assert.equal(state?.columnId, "col1");
  assert.equal(state?.laneId, "laneA");
  assert.equal(state?.enteredColumnAt, "2026-01-15T00:00:00.000Z");
});

test("moved updates column, lane from payload.laneId, and enteredColumnAt", () => {
  const card = testCard();
  const [state] = foldEvents(
    [card],
    [
      event({
        id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "moved", cardId: "S001",
        fromColumn: "col1", toColumn: "col2", payload: { fromLaneId: "laneA", laneId: "laneB" },
      }),
    ],
  );
  assert.equal(state?.columnId, "col2");
  assert.equal(state?.laneId, "laneB");
  assert.equal(state?.enteredColumnAt, "2026-03-01T00:00:00.000Z");
});

test("moved without payload lane keeps the current lane", () => {
  const card = testCard({ laneId: "laneB" });
  const [state] = foldEvents(
    [card],
    [event({ id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "moved", cardId: "S001", toColumn: "col3" })],
  );
  assert.equal(state?.columnId, "col3");
  assert.equal(state?.laneId, "laneB");
});

test("blocked then unblocked round-trips the blocked fields", () => {
  const card = testCard();
  const blockedOnly = foldEvents(
    [card],
    [event({ id: "evt-1", ts: "2026-03-02T00:00:00.000Z", type: "blocked", cardId: "S001", payload: { reason: "attente" } })],
  )[0];
  assert.equal(blockedOnly?.blocked, true);
  assert.equal(blockedOnly?.blockedReason, "attente");
  assert.equal(blockedOnly?.blockedSince, "2026-03-02T00:00:00.000Z");

  const roundTrip = foldEvents(
    [card],
    [
      event({ id: "evt-1", ts: "2026-03-02T00:00:00.000Z", type: "blocked", cardId: "S001", payload: { reason: "attente" } }),
      event({ id: "evt-2", ts: "2026-03-05T00:00:00.000Z", type: "unblocked", cardId: "S001" }),
    ],
  )[0];
  assert.equal(roundTrip?.blocked, false);
  assert.equal(roundTrip?.blockedReason, null);
  assert.equal(roundTrip?.blockedSince, null);
});

test("blocked with a malformed reason still blocks, reason falls back to null", () => {
  const [state] = foldEvents(
    [testCard()],
    [event({ id: "evt-1", ts: "2026-03-02T00:00:00.000Z", type: "blocked", cardId: "S001", payload: { reason: 42 } })],
  );
  assert.equal(state?.blocked, true);
  assert.equal(state?.blockedReason, null);
});

test("events are replayed in timestamp order regardless of input order", () => {
  const card = testCard();
  const later = event({ id: "evt-2", ts: "2026-04-01T00:00:00.000Z", type: "moved", cardId: "S001", toColumn: "col3" });
  const earlier = event({ id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "moved", cardId: "S001", toColumn: "col2" });
  const [state] = foldEvents([card], [later, earlier]);
  assert.equal(state?.columnId, "col3");
});

test("same-instant events tie-break on numeric id (evt-9 before evt-10)", () => {
  const card = testCard();
  const ts = "2026-04-01T00:00:00.000Z";
  const ninth = event({ id: "evt-9", ts, type: "blocked", cardId: "S001", payload: { reason: "x" } });
  const tenth = event({ id: "evt-10", ts, type: "unblocked", cardId: "S001" });
  const [state] = foldEvents([card], [tenth, ninth]);
  assert.equal(state?.blocked, false, "evt-10 (unblocked) must replay after evt-9");
});

test("events for unknown cards are ignored, patch-less edited is a no-op", () => {
  const card = testCard();
  const [state] = foldEvents(
    [card],
    [
      event({ id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "moved", cardId: "GHOST", toColumn: "col3" }),
      event({ id: "evt-2", ts: "2026-03-02T00:00:00.000Z", type: "deleted", cardId: "GHOST" }),
      event({ id: "evt-3", ts: "2026-03-03T00:00:00.000Z", type: "edited", cardId: "S001", payload: { title: "x" } }),
      event({ id: "evt-4", ts: "2026-03-04T00:00:00.000Z", type: "edited", cardId: "S001", payload: { patch: "pas un objet" } }),
    ],
  );
  assert.equal(state?.columnId, "col1");
  assert.equal(state?.title, "Sujet de test");
});

// The full EDITABLE_FIELDS whitelist coverage (every field applies, forged
// non-editable fields are ignored) lives in state.edited.test.ts.

test("edited rejects badly-typed patch values field by field", () => {
  const card = testCard({ loadPlan: "2 ETP" });
  const patch = {
    title: "", owner: 3, criticality: "urgent", nature: "chaotique",
    typeId: 5, effortEstimated: "beaucoup", budgetEstimated: Number.NaN,
    budgetConsumed: Number.POSITIVE_INFINITY, tags: [1, 2], resources: "solo",
    loadPlan: 7, notes: null, custom: "pas une map",
  };
  const [state] = foldEvents(
    [card],
    [event({ id: "evt-1", ts: "2026-03-02T00:00:00.000Z", type: "edited", cardId: "S001", payload: { patch } })],
  );
  assert.equal(state?.title, "Sujet de test");
  assert.equal(state?.owner, "M. Test");
  assert.equal(state?.criticality, "normal");
  assert.equal(state?.nature, "simple");
  assert.equal(state?.typeId, "t1");
  assert.equal(state?.effortEstimated, null);
  assert.equal(state?.budgetEstimated, null);
  assert.equal(state?.budgetConsumed, null);
  assert.deepEqual(state?.tags, []);
  assert.deepEqual(state?.resources, []);
  assert.equal(state?.loadPlan, "2 ETP");
  assert.equal(state?.notes, "");
  assert.deepEqual(state?.custom, {});
});

test("custom REPLACES the whole map; a map with a bad value is rejected whole", () => {
  const card = testCard({ custom: { a: 1, b: "x" } });
  const replaced = foldEvents(
    [card],
    [event({ id: "evt-1", ts: "2026-03-02T00:00:00.000Z", type: "edited", cardId: "S001", payload: { patch: { custom: { c: true } } } })],
  )[0];
  assert.deepEqual(replaced?.custom, { c: true });
  const rejected = foldEvents(
    [card],
    [event({ id: "evt-1", ts: "2026-03-02T00:00:00.000Z", type: "edited", cardId: "S001", payload: { patch: { custom: { ok: "oui", bad: { nested: 1 } } } } })],
  )[0];
  assert.deepEqual(rejected?.custom, { a: 1, b: "x" });
});

test("patched arrays and custom map are copies, never payload aliases", () => {
  const tags = ["a"];
  const custom: Record<string, unknown> = { a: 1 };
  const [state] = foldEvents(
    [testCard()],
    [event({ id: "evt-1", ts: "2026-03-02T00:00:00.000Z", type: "edited", cardId: "S001", payload: { patch: { tags, custom } } })],
  );
  tags.push("b");
  custom["b"] = 2;
  assert.deepEqual(state?.tags, ["a"]);
  assert.deepEqual(state?.custom, { a: 1 });
});

test("edited patch with prototype-named keys neither throws nor corrupts state", () => {
  const card = testCard({ title: "Origine" });
  const poison = ["hasOwnProperty", "valueOf", "isPrototypeOf", "constructor", "toString", "__proto__"];
  const events = poison.map((key, index) =>
    event({
      id: `evt-${index + 1}`,
      ts: `2026-03-0${index + 1}T00:00:00.000Z`,
      type: "edited",
      cardId: "S001",
      payload: { patch: { [key]: "x" } },
    }),
  );
  const [state] = foldEvents([card], events);
  assert.equal(state?.title, "Origine");
  for (const key of poison) {
    assert.equal(Object.prototype.hasOwnProperty.call(state, key), false);
  }
});

test("commented accumulates chronologically; malformed texts are skipped", () => {
  const card = testCard();
  const [state] = foldEvents(
    [card],
    [
      event({ id: "evt-2", ts: "2026-03-05T00:00:00.000Z", type: "commented", cardId: "S001", actor: "Marie", payload: { text: "Deuxième point" } }),
      event({ id: "evt-3", ts: "2026-03-06T00:00:00.000Z", type: "commented", cardId: "S001", payload: {} }),
      event({ id: "evt-4", ts: "2026-03-07T00:00:00.000Z", type: "commented", cardId: "S001", payload: { text: 42 } }),
      event({ id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "commented", cardId: "S001", actor: "Pierre", payload: { text: "C’est prêt" } }),
    ],
  );
  assert.deepEqual(state?.comments, [
    { actor: "Pierre", ts: "2026-03-01T00:00:00.000Z", text: "C’est prêt" },
    { actor: "Marie", ts: "2026-03-05T00:00:00.000Z", text: "Deuxième point" },
  ]);
});

test("deleted excludes the card from folded output, other cards remain", () => {
  const kept = testCard({ id: "S002", title: "Survivant" });
  const states = foldEvents(
    [testCard(), kept],
    [event({ id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "deleted", cardId: "S001" })],
  );
  assert.deepEqual(states.map((s) => s.id), ["S002"]);
});

test("deletion mid-stream: earlier events apply, later ones are ignored", () => {
  const card = testCard();
  const states = foldEvents(
    [card],
    [
      event({ id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "moved", cardId: "S001", toColumn: "col2" }),
      event({ id: "evt-2", ts: "2026-03-02T00:00:00.000Z", type: "deleted", cardId: "S001" }),
      event({ id: "evt-3", ts: "2026-03-03T00:00:00.000Z", type: "moved", cardId: "S001", toColumn: "col3" }),
      event({ id: "evt-4", ts: "2026-03-04T00:00:00.000Z", type: "commented", cardId: "S001", payload: { text: "fantôme" } }),
      event({ id: "evt-5", ts: "2026-03-05T00:00:00.000Z", type: "created", cardId: "S001", toColumn: "col1" }),
    ],
  );
  assert.deepEqual(states, []);
});
