import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { foldEvents, toCard } from "./state.ts";
import { testCard } from "./test-helpers.ts";

function event(partial: Partial<CardEvent> & Pick<CardEvent, "id" | "ts" | "type" | "cardId">): CardEvent {
  return { actor: "test", fromColumn: null, toColumn: null, payload: {}, ...partial };
}

test("toCard merges financials, null financials yield null fields", () => {
  const subject = { ...testCard(), budget: undefined, consumed: undefined, remaining: undefined };
  const { budget: _b, consumed: _c, remaining: _r, ...bare } = testCard();
  const withMoney = toCard(bare, { budget: 100, consumed: 40, remaining: 60 });
  assert.equal(withMoney.budget, 100);
  assert.equal(withMoney.remaining, 60);
  const withoutMoney = toCard(bare, null);
  assert.equal(withoutMoney.budget, null);
  assert.equal(withoutMoney.consumed, null);
  assert.equal(subject.id, "S001");
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
  // The fold is total: no throw, the title is untouched, and no forged key
  // was assigned as an OWN property of the state object.
  assert.equal(state?.title, "Origine");
  for (const key of poison) {
    assert.equal(Object.prototype.hasOwnProperty.call(state, key), false);
  }
});

test("no events: position from import, enteredColumnAt = createdAt", () => {
  const card = testCard({ createdAt: "2026-02-01T00:00:00.000Z" });
  const [state] = foldEvents([card], []);
  assert.equal(state?.columnId, "col1");
  assert.equal(state?.enteredColumnAt, "2026-02-01T00:00:00.000Z");
});

test("moved updates column, lane and enteredColumnAt", () => {
  const card = testCard();
  const [state] = foldEvents(
    [card],
    [
      event({
        id: "evt-1",
        ts: "2026-03-01T00:00:00.000Z",
        type: "moved",
        cardId: "S001",
        fromColumn: "col1",
        toColumn: "col2",
        payload: { fromLane: "laneA", toLane: "laneB" },
      }),
    ],
  );
  assert.equal(state?.columnId, "col2");
  assert.equal(state?.laneId, "laneB");
  assert.equal(state?.enteredColumnAt, "2026-03-01T00:00:00.000Z");
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

test("created/imported set enteredColumnAt (and column when present)", () => {
  const card = testCard({ columnId: "col2" });
  const [state] = foldEvents(
    [card],
    [event({ id: "evt-1", ts: "2026-01-15T00:00:00.000Z", type: "created", cardId: "S001", toColumn: "col1" })],
  );
  assert.equal(state?.columnId, "col1");
  assert.equal(state?.enteredColumnAt, "2026-01-15T00:00:00.000Z");
});

test("events are replayed in timestamp order regardless of input order", () => {
  const card = testCard();
  const later = event({ id: "evt-2", ts: "2026-04-01T00:00:00.000Z", type: "moved", cardId: "S001", toColumn: "col3", payload: { toLane: "laneA" } });
  const earlier = event({ id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "moved", cardId: "S001", toColumn: "col2", payload: { toLane: "laneA" } });
  const [state] = foldEvents([card], [later, earlier]);
  assert.equal(state?.columnId, "col3");
});

test("same-instant events tie-break on event id (insertion order)", () => {
  const card = testCard();
  const ts = "2026-04-01T00:00:00.000Z";
  const first = event({ id: "evt-1", ts, type: "moved", cardId: "S001", toColumn: "col2", payload: { toLane: "laneA" } });
  const second = event({ id: "evt-2", ts, type: "moved", cardId: "S001", toColumn: "col3", payload: { toLane: "laneA" } });
  const [state] = foldEvents([card], [second, first]);
  assert.equal(state?.columnId, "col3");
});

test("insertion order is numeric, not lexicographic (evt-9 before evt-10)", () => {
  const card = testCard();
  const ts = "2026-04-01T00:00:00.000Z";
  const ninth = event({ id: "evt-9", ts, type: "blocked", cardId: "S001", payload: { reason: "x" } });
  const tenth = event({ id: "evt-10", ts, type: "unblocked", cardId: "S001" });
  const [state] = foldEvents([card], [tenth, ninth]);
  assert.equal(state?.blocked, false, "evt-10 (unblocked) doit rejouer apres evt-9");
});

test("events for unknown cards are ignored, patch-less edited is a no-op", () => {
  const card = testCard();
  const [state] = foldEvents(
    [card],
    [
      event({ id: "evt-1", ts: "2026-03-01T00:00:00.000Z", type: "moved", cardId: "GHOST", toColumn: "col3" }),
      event({ id: "evt-2", ts: "2026-03-02T00:00:00.000Z", type: "edited", cardId: "S001", payload: { title: "x" } }),
    ],
  );
  assert.equal(state?.columnId, "col1");
  assert.equal(state?.title, "Sujet de test");
});

test("edited applies whitelisted patch fields and ignores the rest", () => {
  const card = testCard();
  const [state] = foldEvents(
    [card],
    [
      event({
        id: "evt-1",
        ts: "2026-03-02T00:00:00.000Z",
        type: "edited",
        cardId: "S001",
        payload: {
          patch: {
            title: "Nouveau titre",
            owner: "Mme Nouvelle",
            criticality: "top",
            typeId: "t2",
            budget: 200,
            consumed: 50,
            remaining: 150,
            tags: ["a", "b"],
            id: "HACKED",
            columnId: "col3",
            blocked: true,
            createdAt: "1999-01-01T00:00:00.000Z",
          },
        },
      }),
    ],
  );
  assert.equal(state?.title, "Nouveau titre");
  assert.equal(state?.owner, "Mme Nouvelle");
  assert.equal(state?.criticality, "top");
  assert.equal(state?.typeId, "t2");
  assert.equal(state?.budget, 200);
  assert.deepEqual(state?.tags, ["a", "b"]);
  // Non-editable fields are untouched, whatever the payload claims.
  assert.equal(state?.id, "S001");
  assert.equal(state?.columnId, "col1");
  assert.equal(state?.blocked, false);
  assert.equal(state?.createdAt, "2026-01-01T00:00:00.000Z");
});

test("edited rejects badly-typed patch values", () => {
  const card = testCard();
  const [state] = foldEvents(
    [card],
    [
      event({
        id: "evt-1",
        ts: "2026-03-02T00:00:00.000Z",
        type: "edited",
        cardId: "S001",
        payload: { patch: { title: "", criticality: "urgent", budget: "beaucoup", tags: [1, 2] } },
      }),
    ],
  );
  assert.equal(state?.title, "Sujet de test");
  assert.equal(state?.criticality, "normal");
  assert.equal(state?.budget, null);
  assert.deepEqual(state?.tags, []);
});
