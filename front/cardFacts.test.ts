// The typed card facts shared by « Modifier » and « Plus d'informations »
// (front/cardFacts.ts, ADR 057): text ↔ card fields, the day-only RDR date,
// null for an emptied amount, and only typed facts sent at creation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { testCard } from "../core/test-helpers.ts";
import { creationFactsOf, effortDraftOf, effortPatchOf, EMPTY_FACTS } from "./cardFacts.ts";

test("effortDraftOf then effortPatchOf gives the card's values back", () => {
  const card = testCard({
    effortEstimated: 36.5, effortConsumed: 0, budgetEstimated: 75, budgetConsumed: null,
    budgetRdli: 90, budgetEngaged: null, dateRdr: "2026-12-15", loadPlan: "1,5 ETP", resources: ["MOE SI", "Archi"],
  });
  assert.deepEqual(effortPatchOf(effortDraftOf(card)), {
    effortEstimated: 36.5, effortConsumed: 0, budgetEstimated: 75, budgetConsumed: null,
    budgetRdli: 90, budgetEngaged: null, dateRdr: "2026-12-15", loadPlan: "1,5 ETP", resources: ["MOE SI", "Archi"],
  });
});

test("an older full-timestamp RDR is edited and re-sent as its day", () => {
  const draft = effortDraftOf(testCard({ dateRdr: "2026-12-15T00:00:00.000Z" }));
  assert.equal(draft.dateRdr, "2026-12-15");
  assert.equal(effortPatchOf(draft).dateRdr, "2026-12-15");
});

test("effortPatchOf: emptied amounts are null, a comma reads as a decimal", () => {
  const patch = effortPatchOf({ ...EMPTY_FACTS, effortEstimated: "12,5", budgetEstimated: "", budgetRdli: "-3" });
  assert.equal(patch.effortEstimated, 12.5);
  assert.equal(patch.budgetEstimated, null);
  assert.equal(patch.budgetRdli, null); // a negative amount is not a figure
  assert.equal(patch.dateRdr, null);
  assert.equal(patch.loadPlan, null);
  assert.deepEqual(patch.resources, []);
});

test("creationFactsOf sends only what was typed", () => {
  assert.deepEqual(creationFactsOf(EMPTY_FACTS), {});
  assert.deepEqual(
    creationFactsOf({ ...EMPTY_FACTS, codename: "  PE10001 ", subDomain: "b1", effortEstimated: "85", budgetConsumed: "0", dateRdr: "2026-12-15", resourcesCsv: "MOE SI, " }),
    { codename: "PE10001", subDomain: "b1", effortEstimated: 85, budgetConsumed: 0, dateRdr: "2026-12-15", resources: ["MOE SI"] },
  );
});
