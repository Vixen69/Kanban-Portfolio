// Unit tests for the card-detail derivations (front/detailModel.ts): the
// budget cross-graph, the projected RDR date state, and the plan-de-charge
// rows. These are React-free pure functions computing the financial figures
// (k€) the PMO reads, with boundary logic (date pivots, null fallbacks, RAF
// clamp) that no other test exercises. node:test only — no Vitest, no DOM.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Card, CardState } from "../core/types.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { budgetModel, colLabel, profileRows, rdrModel } from "./detailModel.ts";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-06-01T00:00:00.000Z");

// A folded CardState from the shared Card factory (detailModel reads only
// Card fields, but its signatures take CardState).
function state(overrides: Partial<Card> = {}): CardState {
  return { ...testCard(overrides), enteredColumnAt: "2026-01-01T00:00:00.000Z", comments: [], archived: false };
}

// A dateRdr `days` from NOW, as an ISO string (what a card stores).
function rdrAt(days: number): string {
  return new Date(NOW + days * DAY_MS).toISOString();
}

test("colLabel resolves a column name, falling back to the id", () => {
  const config = testConfig();
  assert.equal(colLabel(config, "col2"), "Colonne 2");
  assert.equal(colLabel(config, "ghost"), "ghost");
});

test("rdrModel: no or unparseable date is « non planifiée »", () => {
  assert.deepEqual(rdrModel(state({ dateRdr: null }), NOW), { state: "", formatted: "—", sub: "non planifiée" });
  assert.deepEqual(rdrModel(state({ dateRdr: "pas-une-date" }), NOW), {
    state: "",
    formatted: "—",
    sub: "non planifiée",
  });
});

test("rdrModel: state pivots at 0 and 30 days ahead, and turns 'past' when overdue", () => {
  assert.equal(rdrModel(state({ dateRdr: rdrAt(0) }), NOW).state, "soon");
  assert.equal(rdrModel(state({ dateRdr: rdrAt(30) }), NOW).state, "soon");
  assert.equal(rdrModel(state({ dateRdr: rdrAt(31) }), NOW).state, "");
  const past = rdrModel(state({ dateRdr: rdrAt(-5) }), NOW);
  assert.equal(past.state, "past");
  assert.equal(past.sub, "échue depuis 5 j");
  assert.notEqual(past.formatted, "—");
});

test("budgetModel: all-null card yields zeroed bars with a non-zero bMax floor", () => {
  const { rows, bMax, bRdli, bReal } = budgetModel(state());
  assert.deepEqual(rows.map((row) => row.key), ["rdli", "est", "eng", "real"]);
  assert.equal(rows[0]?.ref, true); // the RDLI envelope marker
  assert.equal(bRdli, 0);
  assert.equal(bReal, 0);
  assert.equal(bMax, 1.04); // max(…, 1) * 1.04 — bars never divide by zero
});

test("budgetModel: null RDLI and engagé derive from the estimate", () => {
  const { rows, bRdli } = budgetModel(state({ budgetEstimated: 100 }));
  assert.equal(bRdli, 105); // round(100 * 1.05)
  assert.equal(rows.find((row) => row.key === "eng")?.val, 50); // round(0 + (100 - 0) * 0.5)
});

test("budgetModel: réalisé bar flips to danger only once it exceeds the RDLI envelope", () => {
  const under = budgetModel(state({ budgetEstimated: 100, budgetRdli: 105, budgetConsumed: 100 }));
  assert.equal(under.rows.find((row) => row.key === "real")?.color, "var(--ok)");
  const over = budgetModel(state({ budgetEstimated: 100, budgetRdli: 105, budgetConsumed: 120 }));
  assert.equal(over.rows.find((row) => row.key === "real")?.color, "var(--danger)");
});

test("budgetModel: explicit envelope and engagé values pass through untouched", () => {
  const { rows } = budgetModel(state({ budgetRdli: 200, budgetEngaged: 150 }));
  assert.equal(rows.find((row) => row.key === "rdli")?.val, 200);
  assert.equal(rows.find((row) => row.key === "eng")?.val, 150);
});

test("profileRows: empty plan yields no rows and safe aggregates", () => {
  assert.deepEqual(profileRows(state(), testConfig()), { rows: [], max: 1, total: 0, done: 0 });
});

test("profileRows: sorts by descending j.h, clamps RAF at 0, aggregates totals", () => {
  const card = state({
    chargeByProfile: [
      { profileId: "pA", jh: 10, done: 3 },
      { profileId: "pB", jh: 20, done: 25 }, // done > jh → RAF must not go negative
    ],
  });
  const { rows, max, total, done } = profileRows(card, testConfig());
  assert.deepEqual(rows.map((row) => row.profileId), ["pB", "pA"]); // 20 before 10
  assert.equal(rows[0]?.name, "Profil B");
  assert.equal(rows[0]?.raf, 0); // clamped, not -5
  assert.equal(rows[1]?.raf, 7);
  assert.equal(max, 20);
  assert.equal(total, 30);
  assert.equal(done, 28);
});

test("profileRows: an unknown profile falls back to its id and a default color", () => {
  const card = state({ chargeByProfile: [{ profileId: "pGhost", jh: 5, done: 0 }] });
  const { rows } = profileRows(card, testConfig());
  assert.equal(rows[0]?.name, "pGhost");
  assert.equal(rows[0]?.color, "#64748b");
});
