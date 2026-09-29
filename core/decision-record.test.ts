// A "decided" event read back with every block of the fiche « Décision et
// Raison » (ADR 052) — and a hostile payload read as empty, never thrown.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardEvent } from "./types.ts";
import { readDecision } from "./decision-record.ts";

function decided(payload: Record<string, unknown>): CardEvent {
  return { id: "evt-1", ts: "2026-10-01T09:00:00.000Z", actor: "anonymous", cardId: "S1", type: "decided", fromColumn: null, toColumn: null, payload };
}

test("readDecision: the whole fiche comes back", () => {
  const decision = readDecision(decided({
    decisionId: "D5", grounds: [], reason: "Le périmètre a doublé.", reviewDate: null,
    instance: "revue", options: "Garder en Projets : la charge d'architecture ne suit pas.",
    frees: { people: "", budget: "", capacity: "Archi : 40 j.h" }, liftCondition: "",
    pauseKind: null, natureChange: "Devenu un produit à trois équipes.", fromLaneId: "projets",
    toLaneId: "projets_complexes", architectValidated: true, decidedOn: "2026-10-01",
  }));
  assert.deepEqual(decision, {
    actor: "anonymous", ts: "2026-10-01T09:00:00.000Z", decisionId: "D5", grounds: [],
    reason: "Le périmètre a doublé.", reviewDate: null, instance: "revue",
    options: "Garder en Projets : la charge d'architecture ne suit pas.",
    frees: { people: "", budget: "", capacity: "Archi : 40 j.h" }, liftCondition: "", pauseKind: null,
    natureChange: "Devenu un produit à trois équipes.", fromLaneId: "projets", toLaneId: "projets_complexes",
    architectValidated: true, decidedOn: "2026-10-01",
  });
});

test("readDecision: no id is no decision; mistyped fields read as empty", () => {
  assert.equal(readDecision(decided({ reason: "sans id" })), null);
  const decision = readDecision(decided({
    decisionId: "D4", grounds: ["n_avance_pas", 3], instance: "comité", pauseKind: "longue",
    frees: "tout", architectValidated: "oui", reviewDate: "", natureChange: 42,
  }));
  assert.ok(decision);
  assert.deepEqual(decision.grounds, ["n_avance_pas"]);
  assert.equal(decision.instance, null);
  assert.equal(decision.pauseKind, null);
  assert.deepEqual(decision.frees, { people: "", budget: "", capacity: "" });
  assert.equal(decision.architectValidated, false);
  assert.equal(decision.reviewDate, null);
  assert.equal(decision.natureChange, "");
});
