// ADR 061 — no default domain, ever: a card without domain (domain "") and
// a card whose domain is « à vérifier » read everywhere without being put
// under another domain — the issue, the names, the filters (« Sans
// domaine », « Domaine à vérifier »), the counts, the totals and the fold.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent, CardState } from "./types.ts";
import { domainIssue, domainName, NO_DOMAIN_NAME } from "./domain-check.ts";
import {
  cardMatches, defaultFilters, hiddenCardIds, isFilterActive, portfolioCounts, withDomainsSet, withFlagToggled,
} from "./filters.ts";
import { foldEvents } from "./state.ts";
import { totalsOf } from "./totals.ts";
import { computeCapacityReadout } from "./capacity-view.ts";
import { testCard, testConfig, testPerson } from "./test-helpers.ts";

const CONFIG = testConfig();
const NOW = new Date("2026-06-11T12:00:00.000Z");

function state(overrides: Parameters<typeof testCard>[0]): CardState {
  return { ...testCard(overrides), enteredColumnAt: NOW.toISOString(), comments: [], archived: false, decisions: [], absentFromLastImport: null };
}

const SOUND = state({ id: "S001", domain: "alpha", effortEstimated: 10, budgetEstimated: 5 });
const NONE = state({ id: "S002", domain: "", effortEstimated: 20, budgetEstimated: 7 });
const TO_CHECK = state({ id: "S003", domain: "beta", subDomain: "b1", domainUnresolved: true });
const CARDS = [SOUND, NONE, TO_CHECK];

test("domainIssue and domainName (table)", () => {
  const cases: Array<[string, CardState, ReturnType<typeof domainIssue>]> = [
    ["a sound domain", SOUND, null],
    ["no domain", NONE, "missing"],
    ["a domain to verify", TO_CHECK, "unresolved"],
    ["no domain wins over the flag", state({ domain: "", domainUnresolved: true }), "missing"],
  ];
  for (const [name, card, expected] of cases) assert.equal(domainIssue(card), expected, name);
  assert.deepEqual([domainName(CONFIG, ""), domainName(CONFIG, "alpha"), domainName(CONFIG, "ghost")], [NO_DOMAIN_NAME, "Alpha", "ghost"]);
});

test("the « Sans domaine » pill: on by default, it alone governs the cards without domain; tout/rien include it", () => {
  const filters = defaultFilters(CONFIG);
  assert.deepEqual([filters.noDomain, isFilterActive(filters), hiddenCardIds(CARDS, filters).size], [true, false, 0]);
  const off = withFlagToggled(filters, "noDomain");
  assert.deepEqual([...hiddenCardIds(CARDS, off)], ["S002"]);
  assert.equal(isFilterActive(off), true);
  const allDomainsOff = withDomainsSet(filters, false);
  assert.deepEqual([allDomainsOff.noDomain, hiddenCardIds(CARDS, allDomainsOff).size], [false, 3]);
  const onlyNone = { ...allDomainsOff, noDomain: true };
  assert.deepEqual([...CARDS.filter((card) => cardMatches(card, onlyNone))].map((c) => c.id), ["S002"], "an empty domain is never read as a domain key");
});

test("« Domaine à vérifier » keeps only the cards with a domain problem; the counts say how many", () => {
  const checking = withFlagToggled(defaultFilters(CONFIG), "domainCheckOnly");
  assert.deepEqual(CARDS.filter((card) => cardMatches(card, checking)).map((c) => c.id), ["S002", "S003"]);
  assert.equal(isFilterActive(checking), true);
  const counts = portfolioCounts(CARDS, CONFIG, NOW);
  assert.deepEqual([counts.noDomain, counts.domainCheck], [1, 2]);
});

test("totals count a card without domain like any other", () => {
  const totals = totalsOf(CARDS);
  assert.deepEqual([totals.count, totals.estimated], [3, 12 + (TO_CHECK.budgetEstimated ?? 0)]);
});

test("capacity: a card without domain consumes and weighs as « Sans domaine », never under another domain", () => {
  const snapshot = {
    exerciseYear: 2026,
    persons: [testPerson({ id: "p1", domain: "beta", capacityJh: 100 })],
    assignments: [{ personId: "p1", cardId: "S002", jh: 10, done: 0 }],
  };
  const readout = computeCapacityReadout(snapshot, CARDS, CONFIG, NOW);
  const beta = readout.transverse.find((row) => row.domainId === "beta");
  assert.deepEqual(beta?.consumers.map((c) => [c.name, c.jh]), [[NO_DOMAIN_NAME, 10]]);
  assert.deepEqual(readout.weighing[0]?.cards.map((c) => [c.cardId, c.domainName]), [["S002", NO_DOMAIN_NAME]]);
});

test("the fold: an edited domain clears « à vérifier »; an empty domain in a patch is ignored", () => {
  const base = { ...testCard({ id: "S003", domain: "beta" }), domainUnresolved: true };
  const edit = (id: string, patch: Record<string, unknown>): CardEvent => ({
    id, ts: "2026-06-10T00:00:00.000Z", actor: "anonymous", cardId: "S003", type: "edited", fromColumn: null, toColumn: null, payload: { patch },
  });
  assert.equal(foldEvents([base], [])[0]?.domainUnresolved, true);
  assert.equal(foldEvents([base], [edit("evt-1", { owner: "X" })])[0]?.domainUnresolved, true, "another field leaves it");
  const unassign = foldEvents([base], [edit("evt-1", { domain: "" })])[0];
  assert.deepEqual([unassign?.domain, unassign?.domainUnresolved], ["beta", true], "one never un-assigns");
  const confirmed = foldEvents([base], [edit("evt-1", { domain: "beta" })])[0];
  assert.deepEqual([confirmed?.domain, confirmed?.domainUnresolved], ["beta", undefined]);
});
