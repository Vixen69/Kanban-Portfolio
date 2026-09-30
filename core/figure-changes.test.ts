// The refreshed values compared card by card (ADR 055): chef de projet,
// the six figures as numbers with their delta, the RDR date, and the plan
// de charge with the ADR 048 reste-à-faire arithmetic and its métiers.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, Card } from "./types.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import { foldEvents } from "./state.ts";
import { cardPlanFigures, planChange, valueChanges } from "./figure-changes.ts";

// testConfig: métiers pA and pB.
const config: BoardConfig = testConfig();

function state(overrides: Partial<Card>) {
  const [card] = foldEvents([testCard({ id: "S1", title: "Alpha", ...overrides })], []);
  if (card === undefined) throw new Error("fold lost the card");
  return card;
}

const CASES: Array<{ name: string; before: Partial<Card>; after: Partial<Card>; expect: unknown[] }> = [
  { name: "nothing changed, nothing listed", before: { budgetEstimated: 10 }, after: { budgetEstimated: 10 }, expect: [] },
  { name: "float noise below the hundredth is no change", before: { budgetEstimated: 0.1 + 0.2 }, after: { budgetEstimated: 0.3 }, expect: [] },
  { name: "chef de projet", before: { owner: "Alice MERLE" }, after: { owner: "Bruno DIAZ" }, expect: [["owner", "Alice MERLE", "Bruno DIAZ"]] },
  {
    name: "a budget up, another down, in FIGURE_FACTS order",
    before: { budgetEstimated: 120, budgetRdli: 150 }, after: { budgetEstimated: 90.5, budgetRdli: 175 },
    expect: [
      ["figure", { fact: "budgetRdli", unit: "k€", before: 150, after: 175, delta: 25 }],
      ["figure", { fact: "budgetEstimated", unit: "k€", before: 120, after: 90.5, delta: -29.5 }],
    ],
  },
  {
    name: "a figure appearing or vanishing has no delta",
    before: { effortEstimated: null, effortConsumed: 12 }, after: { effortEstimated: 40, effortConsumed: null },
    expect: [
      ["figure", { fact: "effortEstimated", unit: "j.h", before: null, after: 40, delta: null }],
      ["figure", { fact: "effortConsumed", unit: "j.h", before: 12, after: null, delta: null }],
    ],
  },
  { name: "zero is a figure", before: { budgetConsumed: null }, after: { budgetConsumed: 0 }, expect: [["figure", { fact: "budgetConsumed", unit: "k€", before: null, after: 0, delta: null }]] },
  { name: "date RDR", before: { dateRdr: "2026-09-15" }, after: { dateRdr: "2026-12-15" }, expect: [["dateRdr", "2026-09-15", "2026-12-15"]] },
];

for (const c of CASES) {
  test(`valueChanges: ${c.name}`, () => {
    const changes = valueChanges(state(c.before), state(c.after), config);
    assert.deepEqual(changes.map((x) => (x.kind === "figure" ? [x.kind, x.figure] : [x.kind, x.from, x.to])), c.expect);
  });
}

test("cardPlanFigures: Σ planned, Σ done, RAF per métier clamped at 0 (ADR 048), no fallback on the effort", () => {
  const card = state({
    effortEstimated: 500,
    chargeByProfile: [{ profileId: "pA", jh: 40, done: 25 }, { profileId: "pB", jh: 10, done: 14 }, { profileId: "pA", jh: 5, done: 0 }],
  });
  assert.deepEqual(cardPlanFigures(card, config), { planned: 55, done: 39, raf: 20, breakdown: true }, "pA 45−25 = 20, pB clamped at 0");
  assert.deepEqual(cardPlanFigures(state({ effortEstimated: 500 }), config), { planned: 0, done: 0, raf: 0, breakdown: false }, "sans ventilation counts 0");
});

test("planChange: totals before / after and the métiers that moved, largest RAF move first", () => {
  const before = state({ chargeByProfile: [{ profileId: "pA", jh: 40, done: 25 }, { profileId: "pB", jh: 10, done: 0 }] });
  const after = state({ chargeByProfile: [{ profileId: "pA", jh: 40, done: 30 }, { profileId: "pB", jh: 30, done: 0 }] });
  assert.deepEqual(planChange(before, after, config), {
    before: { planned: 50, done: 25, raf: 25, breakdown: true },
    after: { planned: 70, done: 30, raf: 40, breakdown: true },
    profiles: [
      { profileId: "pB", before: { planned: 10, done: 0, raf: 10 }, after: { planned: 30, done: 0, raf: 30 } },
      { profileId: "pA", before: { planned: 40, done: 25, raf: 15 }, after: { planned: 40, done: 30, raf: 10 } },
    ],
  });
  assert.equal(planChange(before, before, config), null, "the same plan is no change");
});

test("planChange: a plan appearing on a card « sans ventilation », and a métier leaving the plan", () => {
  const blind = state({});
  const planned = state({ chargeByProfile: [{ profileId: "pA", jh: 12, done: 2 }] });
  const appeared = planChange(blind, planned, config);
  assert.deepEqual([appeared?.before, appeared?.after], [
    { planned: 0, done: 0, raf: 0, breakdown: false }, { planned: 12, done: 2, raf: 10, breakdown: true },
  ]);
  const left = planChange(planned, blind, config);
  assert.deepEqual(left?.profiles, [{ profileId: "pA", before: { planned: 12, done: 2, raf: 10 }, after: { planned: 0, done: 0, raf: 0 } }]);
});
