// ADR 062 — the « Doutes à trancher » section's state: the rows to decide
// and the remembered ones, the default answers, « Redemander », the
// choices a request sends, whether the report follows the answers, the
// words of the section.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImportDoubt } from "../core/import-types.ts";
import {
  answerOf, choicesPayload, doubtsHeader, EMPTY_DOUBT_STATE, groupDoubts, initialDoubtState, isRemembered, rememberedLine,
  settledReason, splitDoubts, staleCount, withAnswer, withForgotten,
} from "./importDoubts.ts";

function doubt(id: string, over: Partial<ImportDoubt> = {}): ImportDoubt {
  return {
    id, kind: "couts-fact", cardId: `${id}@2026`, code: id, title: `Projet ${id}`, why: "lignes en désaccord",
    options: [
      { id: "a", label: "« Budget validé »", consequence: null },
      { id: "b", label: "« Budget présenté »", consequence: "le projet sort du périmètre" },
    ],
    proposed: "a", applied: "a", how: "proposé", remembered: null, fingerprint: "f", ...over,
  };
}

const MEMO = { option: "b", ts: "2026-09-12T08:00:00.000Z", actor: "anonymous" };
const OPEN = doubt("PE1");
const KEPT = doubt("PE2", { applied: "b", how: "mémorisé", remembered: MEMO });
const DOUBTS = [OPEN, KEPT];

test("the remembered doubts are listed apart until « Redemander »", () => {
  assert.deepEqual(splitDoubts(DOUBTS, EMPTY_DOUBT_STATE), { open: [OPEN], remembered: [KEPT] });
  const asked = withForgotten(EMPTY_DOUBT_STATE, KEPT);
  assert.equal(isRemembered(KEPT, asked), false);
  assert.deepEqual(splitDoubts(DOUBTS, asked), { open: [OPEN, KEPT], remembered: [] });
  assert.deepEqual(answerOf(KEPT, asked), { option: "a", sticky: false }, "asked again on the tool's choice");
  assert.deepEqual(withForgotten(asked, KEPT).forgotten, ["PE2"], "once");
});

test("the tool's choice is pre-selected, never remembered by default", () => {
  assert.deepEqual(answerOf(OPEN, EMPTY_DOUBT_STATE), { option: "a", sticky: false });
  assert.deepEqual(answerOf(OPEN, withAnswer(EMPTY_DOUBT_STATE, "PE1", { option: "b", sticky: true })), { option: "b", sticky: true });
});

const PAYLOAD_CASES: Array<[string, (s: typeof EMPTY_DOUBT_STATE) => typeof EMPTY_DOUBT_STATE, Record<string, unknown>]> = [
  ["nothing touched: nothing sent (the tool's choices apply, the questions come back)", (s) => s, {}],
  ["another option, this load only", (s) => withAnswer(s, "PE1", { option: "b", sticky: false }), { PE1: { option: "b", sticky: false } }],
  ["the tool's choice, « ne plus me demander »", (s) => withAnswer(s, "PE1", { option: "a", sticky: true }), { PE1: { option: "a", sticky: true } }],
  ["« Redemander » left on the tool's choice", (s) => withForgotten(s, KEPT), { PE2: { forget: true } }],
  ["« Redemander » then another option", (s) => withAnswer(withForgotten(s, KEPT), "PE2", { option: "b", sticky: false }), { PE2: { option: "b", sticky: false } }],
  ["a remembered doubt sends nothing (the memory applies)", (s) => withAnswer(s, "PE2", { option: "a", sticky: true }), {}],
];

for (const [name, change, expected] of PAYLOAD_CASES) {
  test(`choicesPayload: ${name}`, () => {
    assert.deepEqual(choicesPayload(DOUBTS, change(EMPTY_DOUBT_STATE)), expected);
  });
}

test("a new audit keeps the answers whose doubt and option still exist; a fresh one starts over", () => {
  const state = withForgotten(withAnswer(withAnswer(EMPTY_DOUBT_STATE, "PE1", { option: "b", sticky: true }), "GONE", { option: "a", sticky: false }), KEPT);
  const next = initialDoubtState([doubt("PE1", { applied: "b", how: "choisi" }), doubt("PE2")], state);
  assert.deepEqual(next, { answers: { PE1: { option: "b", sticky: true }, PE2: { option: "a", sticky: false } }, forgotten: ["PE2"] });
  const other = initialDoubtState([doubt("PE1", { options: [{ id: "x", label: "x", consequence: null }, { id: "a", label: "a", consequence: null }] })], state);
  assert.deepEqual(other.answers, {}, "an option the doubt no longer offers is dropped");
  assert.deepEqual(initialDoubtState(DOUBTS), EMPTY_DOUBT_STATE);
});

test("staleCount: the answers the report on screen did not apply (the sticky flag alone changes nothing)", () => {
  assert.equal(staleCount(DOUBTS, EMPTY_DOUBT_STATE), 0);
  assert.equal(staleCount(DOUBTS, withAnswer(EMPTY_DOUBT_STATE, "PE1", { option: "a", sticky: true })), 0);
  assert.equal(staleCount(DOUBTS, withAnswer(EMPTY_DOUBT_STATE, "PE1", { option: "b", sticky: false })), 1);
  assert.equal(staleCount(DOUBTS, withForgotten(EMPTY_DOUBT_STATE, KEPT)), 1, "the report still applies the remembered choice");
  assert.equal(staleCount([doubt("PE1", { applied: "b", how: "choisi" })], withAnswer(EMPTY_DOUBT_STATE, "PE1", { option: "b", sticky: false })), 0);
});

test("the words: header, kinds grouped in order, the remembered line, the report's reason", () => {
  assert.equal(doubtsHeader(3), "3 doute(s) — l’outil a pré-choisi ; changez ce qui ne va pas");
  assert.equal(doubtsHeader(0), "Aucun doute à trancher.");
  const groups = groupDoubts([OPEN, KEPT, doubt("PE3", { kind: "figure" })]);
  assert.deepEqual(groups.map((g) => [g.title, g.doubts.map((d) => d.id)]), [
    ["Coût (COUT PREV) : lignes du projet en désaccord", ["PE1", "PE2"]], ["Montant ambigu", ["PE3"]],
  ]);
  assert.equal(rememberedLine(KEPT), "Tranché : « Budget présenté » — le 12/09/2026 par anonymous");
  assert.equal(rememberedLine(OPEN), "");
  const settled = { cardId: "PE1@2026", code: "PE1", title: "P", kind: "couts-fact" as const, why: "w", option: "« Budget présenté »" };
  assert.equal(settledReason({ ...settled, how: "mémorisé" }), "« Budget présenté » (choix mémorisé)");
  assert.equal(settledReason({ ...settled, how: "choisi" }), "« Budget présenté » (choisi à ce chargement)");
});
