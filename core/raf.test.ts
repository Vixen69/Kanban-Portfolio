// The reste à faire split by column class and the per-métier lens rows
// (ADR 048), and the additivity they rest on: the gutter is the sum of the
// column headers, whatever the partition.

import { test } from "node:test";
import assert from "node:assert/strict";
import { columnClasses } from "./column-class.ts";
import { lensRows, rafSplit } from "./raf.ts";
import { countedIds } from "./raf-card.ts";
import { foldEvents } from "./state.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import { columnTotals, rafRows, scopedRaf, sumTotals, totalsOf } from "./totals.ts";
import type { Card, CardState } from "./types.ts";

function testState(overrides: Partial<Card>): CardState {
  return foldEvents([testCard(overrides)], [])[0]!;
}

const CONFIG = testConfig(); // col1 idle, col2 idle, col3 engaged
const ALL = countedIds(null, CONFIG);
const CARDS = [
  testState({ id: "a", columnId: "col1", budgetEstimated: 10, chargeByProfile: [{ profileId: "pA", jh: 10, done: 4 }, { profileId: "pB", jh: 2, done: 5 }] }),
  testState({ id: "b", columnId: "col3", budgetEstimated: 20, chargeByProfile: [{ profileId: "pA", jh: 30, done: 0 }, { profileId: "pB", jh: 8, done: 1 }] }),
  testState({ id: "c", columnId: "col3", chargeByProfile: [{ profileId: "pB", jh: 1, done: 3 }] }),
  testState({ id: "d", columnId: "col2", chargeByProfile: [], effortEstimated: 90, effortConsumed: 0 }),
  testState({ id: "e", columnId: "col3", chargeByProfile: [] }),
];

test("totals: the reste à faire is clamped per card, so the parts add up exactly to the whole", () => {
  const whole = totalsOf(CARDS);
  const parts = Object.values(columnTotals(CARDS, new Set(), CONFIG));
  assert.deepEqual(sumTotals(parts), whole);
  assert.equal(scopedRaf(whole, ALL), 6 + 30 + 7, "b's pB 7; a's and c's over-consumed pB count 0, never −3 −2");
  assert.equal(whole.blind, 2);
  assert.equal(scopedRaf(whole, new Set(["pB"])), 7);
});

test("rafRows: the counted métiers with a reste à faire, largest first", () => {
  const whole = totalsOf(CARDS);
  assert.deepEqual(rafRows(whole, CONFIG, ALL).map((row) => [row.id, row.remaining]), [["pA", 36], ["pB", 7]]);
  assert.deepEqual(rafRows(whole, CONFIG, new Set(["pB"])).map((row) => row.id), ["pB"]);
  assert.deepEqual(rafRows(totalsOf([CARDS[2]!]), CONFIG, ALL), [], "nothing left: no row");
});

test("rafSplit: engaged, non engaged and out-of-count columns, the blind cards located", () => {
  const byColumn = columnTotals(CARDS, new Set(), CONFIG);
  const classes = { ...columnClasses(CONFIG), col2: "excluded" as const };
  assert.deepEqual(rafSplit(byColumn, classes, ALL), { engaged: 37, idle: 6, excluded: 0, blindEngaged: 1, blindOther: 1 });
  assert.deepEqual(rafSplit(byColumn, classes, new Set()), { engaged: 0, idle: 0, excluded: 0, blindEngaged: 1, blindOther: 1 });
  const hidden = new Set(["b"]);
  assert.equal(rafSplit(columnTotals(CARDS, hidden, CONFIG), classes, ALL).engaged, 0, "hidden cards count nowhere");
});

test("lensRows: every métier of the config, largest engaged first, the order independent of the counted métiers", () => {
  const byColumn = columnTotals(CARDS, new Set(), CONFIG);
  const rows = lensRows(byColumn, columnClasses(CONFIG), CONFIG);
  assert.deepEqual(rows.map((row) => [row.profile.id, row.engaged, row.idle]), [["pA", 30, 6], ["pB", 7, 0]]);
  const empty = lensRows(columnTotals([], new Set(), CONFIG), columnClasses(CONFIG), CONFIG);
  assert.deepEqual(empty.map((row) => row.profile.id), ["pA", "pB"], "a métier with nothing still shows, by name");
});
