// ADR 062 — the book of the « Doutes à trancher » and its memory in the
// log: the request's choice, else a remembered sticky choice while the
// doubt is unchanged, else the tool's proposal; the `settled` events a
// load writes, their reading back through the restores.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "../../core/types.ts";
import type { ImportChoice } from "../../core/import-types.ts";
import { lifecycleEvent } from "../../core/events.ts";
import { foldEvents } from "../../core/state.ts";
import { cardHistory } from "../../core/history.ts";
import { testCard, testConfig } from "../../core/test-helpers.ts";
import { createDoubtBook, doubtFingerprint, doubtId } from "./doubt-book.ts";
import type { BookInput, DoubtSpec } from "./doubt-book.ts";
import { bookInput, checkChoices, rememberedChoices, settledEvents, settledOf } from "./doubt-memory.ts";

const SPEC: DoubtSpec = {
  kind: "couts-fact", detail: "etat", code: "PE1", name: "socle", title: "Socle", why: "lignes en désaccord",
  options: [
    { id: "v:a", label: "« Budget validé »", consequence: "retenu" },
    { id: "v:b", label: "« Budget présenté »", consequence: "sort du périmètre", trace: "présenté" },
  ],
  proposed: "v:a",
};
const ID = "couts-fact|2026|PE1|etat";
const FINGERPRINT = doubtFingerprint(ID, SPEC);

function ask(input: Partial<BookInput>, spec: DoubtSpec = SPEC) {
  const book = createDoubtBook({ year: 2026, ...input });
  const applied = book.ask(spec);
  return { book, applied, doubt: book.list()[0] };
}

const memory = (option: string, sticky: boolean, fingerprint = FINGERPRINT) =>
  new Map([[ID, { option, sticky, fingerprint, ts: "2026-09-01T00:00:00.000Z", actor: "pmo" }]]);

test("a remembered choice says when and by whom it was written (« Déjà tranchés »)", () => {
  assert.deepEqual(ask({ memory: memory("v:b", true) }).doubt?.remembered, { option: "v:b", ts: "2026-09-01T00:00:00.000Z", actor: "pmo" });
});

test("the id, the would-be card and the proposal: nothing asked applies the tool's choice", () => {
  const { applied, doubt } = ask({});
  assert.equal(doubtId(SPEC, 2026), ID);
  assert.equal(applied, "v:a");
  assert.deepEqual([doubt?.id, doubt?.cardId, doubt?.how, doubt?.remembered, doubt?.options.map((o) => o.id)], [ID, "PE1@2026", "proposé", null, ["v:a", "v:b"]]);
});

const MEMORY_CASES: Array<[string, Partial<BookInput>, string, string]> = [
  ["a sticky choice on the same doubt is reapplied", { memory: memory("v:b", true) }, "v:b", "mémorisé"],
  ["a choice for this load only is not remembered", { memory: memory("v:b", false) }, "v:a", "proposé"],
  ["a changed doubt (another fingerprint) asks again", { memory: memory("v:b", true, "00000000") }, "v:a", "proposé"],
  ["« Redemander » ignores the memory", { memory: memory("v:b", true), forgotten: new Set([ID]) }, "v:a", "proposé"],
  ["the request's choice beats the memory", { memory: memory("v:b", true), choices: new Map([[ID, "v:a"]]) }, "v:a", "choisi"],
  ["a request option the doubt lacks is not applied", { choices: new Map([[ID, "v:z"]]) }, "v:a", "proposé"],
  ["a remembered option the doubt no longer offers is dropped", { memory: memory("v:z", true) }, "v:a", "proposé"],
];

for (const [name, input, applied, how] of MEMORY_CASES) {
  test(name, () => {
    const result = ask(input);
    assert.deepEqual([result.applied, result.doubt?.how], [applied, how]);
  });
}

test("a doubt is recorded once; fewer than two options, or a proposal outside them, is no doubt", () => {
  const book = createDoubtBook({ year: 2026, choices: new Map([[ID, "v:b"]]) });
  assert.equal(book.ask(SPEC), "v:b");
  assert.equal(book.ask({ ...SPEC, options: [...SPEC.options].reverse() }), "v:b", "the same id answers the same");
  assert.equal(book.ask({ ...SPEC, detail: "type", options: [SPEC.options[0]!] }), "v:a");
  assert.equal(book.ask({ ...SPEC, detail: "nom", proposed: "v:x" }), "v:x");
  assert.equal(book.list().length, 1);
});

test("the list is sorted by kind then code, the proposal first; side doubts no card answers to are dropped; ids remapped", () => {
  const book = createDoubtBook({ year: 2026 });
  book.ask({ ...SPEC, kind: "figure", code: "PE0", detail: "Coût réel" });
  book.ask({ ...SPEC, code: "PE9", proposed: "v:b" });
  book.ask({ ...SPEC, code: "PE2", kind: "duplicate-row", detail: "sp", joinKeys: ["PE2"] });
  book.ask({ ...SPEC, code: "PE3", kind: "duplicate-row", detail: "sp", joinKeys: ["Nom Trois"] });
  book.keepSideDoubts(new Set(["nom trois"]));
  book.remapCards(new Map([["PE9@2026", "S001"]]));
  const list = book.list();
  assert.deepEqual(list.map((d) => [d.kind, d.code, d.cardId]), [
    ["couts-fact", "PE9", "S001"], ["duplicate-row", "PE3", "PE3@2026"], ["figure", "PE0", "PE0@2026"],
  ]);
  assert.equal(list[0]?.options[0]?.id, "v:b", "the proposal first");
  assert.equal(book.traceLabel(list[0]?.id ?? "", "v:b"), "présenté", "the trace words, when the label carries a name");
});

function settled(seq: number, doubt: string, option: string, sticky: boolean, fingerprint = FINGERPRINT): CardEvent {
  return { ...lifecycleEvent("settled", "PE1@2026", "anonymous", `2026-09-0${seq}T00:00:00.000Z`, { doubtId: doubt, option, sticky, fingerprint }), id: `evt-${seq}` };
}

test("the memory is the log's last word per doubt (by sequence), read through the restores", () => {
  const log = [settled(1, ID, "v:b", true), settled(2, "autre", "x", true), settled(3, ID, "v:a", false)];
  assert.deepEqual(rememberedChoices(log).get(ID), { option: "v:a", sticky: false, fingerprint: FINGERPRINT, ts: "2026-09-03T00:00:00.000Z", actor: "anonymous" });
  const restored: CardEvent = { ...lifecycleEvent("restored", "*", "pmo", "2026-09-04T00:00:00.000Z", { toSeq: 2 }), id: "evt-4" };
  assert.equal(rememberedChoices([...log, restored]).get(ID)?.option, "v:b", "the restore undoes the later « Redemander »");
  const input = bookInput(2026, new Map<string, ImportChoice>([[ID, { forget: true }], ["x", { option: "o", sticky: true }]]), log);
  assert.deepEqual([[...(input.forgotten ?? [])], [...(input.choices ?? [])]], [[ID], [["x", "o"]]]);
});

test("checkChoices refuses an option the doubt lacks, in French; a choice whose doubt vanished is ignored, not refused", () => {
  const { doubt } = ask({});
  const doubts = doubt === undefined ? [] : [doubt];
  assert.deepEqual(checkChoices(doubts, new Map([[ID, { option: "v:b", sticky: true }]])), { problem: null, ignored: [] });
  assert.deepEqual(checkChoices(doubts, new Map([[ID, { forget: true }]])), { problem: null, ignored: [] });
  assert.deepEqual(checkChoices(doubts, new Map<string, ImportChoice>([["disparu", { forget: true }], [ID, { option: "v:b", sticky: false }], ["autre", { option: "x", sticky: true }]])),
    { problem: null, ignored: ["disparu", "autre"] });
  assert.match(checkChoices(doubts, new Map([[ID, { option: "v:z", sticky: false }]])).problem ?? "", /^Choix « v:z » inconnu pour « Socle »/);
});

test("settledOf: a choice that keeps the tool's option (« ne plus me demander » alone) is not « tranché autrement », chosen or remembered", () => {
  const chosen = ask({ choices: new Map([[ID, "v:a"]]) });
  const remembered = ask({ memory: memory("v:a", true) });
  assert.deepEqual([chosen.doubt?.how, remembered.doubt?.how], ["choisi", "mémorisé"]);
  assert.deepEqual(settledOf([chosen.doubt, remembered.doubt].filter((d) => d !== undefined)), []);
  const request = new Map<string, ImportChoice>([[ID, { option: "v:a", sticky: true }]]);
  assert.equal(settledEvents(chosen.doubt === undefined ? [] : [chosen.doubt], request, chosen.book, "a", "t").length, 1, "still traced in the log");
});

test("settledEvents: one event per answer sent, the trace words, sticky, forget; untouched doubts write nothing", () => {
  const request = new Map<string, ImportChoice>([[ID, { option: "v:b", sticky: true }]]);
  const { book, doubt } = ask({ choices: new Map([[ID, "v:b"]]) });
  const events = settledEvents(doubt === undefined ? [] : [doubt], request, book, "anonymous", "2026-09-30T00:00:00.000Z");
  assert.deepEqual(events.map((e) => [e.type, e.cardId, e.actor, e.payload]), [["settled", "PE1@2026", "anonymous", {
    doubtId: ID, kind: "couts-fact", fingerprint: FINGERPRINT, option: "v:b", label: "présenté", proposed: "v:a", sticky: true,
  }]]);
  assert.deepEqual(settledEvents(doubt === undefined ? [] : [doubt], new Map(), book, "a", "t"), []);
  const forgot = ask({ forgotten: new Set([ID]), memory: memory("v:b", true) });
  const forget = settledEvents(forgot.doubt === undefined ? [] : [forgot.doubt], new Map([[ID, { forget: true }]]), forgot.book, "a", "t");
  assert.deepEqual([forget[0]?.payload["option"], forget[0]?.payload["sticky"], forget[0]?.payload["forget"]], ["v:a", false, true]);
  assert.deepEqual(settledOf(doubt === undefined ? [] : [doubt]).map((s) => [s.code, s.option, s.how]), [["PE1", "« Budget présenté »", "choisi"]]);
});

test("the board ignores a settled event: no fold change, no history line, no hidden birth", () => {
  const card = testCard({ id: "PE1@2026", columnId: "demandes", createdAt: "2026-01-01T00:00:00.000Z" });
  const before = { ...settled(1, ID, "v:b", true), cardId: card.id, ts: "2026-09-01T00:00:00.000Z" };
  const birth = { ...lifecycleEvent("imported", card.id, "import-csv", "2026-01-01T00:00:00.000Z"), toColumn: "etudes", id: "evt-2" } as CardEvent;
  const [state] = foldEvents([card], [before, birth]);
  assert.equal(state?.columnId, "etudes", "the creation is still read as the birth, whatever the earlier settled event");
  assert.deepEqual(cardHistory([before, birth], card.id, testConfig()).map((h) => h.kind), ["move"]);
});
