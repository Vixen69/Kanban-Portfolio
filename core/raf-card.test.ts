// The reste à faire of one card, per métier (ADR 048): clamped per card and
// per métier, rounded, never the card-level effort.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cardRaf, countedIds, hasBreakdown, profileRemaining, scopeFirst } from "./raf-card.ts";
import { foldEvents } from "./state.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import type { Card, CardState } from "./types.ts";

function testState(overrides: Partial<Card>): CardState {
  return foldEvents([testCard(overrides)], [])[0]!;
}

const CONFIG = testConfig();
const CARD = testState({
  id: "R", effortEstimated: 500, effortConsumed: 0,
  chargeByProfile: [
    { profileId: "pA", jh: 10, done: 2 }, { profileId: "pA", jh: 5, done: 1 },
    { profileId: "pB", jh: 3, done: 9 }, { profileId: "ghost", jh: 40, done: 0 },
  ],
});

test("profileRemaining: the métier's entries summed, then clamped at 0, rounded to the hundredth", () => {
  assert.equal(profileRemaining(CARD, "pA"), 12);
  assert.equal(profileRemaining(CARD, "pB"), 0, "over-consumed never reads negative");
  assert.equal(profileRemaining(CARD, "none"), 0);
  const tenths = testState({ id: "T", chargeByProfile: [{ profileId: "pA", jh: 0.3, done: 0.1 }] });
  assert.equal(profileRemaining(tenths, "pA"), 0.2);
});

test("countedIds: every métier of the config by default, else the scope's known métiers only", () => {
  assert.deepEqual([...countedIds(null, CONFIG)], ["pA", "pB"]);
  assert.deepEqual([...countedIds(new Set(["pB", "ghost"]), CONFIG)], ["pB"]);
  assert.deepEqual([...countedIds(new Set(), CONFIG)], []);
});

test("cardRaf: one métier over-consumed does not eat another's, the card-level effort never counts", () => {
  assert.equal(cardRaf(CARD, countedIds(null, CONFIG)), 12, "pA 12 + pB 0; the unknown métier is not counted");
  assert.equal(cardRaf(CARD, new Set(["pB"])), 0);
  const blind = testState({ id: "B", chargeByProfile: [], effortEstimated: 80, effortConsumed: 10 });
  assert.equal(cardRaf(blind, countedIds(null, CONFIG)), 0);
  assert.equal(hasBreakdown(blind), false);
  assert.equal(hasBreakdown(CARD), true);
});

test("scopeFirst: the cards with a reste à faire on the counted métiers first, both sides stable", () => {
  const a = testState({ id: "a", chargeByProfile: [{ profileId: "pB", jh: 5, done: 0 }] });
  const b = testState({ id: "b", chargeByProfile: [{ profileId: "pA", jh: 5, done: 0 }] });
  const c = testState({ id: "c", chargeByProfile: [] });
  const d = testState({ id: "d", chargeByProfile: [{ profileId: "pA", jh: 2, done: 9 }, { profileId: "pB", jh: 1, done: 0 }] });
  const e = testState({ id: "e", chargeByProfile: [{ profileId: "pA", jh: 3, done: 1 }] });
  const order = (cards: CardState[]) => cards.map((card) => card.id).join("");
  assert.equal(order(scopeFirst([a, b, c, d, e], new Set(["pA"]))), "beacd", "d's pA is over-consumed: out of scope");
  assert.equal(order(scopeFirst([a, b, c, d, e], new Set(["pA", "pB"]))), "abdec");
  assert.equal(order(scopeFirst([a, b, c, d, e], new Set())), "abcde", "no métier counted: order untouched");
});
