// The fiche « Décision et Raison » draft (ADR 052): its defaults, what it
// still lacks, and the decisions it sends — the server's rules, said first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { draftDecisions, draftProblems, emptyDraft, nextReview } from "./decisionDraft.ts";

const NOW = new Date("2026-10-01T09:00:00.000Z");

test("nextReview: one month on, clamped to the month's end", () => {
  assert.equal(nextReview(NOW), "2026-11-01");
  assert.equal(nextReview(new Date("2026-01-31T09:00:00.000Z")), "2026-02-28");
  assert.equal(nextReview(new Date("2026-12-15T09:00:00.000Z")), "2027-01-15");
});

test("a blank fiche: review in a month, decided today, nothing else", () => {
  const draft = emptyDraft(NOW);
  assert.equal(draft.reviewDate, "2026-11-01");
  assert.equal(draft.decidedOn, "2026-10-01");
  assert.equal(draft.pauseKind, null);
  assert.deepEqual(draft.grounds, []);
});

test("draftProblems: a pause says why and when; a parking has no date; a requalification says what changed", () => {
  const blank = emptyDraft(NOW);
  assert.deepEqual(draftProblems(blank, ["D4"]), ["Pause : cocher un terme de la grille ou écrire la raison."]);
  assert.deepEqual(draftProblems({ ...blank, grounds: ["n_avance_pas"], reviewDate: "" }, ["D4"]), [
    "Pause : fixer l’échéance du réexamen (ou choisir « parking »).",
  ]);
  assert.deepEqual(draftProblems({ ...blank, reason: "x", reviewDate: "", pauseKind: "parking" }, ["D4"]), []);
  assert.deepEqual(draftProblems(blank, ["D5"]), ["Requalification : dire ce qui a changé dans la nature du sujet."]);
  assert.deepEqual(draftProblems({ ...blank, natureChange: "  " }, ["D5"]).length, 1);
  assert.equal(draftProblems(blank, ["D4", "D5"]).length, 2);
});

test("draftDecisions: pause first with its block, requalification with what changed, shared texts on each", () => {
  const draft = {
    ...emptyDraft(NOW), instance: "revue" as const, grounds: ["n_avance_pas"], reason: " Plus de sponsor. ",
    options: "Continuer : personne pour porter.", liftCondition: "Un sponsor nommé", pauseKind: "tactique" as const,
    natureChange: "Devenu un produit.", architectValidated: true,
  };
  const [pause, requalify] = draftDecisions(draft, ["D4", "D5"], false);
  assert.deepEqual(pause, {
    decisionId: "D4", grounds: ["n_avance_pas"], reason: "Plus de sponsor.", reviewDate: "2026-11-01",
    instance: "revue", options: "Continuer : personne pour porter.", frees: { people: "", budget: "", capacity: "" },
    liftCondition: "Un sponsor nommé", pauseKind: "tactique",
  });
  assert.deepEqual(requalify, {
    decisionId: "D5", grounds: [], reason: "Plus de sponsor.", reviewDate: null,
    instance: "revue", options: "Continuer : personne pour porter.", frees: { people: "", budget: "", capacity: "" },
    natureChange: "Devenu un produit.", architectValidated: true,
  });
});

test("draftDecisions: a parking sends no date; a traced paper decision sends its day", () => {
  const [parking] = draftDecisions({ ...emptyDraft(NOW), reason: "Plus tard.", pauseKind: "parking" }, ["D4"], false);
  assert.equal(parking?.reviewDate, null);
  assert.equal(parking?.decidedOn, undefined);
  const [traced] = draftDecisions({ ...emptyDraft(NOW), reason: "RDOM", decidedOn: "2026-09-14" }, ["D4"], true);
  assert.equal(traced?.decidedOn, "2026-09-14");
});
