// Sorting the board's cards (ADR 044): a view, stable, the cards without a
// figure last in both directions; the per-métier breakdown and totals.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardSort } from "./card-sort.ts";
import {
  BOARD_ORDER, cardLoad, isSortActive, profileRemaining, profileRemainingTotals, sortCards, sortValue, topProfiles,
  withoutBreakdown,
} from "./card-sort.ts";
import type { Card, CardState } from "./types.ts";
import { foldEvents } from "./state.ts";
import { testCard, testConfig } from "./test-helpers.ts";

// A folded card without any event: the state the board sorts.
function testState(overrides: Partial<Card>): CardState {
  return foldEvents([testCard(overrides)], [])[0]!;
}

const A = testState({
  id: "A", budgetEstimated: 400,
  chargeByProfile: [{ profileId: "expert", jh: 100, done: 40 }, { profileId: "cdp", jh: 50, done: 5 }, { profileId: "archi", jh: 20, done: 0 }, { profileId: "dev", jh: 30, done: 20 }],
});
const B = testState({ id: "B", budgetEstimated: 650, chargeByProfile: [{ profileId: "dev", jh: 200, done: 60 }, { profileId: "expert", jh: 40, done: 0 }] });
const C = testState({ id: "C", budgetEstimated: null, chargeByProfile: [], effortEstimated: 80, effortConsumed: 30 });
const D = testState({ id: "D", budgetEstimated: 90, chargeByProfile: [{ profileId: "expert", jh: 10, done: 25 }] });
const E = testState({ id: "E", budgetEstimated: null, chargeByProfile: [], effortEstimated: null, effortConsumed: null });
const CARDS = [A, B, C, D, E];

const by = (key: CardSort["key"], direction: CardSort["direction"], profileIds: string[] = []): CardSort => ({ key, direction, profileIds });
const ids = (cards: { id: string }[]) => cards.map((card) => card.id).join("");

test("isSortActive: the board's order and a métier sort without métier reorder nothing", () => {
  assert.equal(isSortActive(BOARD_ORDER), false);
  assert.equal(isSortActive(by("profiles", "desc")), false);
  assert.equal(isSortActive(by("profiles", "desc", ["expert"])), true);
  assert.equal(isSortActive(by("remaining", "asc")), true);
  assert.equal(ids(sortCards(CARDS, BOARD_ORDER)), "ABCDE");
  assert.equal(ids(sortCards(CARDS, by("profiles", "asc"))), "ABCDE");
});

test("cardLoad / profileRemaining: the per-profile plan first, the card-level effort otherwise, clamped at 0", () => {
  assert.deepEqual(cardLoad(A), { jh: 200, done: 65, raf: 135 });
  assert.deepEqual(cardLoad(C), { jh: 80, done: 30, raf: 50 }, "no plan: the card-level effort");
  assert.deepEqual(cardLoad(D), { jh: 10, done: 25, raf: 0 }, "over-consumed never reads negative");
  assert.equal(profileRemaining(A, "expert"), 60);
  assert.equal(profileRemaining(D, "expert"), 0);
  assert.equal(profileRemaining(A, "ghost"), 0);
});

test("sortCards by reste à faire and by meilleur estimé: both directions, the cards without a figure last", () => {
  assert.equal(ids(sortCards(CARDS, by("remaining", "desc"))), "BACDE", "B 180, A 135, C 50 — D (0) and E (none) last, board order");
  assert.equal(ids(sortCards(CARDS, by("remaining", "asc"))), "CABDE", "ascending never puts the empty cards on top");
  assert.equal(ids(sortCards(CARDS, by("estimate", "desc"))), "BADCE");
  assert.equal(ids(sortCards(CARDS, by("estimate", "asc"))), "DABCE");
  assert.equal(sortValue(C, by("estimate", "desc")), 0, "a null estimate is no figure");
});

test("sortCards by métier: the summed reste à faire of the chosen métiers, stable on ties", () => {
  assert.equal(sortValue(A, by("profiles", "desc", ["expert", "cdp"])), 105);
  assert.equal(ids(sortCards(CARDS, by("profiles", "desc", ["expert", "cdp"]))), "ABCDE", "A 105, B 40; C, D, E nothing");
  assert.equal(ids(sortCards(CARDS, by("profiles", "asc", ["expert"]))), "BACDE", "B 40, A 60");
  assert.equal(ids(sortCards([B, A], by("profiles", "desc", ["archi", "dev"]))), "BA", "B 140 before A 30");
  const tie = testState({ id: "T", chargeByProfile: [{ profileId: "expert", jh: 60, done: 0 }] });
  assert.equal(ids(sortCards([tie, A], by("profiles", "desc", ["expert"]))), "TA", "equal figures keep the board order");
  assert.equal(ids(sortCards([A, tie], by("profiles", "desc", ["expert"]))), "AT");
});

test("topProfiles: the largest restes à faire, the chosen métiers first, capped, the count of the rest said", () => {
  const plain = topProfiles(A, BOARD_ORDER);
  assert.deepEqual(plain.lines.map((line) => [line.profileId, line.raf, line.chosen]), [["expert", 60, false], ["cdp", 45, false], ["archi", 20, false]]);
  assert.deepEqual([plain.hasPlan, plain.total], [true, 4]);
  const sorted = topProfiles(A, by("profiles", "desc", ["dev"]));
  assert.deepEqual(sorted.lines.map((line) => [line.profileId, line.chosen]), [["dev", true], ["expert", false], ["cdp", false]]);
  assert.deepEqual(topProfiles(C, BOARD_ORDER), { hasPlan: false, lines: [], total: 0 }, "sans ventilation");
  assert.deepEqual(topProfiles(D, BOARD_ORDER), { hasPlan: true, lines: [], total: 0 }, "a plan, nothing left to do");
  assert.equal(topProfiles(A, by("remaining", "desc", ["dev"])).lines[0]?.profileId, "expert", "métiers only count in a métier sort");
});

test("profileRemainingTotals / withoutBreakdown: the config's métiers with a reste à faire, largest first", () => {
  const config = { ...testConfig(), profiles: [
    { id: "cdp", name: "CdP", color: "#111" }, { id: "expert", name: "Expert", color: "#222" },
    { id: "dev", name: "Dév.", color: "#333" }, { id: "pmo", name: "PMO", color: "#444" },
  ] };
  const totals = profileRemainingTotals(CARDS, config);
  assert.deepEqual(totals.map((entry) => [entry.profile.id, entry.raf]), [["dev", 150], ["expert", 100], ["cdp", 45]], "archi is not in this config, pmo has nothing");
  assert.equal(withoutBreakdown(CARDS), 2);
});
