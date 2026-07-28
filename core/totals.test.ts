import { test } from "node:test";
import assert from "node:assert/strict";
import {
  columnTotals,
  emptyTotals,
  laneTotals,
  profileLoadRows,
  remainingLoad,
  totalsOf,
} from "./totals.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import type { CardState } from "./types.ts";

const CONFIG = testConfig();
const NO_DIM: ReadonlySet<string> = new Set<string>();

function state(overrides: Parameters<typeof testCard>[0] = {}): CardState {
  return {
    ...testCard(overrides),
    enteredColumnAt: "2026-06-01T00:00:00.000Z",
    comments: [],
    archived: false,
  };
}

// Every money field gets a DISTINCT value: a field read from the wrong
// property would still sum to something, so only distinct values make a
// mis-mapping fail loudly (the mockup's names differ from the repo's).
const RICH = state({
  id: "S001",
  laneId: "laneA",
  columnId: "col1",
  budgetRdli: 1000,
  budgetEstimated: 800,
  budgetEngaged: 600,
  budgetConsumed: 400,
  chargeByProfile: [
    { profileId: "pA", jh: 100, done: 30 },
    { profileId: "pB", jh: 50, done: 20 },
  ],
});

// No per-profile plan: falls back to the card-level effort, unattributed.
const FALLBACK = state({
  id: "S002",
  laneId: "laneA",
  columnId: "col2",
  budgetRdli: 7,
  budgetEstimated: 5,
  budgetEngaged: 3,
  budgetConsumed: 1,
  effortEstimated: 40,
  effortConsumed: 15,
  chargeByProfile: [],
});

// Everything null / empty: must contribute zeros, never NaN.
const EMPTY = state({ id: "S003", laneId: "laneB", columnId: "col1" });

test("emptyTotals is the neutral element", () => {
  const totals = emptyTotals();
  assert.deepEqual(totals, {
    count: 0,
    rdli: 0,
    estimated: 0,
    engaged: 0,
    consumed: 0,
    jh: 0,
    done: 0,
    byProfile: {},
  });
  assert.equal(remainingLoad(totals), 0);
});

test("totalsOf sums each money field from its own property", () => {
  const totals = totalsOf([RICH, FALLBACK]);
  assert.equal(totals.count, 2);
  assert.equal(totals.rdli, 1007);
  assert.equal(totals.estimated, 805);
  assert.equal(totals.engaged, 603);
  assert.equal(totals.consumed, 401);
});

test("a per-profile plan drives the load and its split", () => {
  const totals = totalsOf([RICH]);
  assert.equal(totals.jh, 150);
  assert.equal(totals.done, 50);
  assert.deepEqual(totals.byProfile, {
    pA: { jh: 100, done: 30 },
    pB: { jh: 50, done: 20 },
  });
  assert.equal(remainingLoad(totals), 100);
});

test("without a per-profile plan the card-level effort is used, unattributed", () => {
  const totals = totalsOf([FALLBACK]);
  assert.equal(totals.jh, 40);
  assert.equal(totals.done, 15);
  assert.deepEqual(totals.byProfile, {});
  assert.equal(remainingLoad(totals), 25);
});

test("null money and empty plans contribute zeros, never NaN", () => {
  const totals = totalsOf([EMPTY]);
  assert.equal(totals.count, 1);
  for (const value of [totals.rdli, totals.estimated, totals.engaged, totals.consumed, totals.jh, totals.done]) {
    assert.equal(value, 0);
    assert.equal(Number.isNaN(value), false);
  }
});

test("remainingLoad clamps an over-consumed plan at zero", () => {
  const over = totalsOf([state({ chargeByProfile: [{ profileId: "pA", jh: 10, done: 25 }] })]);
  assert.equal(over.jh - over.done, -15);
  assert.equal(remainingLoad(over), 0);
});

test("columnTotals groups by folded column and seeds every configured column", () => {
  const totals = columnTotals([RICH, FALLBACK, EMPTY], NO_DIM, CONFIG);
  assert.deepEqual(Object.keys(totals).sort(), ["col1", "col2", "col3"]);
  assert.equal(totals.col1?.count, 2);
  assert.equal(totals.col1?.rdli, 1000);
  assert.equal(totals.col2?.count, 1);
  assert.equal(totals.col2?.rdli, 7);
  // A column with nothing visible still renders zeros rather than vanishing.
  assert.equal(totals.col3?.count, 0);
  assert.equal(totals.col3?.jh, 0);
});

test("laneTotals groups by folded lane", () => {
  const totals = laneTotals([RICH, FALLBACK, EMPTY], NO_DIM, CONFIG);
  assert.deepEqual(Object.keys(totals).sort(), ["laneA", "laneB"]);
  assert.equal(totals.laneA?.count, 2);
  assert.equal(totals.laneA?.jh, 190);
  assert.equal(totals.laneB?.count, 1);
  assert.equal(totals.laneB?.jh, 0);
});

test("dimmed cards are excluded from both groupings", () => {
  const dimmed = new Set(["S001"]);
  const byColumn = columnTotals([RICH, FALLBACK, EMPTY], dimmed, CONFIG);
  assert.equal(byColumn.col1?.count, 1);
  assert.equal(byColumn.col1?.rdli, 0);
  const byLane = laneTotals([RICH, FALLBACK, EMPTY], dimmed, CONFIG);
  assert.equal(byLane.laneA?.count, 1);
  assert.equal(byLane.laneA?.jh, 40);
});

test("cards in a column or lane unknown to the config are ignored", () => {
  const stray = state({ id: "S404", columnId: "ghost", laneId: "nowhere", budgetRdli: 999 });
  const byColumn = columnTotals([stray], NO_DIM, CONFIG);
  assert.equal(Object.values(byColumn).every((group) => group.count === 0), true);
  const byLane = laneTotals([stray], NO_DIM, CONFIG);
  assert.equal(Object.values(byLane).every((group) => group.count === 0), true);
});

test("profileLoadRows resolves the config and orders by decreasing charge", () => {
  const rows = profileLoadRows(totalsOf([RICH]), CONFIG);
  assert.deepEqual(
    rows.map((row) => [row.id, row.name, row.color, row.jh, row.done, row.remaining]),
    [
      ["pA", "Profil A", "#0d9488", 100, 30, 70],
      ["pB", "Profil B", "#4338ca", 50, 20, 30],
    ],
  );
});

test("profileLoadRows drops profiles with no charge", () => {
  const totals = totalsOf([state({ chargeByProfile: [{ profileId: "pA", jh: 0, done: 0 }] })]);
  assert.deepEqual(profileLoadRows(totals, CONFIG), []);
});

test("an unknown profile id keeps its id and degrades to a neutral color", () => {
  const totals = totalsOf([state({ chargeByProfile: [{ profileId: "pGhost", jh: 12, done: 4 }] })]);
  const rows = profileLoadRows(totals, CONFIG);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.name, "pGhost");
  assert.equal(rows[0]?.color, "#64748b");
  assert.equal(rows[0]?.remaining, 8);
});
