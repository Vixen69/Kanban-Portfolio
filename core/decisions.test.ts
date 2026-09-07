import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardDecision, CardEvent, CardState } from "./types.ts";
import { foldEvents } from "./state.ts";
import { cardHistory } from "./history.ts";
import { decisionStatus, groundsOf, isIsoDate, lastDecision, reviewOverdue } from "./decisions.ts";
import { testCard, testConfig } from "./test-helpers.ts";

const CONFIG = testConfig(); // decisions D2 (free) and D4 (traced); grounds fin_proche, n_avance_pas
const NOW = new Date("2026-09-08T10:00:00.000Z");

function event(partial: Partial<CardEvent> & Pick<CardEvent, "id" | "ts" | "type">): CardEvent {
  return { actor: "test", cardId: "S001", fromColumn: null, toColumn: null, payload: {}, ...partial };
}

function decided(id: string, ts: string, payload: Partial<CardDecision>): CardEvent {
  return event({ id, ts, type: "decided", payload: { decisionId: "D4", grounds: [], reason: "", reviewDate: null, ...payload } });
}

function fold(events: CardEvent[]): CardState {
  const state = foldEvents([testCard()], events)[0];
  assert.ok(state);
  return state;
}

test("the fold projects decided events in order and reads the last one", () => {
  const state = fold([
    decided("evt-1", "2026-08-01T10:00:00.000Z", { decisionId: "D2", reason: "On continue." }),
    decided("evt-2", "2026-09-01T10:00:00.000Z", { grounds: ["n_avance_pas"], reason: "Bloqué depuis deux mois.", reviewDate: "2026-09-30" }),
  ]);
  assert.equal(state.decisions.length, 2);
  assert.deepEqual(lastDecision(state), {
    actor: "test", ts: "2026-09-01T10:00:00.000Z", decisionId: "D4",
    grounds: ["n_avance_pas"], reason: "Bloqué depuis deux mois.", reviewDate: "2026-09-30",
  });
  const status = decisionStatus(state, CONFIG, NOW);
  assert.equal(status?.decision?.name, "Mettre en pause");
  assert.equal(status?.daysToReview, 22);
  assert.equal(status?.overdue, false);
  assert.equal(reviewOverdue(state, NOW), false);
});

test("a past review date reads as overdue; no decision reads as null", () => {
  const state = fold([decided("evt-1", "2026-07-01T10:00:00.000Z", { reviewDate: "2026-09-01" })]);
  const status = decisionStatus(state, CONFIG, NOW);
  assert.equal(status?.daysToReview, -7);
  assert.equal(status?.overdue, true);
  assert.equal(reviewOverdue(state, NOW), true);
  assert.equal(decisionStatus(fold([]), CONFIG, NOW), null);
  assert.equal(lastDecision(fold([])), null);
});

test("a malformed decided payload is skipped, never corrupting the state", () => {
  const state = fold([event({ id: "evt-1", ts: "2026-08-01T10:00:00.000Z", type: "decided", payload: { decisionId: 42 } })]);
  assert.deepEqual(state.decisions, []);
});

test("an unknown decision id keeps the entry but yields no decision type", () => {
  const state = fold([decided("evt-1", "2026-08-01T10:00:00.000Z", { decisionId: "D9" })]);
  const status = decisionStatus(state, CONFIG, NOW);
  assert.equal(status?.decision, null);
  assert.equal(status?.entry.decisionId, "D9");
});

test("unlisted marks the card absent from the last import, relisted and imported clear it", () => {
  const unlisted = fold([event({ id: "evt-1", ts: "2026-09-01T10:00:00.000Z", type: "unlisted" })]);
  assert.equal(unlisted.absentFromLastImport, "2026-09-01T10:00:00.000Z");
  const back = fold([
    event({ id: "evt-1", ts: "2026-09-01T10:00:00.000Z", type: "unlisted" }),
    event({ id: "evt-2", ts: "2026-09-08T10:00:00.000Z", type: "relisted" }),
  ]);
  assert.equal(back.absentFromLastImport, null);
  const imported = fold([
    event({ id: "evt-1", ts: "2026-09-01T10:00:00.000Z", type: "unlisted" }),
    event({ id: "evt-2", ts: "2026-09-08T10:00:00.000Z", type: "imported", toColumn: "col1" }),
  ]);
  assert.equal(imported.absentFromLastImport, null);
});

test("the history narrates decisions with their grid terms, and the import absences", () => {
  const events = [
    decided("evt-1", "2026-09-01T10:00:00.000Z", { grounds: ["n_avance_pas", "inconnu"], reason: "Bloqué.", reviewDate: "2026-09-30" }),
    event({ id: "evt-2", ts: "2026-09-02T10:00:00.000Z", type: "unlisted" }),
    event({ id: "evt-3", ts: "2026-09-03T10:00:00.000Z", type: "relisted" }),
  ];
  const entries = cardHistory(events, "S001", CONFIG);
  assert.deepEqual(entries.map((e) => [e.kind, e.detail, e.reason]), [
    ["relisted", null, null],
    ["unlisted", null, null],
    ["decision", "D4 Mettre en pause · N’avance pas · réexamen le 30/09/2026", "Bloqué."],
  ]);
});

test("grid terms resolve in config order, unknown ids dropped; ISO dates are checked", () => {
  assert.deepEqual(groundsOf(CONFIG, ["n_avance_pas", "x", "fin_proche"]).map((g) => g.id), ["fin_proche", "n_avance_pas"]);
  assert.equal(isIsoDate("2026-10-01"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("01/10/2026"), false);
});
