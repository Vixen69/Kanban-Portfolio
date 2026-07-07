// Fold coverage of the "edited" whitelist (EDITABLE_FIELDS, ADR 012): every
// v2 CardPatch field applies, and forged non-editable fields are ignored.
// Split from state.test.ts to respect the 300-line file / 40-line function
// caps enforced by scripts/check-conventions.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent, CardState } from "./types.ts";
import { foldEvents } from "./state.ts";
import { testCard } from "./test-helpers.ts";

function event(partial: Partial<CardEvent> & Pick<CardEvent, "id" | "ts" | "type" | "cardId">): CardEvent {
  return { actor: "test", fromColumn: null, toColumn: null, payload: {}, ...partial };
}

// Folds one edited event carrying the given patch over the default card.
function foldPatched(patch: Record<string, unknown>): CardState | undefined {
  return foldEvents(
    [testCard()],
    [event({ id: "evt-1", ts: "2026-03-02T00:00:00.000Z", type: "edited", cardId: "S001", payload: { patch } })],
  )[0];
}

test("edited applies every whitelisted v2 field", () => {
  const state = foldPatched({
    title: "Nouveau titre", owner: "Mme Nouvelle", domain: "beta",
    criticality: "top", typeId: "t2", codename: "PX9999999", nature: "complex",
    tags: ["a", "b"], effortEstimated: 120, effortConsumed: 45,
    budgetEstimated: 200, budgetConsumed: 80, loadPlan: "1,5 ETP",
    resources: ["Data", "Infra"], notes: "vu au Sync", custom: { risque: "haut" },
  });
  assert.equal(state?.title, "Nouveau titre");
  assert.equal(state?.owner, "Mme Nouvelle");
  assert.equal(state?.domain, "beta");
  assert.equal(state?.criticality, "top");
  assert.equal(state?.typeId, "t2");
  assert.equal(state?.codename, "PX9999999");
  assert.equal(state?.nature, "complex");
  assert.deepEqual(state?.tags, ["a", "b"]);
  assert.equal(state?.effortEstimated, 120);
  assert.equal(state?.effortConsumed, 45);
  assert.equal(state?.budgetEstimated, 200);
  assert.equal(state?.budgetConsumed, 80);
  assert.equal(state?.loadPlan, "1,5 ETP");
  assert.deepEqual(state?.resources, ["Data", "Infra"]);
  assert.equal(state?.notes, "vu au Sync");
  assert.deepEqual(state?.custom, { risque: "haut" });
});

test("edited applies the design-v10 fields (charge, contention, risks, constraints, alerts, dateRdr, budgets)", () => {
  const state = foldPatched({
    budgetEngaged: 150, budgetRdli: 220,
    chargeByProfile: [{ profileId: "pA", jh: 30, done: 10 }],
    contentionProfiles: ["pA", "pB"], contentionNote: "Lead partagé",
    risks: [{ type: "rSSG", desc: "Revue sécurité à planifier" }],
    projectConstraints: ["legale"], alerts: ["Décision COPROJ attendue"],
    dateRdr: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(state?.budgetEngaged, 150);
  assert.equal(state?.budgetRdli, 220);
  assert.deepEqual(state?.chargeByProfile, [{ profileId: "pA", jh: 30, done: 10 }]);
  assert.deepEqual(state?.contentionProfiles, ["pA", "pB"]);
  assert.equal(state?.contentionNote, "Lead partagé");
  assert.deepEqual(state?.risks, [{ type: "rSSG", desc: "Revue sécurité à planifier" }]);
  assert.deepEqual(state?.projectConstraints, ["legale"]);
  assert.deepEqual(state?.alerts, ["Décision COPROJ attendue"]);
  assert.equal(state?.dateRdr, "2026-09-01T00:00:00.000Z");
});

test("edited rejects malformed charge/risks/contention (kept at their defaults)", () => {
  const state = foldPatched({
    chargeByProfile: [{ profileId: "pA", jh: "lots", done: 0 }], // jh not a number
    risks: [{ type: "rSSG" }], // missing desc
    contentionProfiles: "pA", // not an array
  });
  assert.deepEqual(state?.chargeByProfile, []);
  assert.deepEqual(state?.risks, []);
  assert.deepEqual(state?.contentionProfiles, []);
});

test("edited ignores forged non-editable fields", () => {
  const state = foldPatched({
    title: "Nouveau titre", // one legitimate field, applied alongside
    id: "HACKED", columnId: "col3", laneId: "laneB", blocked: true,
    blockedSince: "1999-01-01T00:00:00.000Z", createdAt: "1999-01-01T00:00:00.000Z",
    source: "sciforma", sciformaId: "SCF-0000", dependencies: ["X"],
  });
  assert.equal(state?.title, "Nouveau titre");
  // Non-editable fields are untouched, whatever the payload claims.
  assert.equal(state?.id, "S001");
  assert.equal(state?.columnId, "col1");
  assert.equal(state?.laneId, "laneA");
  assert.equal(state?.blocked, false);
  assert.equal(state?.blockedSince, null);
  assert.equal(state?.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(state?.source, "fixtures");
  assert.equal(state?.sciformaId, null);
  assert.deepEqual(state?.dependencies, []);
});
