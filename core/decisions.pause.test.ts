// The pause in force (ADR 052): only a card sitting in Pause shows a
// decision; the one that counts is the last « Mettre en pause » recorded
// since it entered the stage — earlier pauses are history.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { foldEvents } from "./state.ts";
import { pauseStatus, reviewOverdue } from "./decisions.ts";
import { testCard } from "./test-helpers.ts";

const NOW = new Date("2026-11-10T10:00:00.000Z");

function ev(id: number, ts: string, type: CardEvent["type"], extra: Partial<CardEvent> = {}): CardEvent {
  return { id: `evt-${id}`, ts, actor: "anonymous", cardId: "S001", type, fromColumn: null, toColumn: null, payload: {}, ...extra };
}

function toPause(id: number, ts: string): CardEvent {
  return ev(id, ts, "moved", { fromColumn: "actifs", toColumn: "pause", payload: { fromLaneId: "laneA", laneId: "laneA" } });
}

function pause(id: number, ts: string, reviewDate: string | null, pauseKind?: string): CardEvent {
  return ev(id, ts, "decided", { payload: { decisionId: "D4", grounds: [], reason: "x", reviewDate, ...(pauseKind ? { pauseKind } : {}) } });
}

function fold(events: CardEvent[]) {
  const [state] = foldEvents([testCard({ id: "S001", columnId: "actifs" })], events);
  assert.ok(state);
  return state;
}

test("a card in Pause with its decision: the review date is read, past = overdue", () => {
  const card = fold([toPause(1, "2026-10-01T09:00:00.000Z"), pause(2, "2026-10-01T09:00:00.000Z", "2026-11-02")]);
  const status = pauseStatus(card, NOW);
  assert.equal(status?.entry?.reviewDate, "2026-11-02");
  assert.equal(status?.daysToReview, -8);
  assert.equal(status?.overdue, true);
  assert.equal(reviewOverdue(card, NOW), true);
});

test("a renewal replaces the pause in force; a parking has no date and is never overdue", () => {
  const card = fold([
    toPause(1, "2026-10-01T09:00:00.000Z"), pause(2, "2026-10-01T09:00:00.000Z", "2026-11-02"),
    pause(3, "2026-11-05T09:00:00.000Z", null, "parking"),
  ]);
  const status = pauseStatus(card, NOW);
  assert.equal(status?.entry?.pauseKind, "parking");
  assert.equal(status?.overdue, false);
});

test("an untraced pause reads as entry null; a pause before the last entry does not count", () => {
  const untraced = fold([toPause(1, "2026-10-01T09:00:00.000Z")]);
  assert.deepEqual(pauseStatus(untraced, NOW), { entry: null, daysToReview: null, overdue: false });
  const again = fold([
    toPause(1, "2026-06-01T09:00:00.000Z"), pause(2, "2026-06-01T09:00:00.000Z", "2026-07-01"),
    ev(3, "2026-07-01T09:00:00.000Z", "moved", { fromColumn: "pause", toColumn: "actifs", payload: { fromLaneId: "laneA", laneId: "laneA" } }),
    toPause(4, "2026-10-01T09:00:00.000Z"),
  ]);
  assert.equal(pauseStatus(again, NOW)?.entry, null);
});

test("out of Pause: no pause status, nothing overdue", () => {
  const card = fold([toPause(1, "2026-10-01T09:00:00.000Z"), pause(2, "2026-10-01T09:00:00.000Z", "2026-10-02"),
    ev(3, "2026-10-05T09:00:00.000Z", "moved", { fromColumn: "pause", toColumn: "actifs", payload: { fromLaneId: "laneA", laneId: "laneA" } })]);
  assert.equal(pauseStatus(card, NOW), null);
  assert.equal(reviewOverdue(card, NOW), false);
});

test("the year switch, a canal change inside Pause, or a pause decided just before the drag keep the pause in force", () => {
  const activated = fold([toPause(1, "2026-10-01T09:00:00.000Z"), pause(2, "2026-10-01T09:00:00.000Z", "2026-12-02"),
    ev(3, "2027-01-01T00:00:00.000Z", "activated")]);
  assert.equal(pauseStatus(activated, NOW)?.entry?.reviewDate, "2026-12-02");
  const requalified = fold([toPause(1, "2026-10-01T09:00:00.000Z"), pause(2, "2026-10-01T09:00:00.000Z", "2026-12-02"),
    ev(3, "2026-10-05T09:00:00.000Z", "moved", { fromColumn: "pause", toColumn: "pause", payload: { fromLaneId: "laneA", laneId: "laneB" } })]);
  assert.equal(pauseStatus(requalified, NOW)?.entry?.reviewDate, "2026-12-02");
  // Before ADR 052 the D4 was traced from the fiche, then the card dragged into Pause.
  const legacy = fold([pause(1, "2026-09-20T09:00:00.000Z", "2026-12-02"), toPause(2, "2026-09-20T09:05:00.000Z")]);
  assert.equal(pauseStatus(legacy, NOW)?.entry?.reviewDate, "2026-12-02");
});
