// Sorting the board's cards (ADR 044, three keys since ADR 048): a view,
// stable, the cards without a figure last in both directions; the
// « reste à faire » counts the lens's métiers; the per-métier breakdown.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardSort } from "./card-sort.ts";
import { BOARD_ORDER, isSortActive, sortCards, sortValue, topProfiles } from "./card-sort.ts";
import type { Card, CardState } from "./types.ts";
import { foldEvents } from "./state.ts";
import { testCard } from "./test-helpers.ts";

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
const ALL: ReadonlySet<string> = new Set(["expert", "cdp", "archi", "dev"]);

const by = (key: CardSort["key"], direction: CardSort["direction"]): CardSort => ({ key, direction });
const ids = (cards: { id: string }[]) => cards.map((card) => card.id).join("");

test("isSortActive: only the board's order reorders nothing", () => {
  assert.equal(isSortActive(BOARD_ORDER), false);
  assert.equal(isSortActive(by("remaining", "asc")), true);
  assert.equal(isSortActive(by("estimate", "desc")), true);
  assert.equal(ids(sortCards(CARDS, BOARD_ORDER, ALL)), "ABCDE");
});

test("sortValue « reste à faire »: the per-métier plan only, clamped per métier, never the card-level effort (ADR 048)", () => {
  assert.equal(sortValue(A, by("remaining", "desc"), ALL), 135);
  assert.equal(sortValue(C, by("remaining", "desc"), ALL), 0, "sans ventilation: no figure, whatever its effort");
  assert.equal(sortValue(D, by("remaining", "desc"), ALL), 0, "over-consumed never reads negative");
  const mixed = testState({ id: "M", chargeByProfile: [{ profileId: "dev", jh: 10, done: 30 }, { profileId: "cdp", jh: 20, done: 5 }] });
  assert.equal(sortValue(mixed, by("remaining", "desc"), ALL), 15, "one métier over-consumed does not eat another's reste à faire");
  assert.equal(sortValue(A, by("remaining", "desc"), new Set(["expert", "dev"])), 70, "the counted métiers only");
  assert.equal(sortValue(A, BOARD_ORDER, ALL), 0);
});

test("sortCards by reste à faire and by meilleur estimé: both directions, the cards without a figure last", () => {
  assert.equal(ids(sortCards(CARDS, by("remaining", "desc"), ALL)), "BACDE", "B 180, A 135 — C, D, E without a figure last, board order");
  assert.equal(ids(sortCards(CARDS, by("remaining", "asc"), ALL)), "ABCDE", "ascending never puts the empty cards on top");
  assert.equal(ids(sortCards(CARDS, by("estimate", "desc"), ALL)), "BADCE");
  assert.equal(ids(sortCards(CARDS, by("estimate", "asc"), ALL)), "DABCE");
  assert.equal(sortValue(C, by("estimate", "desc"), ALL), 0, "a null estimate is no figure");
});

test("sortCards by reste à faire on the lens's métiers — the former « par métier » sort — stable on ties", () => {
  assert.equal(ids(sortCards(CARDS, by("remaining", "desc"), new Set(["expert", "cdp"]))), "ABCDE", "A 105, B 40; C, D, E nothing");
  assert.equal(ids(sortCards(CARDS, by("remaining", "asc"), new Set(["expert"]))), "BACDE", "B 40, A 60");
  assert.equal(ids(sortCards([B, A], by("remaining", "desc"), new Set(["archi", "dev"]))), "BA", "B 140 before A 30");
  const tie = testState({ id: "T", chargeByProfile: [{ profileId: "expert", jh: 60, done: 0 }] });
  assert.equal(ids(sortCards([tie, A], by("remaining", "desc"), new Set(["expert"]))), "TA", "equal figures keep the board order");
  assert.equal(ids(sortCards([A, tie], by("remaining", "desc"), new Set(["expert"]))), "AT");
  assert.equal(ids(sortCards(CARDS, by("remaining", "desc"), new Set())), "ABCDE", "no métier counted: nothing is reordered");
});

test("topProfiles: the largest restes à faire, the lens's métiers first and the others marked out, capped", () => {
  const plain = topProfiles(A, null);
  assert.deepEqual(plain.lines.map((line) => [line.profileId, line.raf, line.chosen, line.out]),
    [["expert", 60, false, false], ["cdp", 45, false, false], ["archi", 20, false, false]]);
  assert.deepEqual([plain.hasPlan, plain.total], [true, 4]);
  const lensed = topProfiles(A, new Set(["dev"]));
  assert.deepEqual(lensed.lines.map((line) => [line.profileId, line.chosen, line.out]), [["dev", true, false], ["expert", false, true], ["cdp", false, true]]);
  assert.deepEqual(topProfiles(C, null), { hasPlan: false, lines: [], total: 0 }, "sans ventilation");
  assert.deepEqual(topProfiles(D, null), { hasPlan: true, lines: [], total: 0 }, "a plan, nothing left to do");
});
