import { test } from "node:test";
import assert from "node:assert/strict";
import type { CapacitySnapshot, CardState } from "./types.ts";
import { computeCapacityReadout, yearElapsed } from "./capacity-view.ts";
import { testCard, testConfig, testPerson } from "./test-helpers.ts";

const CONFIG = testConfig(); // alpha; beta is transverse (ADR 024)
const NOW = new Date("2026-09-08T10:00:00.000Z");

function state(overrides: Partial<CardState>): CardState {
  return { ...testCard(overrides), archived: false, decisions: [], absentFromLastImport: null, ...overrides } as CardState;
}

// p1/p2 belong to the transverse beta domain (p2 external), p3 to alpha
// (capacity unknown, absent from the plan de charge), p4 is a PdC stub
// without domain or profile; S999 is outside the fold (archived or deleted).
// Planned loads (whole plan de charge) exceed the board's demand for p1.
const SNAPSHOT: CapacitySnapshot = {
  exerciseYear: 2026,
  persons: [
    testPerson({ id: "p1", name: "Alice MERLE", domain: "beta", profileId: "pA", capacityJh: 200, plannedJh: 300, doneJh: 100 }),
    testPerson({ id: "p2", name: "Bruno DUBOIS", domain: "beta", profileId: "pB", capacityJh: 40, external: true, plannedJh: 60, doneJh: 20 }),
    testPerson({ id: "p3", name: "Chloé NGUYEN", domain: "alpha", profileId: "pA", capacityJh: null }),
    testPerson({ id: "p4", name: "Stub PDC", domain: null, profileId: null, metier: "", capacityJh: null, source: "pdc", plannedJh: 10, doneJh: 0 }),
  ],
  assignments: [
    { personId: "p1", cardId: "S001", jh: 120, done: 40 },
    { personId: "p1", cardId: "S002", jh: 30, done: 0 },
    { personId: "p2", cardId: "S002", jh: 60, done: 0 },
    { personId: "p3", cardId: "S001", jh: 30, done: 10 },
    { personId: "p4", cardId: "S999", jh: 10, done: 0 },
  ],
};

const CARDS: CardState[] = [
  state({ id: "S001", title: "Atelier", codename: "PE1", domain: "alpha", chargeByProfile: [{ profileId: "pA", jh: 150, done: 50 }] }),
  state({ id: "S002", title: "Portail", codename: null, domain: "beta", chargeByProfile: [{ profileId: "pB", jh: 80, done: 0 }, { profileId: "pA", jh: 30, done: 0 }] }),
  state({ id: "S003", title: "Sans charge", domain: "alpha", chargeByProfile: [] }),
];

const READOUT = computeCapacityReadout(SNAPSHOT, CARDS, CONFIG, NOW);

test("kpis: capacity, board demand, whole-plan engagement, board share, progress, elapsed year", () => {
  const { freeJh, overJh, ...kpis } = READOUT.kpis;
  assert.deepEqual(kpis, {
    persons: 4, external: 1, capacityJh: 240, demandJh: 250, doneJh: 50, plannedJh: 370, doneAllJh: 120, genericJh: 0,
    ratio: 1.04, engagement: 1.54, perimeterShare: 0.68, progress: 0.32, yearElapsed: 0.69,
    overloaded: 2, cardsWithoutAssignment: 1, withoutPlan: 1,
  });
  assert.equal(READOUT.tension, 0.9);
  // ADR 029: free and over are the two sides of planned − capacity, summed per known person.
  const net = SNAPSHOT.persons
    .filter((p) => p.capacityJh !== null && p.plannedJh !== null)
    .reduce((sum, p) => sum + (p.plannedJh ?? 0) - (p.capacityJh ?? 0), 0);
  assert.ok(freeJh >= 0 && overJh >= 0);
  assert.equal(Math.round((overJh - freeJh) * 100) / 100, Math.round(net * 100) / 100);
  assert.equal(READOUT.exerciseYear, 2026);
});

test("yearElapsed clamps to the exercise year", () => {
  assert.equal(yearElapsed(new Date("2026-01-01T00:00:00.000Z"), 2026), 0);
  assert.equal(yearElapsed(new Date("2026-07-02T12:00:00.000Z"), 2026), 0.5);
  assert.equal(yearElapsed(new Date("2027-03-01T00:00:00.000Z"), 2026), 1);
  assert.equal(yearElapsed(new Date("2025-03-01T00:00:00.000Z"), 2026), 0);
});

test("the transverse matrix names who consumes beta's people, with the whole-plan engagement and the split", () => {
  assert.equal(READOUT.transverse.length, 1);
  const beta = READOUT.transverse[0];
  assert.deepEqual(
    [beta?.domainId, beta?.name, beta?.capacityJh, beta?.demandJh, beta?.ratio, beta?.plannedJh, beta?.outsideJh, beta?.engagement],
    ["beta", "Beta", 240, 210, 0.88, 360, 150, 1.5],
  );
  assert.deepEqual(beta?.internal, { persons: 1, capacityJh: 200, plannedJh: 300, engagement: 1.5 });
  assert.deepEqual(beta?.external, { persons: 1, capacityJh: 40, plannedJh: 60, engagement: 1.5 });
  assert.deepEqual(beta?.consumers.map((c) => [c.domainId, c.name, c.jh, c.share]), [
    ["alpha", "Alpha", 120, 0.5],
    ["beta", "Beta", 90, 0.38],
  ]);
});

test("domain rows follow the config order, then the persons without domain", () => {
  assert.deepEqual(READOUT.domains.map((row) => [row.domainId, row.name, row.persons, row.withoutCapacity, row.withoutPlan, row.capacityJh, row.demandJh, row.plannedJh, row.ratio, row.engagement, row.transverse, row.external.persons]), [
    ["alpha", "Alpha", 1, 1, 1, 0, 30, 0, null, null, false, 0],
    ["beta", "Beta", 2, 0, 0, 240, 210, 360, 0.88, 1.5, true, 1],
    [null, "Sans domaine", 1, 1, 0, 0, 10, 10, null, null, false, 0],
  ]);
});

test("profile rows follow the config order, then the persons without profile", () => {
  assert.deepEqual(READOUT.profiles.map((row) => [row.profileId, row.name, row.persons, row.capacityJh, row.demandJh, row.plannedJh, row.ratio, row.engagement]), [
    ["pA", "Profil A", 2, 200, 180, 300, 0.9, 1.5],
    ["pB", "Profil B", 1, 40, 60, 60, 1.5, 1.5],
    [null, "Sans profil", 1, 0, 10, 10, null, null],
  ]);
});

test("the cards weighing on a transverse domain, with their share of its capacity", () => {
  assert.deepEqual(READOUT.weighing.map((row) => [row.domainId, row.cards.map((c) => [c.cardId, c.title, c.domainName, c.jh, c.share])]), [
    ["beta", [["S001", "Atelier", "Alpha", 120, 0.5], ["S002", "Portail", "Beta", 90, 0.38]]],
  ]);
  const top1 = computeCapacityReadout(SNAPSHOT, CARDS, CONFIG, NOW, 1);
  assert.equal(top1.weighing[0]?.cards.length, 1);
});

test("overloads rank on the whole-plan engagement, most loaded first, names resolved", () => {
  assert.deepEqual(READOUT.overloads.map((o) => [o.load.person.id, o.load.engagement, o.load.ratio, o.domainName, o.profileName, o.load.cards.length, o.over]), [
    ["p1", 1.5, 0.75, "Beta", "Profil A", 2, true],
    ["p2", 1.5, 1.5, "Beta", "Profil B", 1, true],
  ]);
});

test("ADR 033: the tension threshold keeps persons from 90 %, the métiers carry the generic demand « à pourvoir »", () => {
  const snapshot: CapacitySnapshot = {
    exerciseYear: 2026,
    persons: [
      testPerson({ id: "p1", name: "Un", metier: "CdP INFRA BUILD", capacityJh: 200, plannedJh: 185, doneJh: 0 }),
      testPerson({ id: "p2", name: "Deux", metier: "CdP INFRA BUILD", capacityJh: 200, plannedJh: 100, doneJh: 0 }),
      testPerson({ id: "p3", name: "Trois", metier: "Concept.Dév.", capacityJh: 100, plannedJh: 120, doneJh: 0 }),
    ],
    assignments: [{ personId: "p1", cardId: "S001", jh: 50, done: 0 }],
    generic: [
      { metier: "Concept.Dév.", domain: "alpha", cardId: "S001", jh: 60, done: 20 },
      { metier: "Concept.Dév.", domain: "alpha", cardId: null, jh: 40, done: 0 },
      { metier: "Data Business", domain: null, cardId: "S002", jh: 30, done: 0 },
    ],
  };
  const readout = computeCapacityReadout(snapshot, CARDS, CONFIG, NOW);
  assert.deepEqual(readout.overloads.map((o) => [o.load.person.id, o.level, o.over]), [["p3", 1.2, true], ["p1", 0.93, false]]);
  assert.equal(readout.kpis.overloaded, 2);
  assert.equal(readout.kpis.genericJh, 130);
  assert.deepEqual(readout.tensionByMetier, [
    { metier: "Concept.Dév.", persons: 1, tense: 1, over: 1 }, { metier: "CdP INFRA BUILD", persons: 2, tense: 1, over: 0 },
  ]);
  assert.deepEqual(readout.metiers.map((m) => [m.metier, m.persons, m.capacityJh, m.plannedJh, m.demandJh, m.genericJh, m.genericBoardJh, m.pressure]), [
    ["Concept.Dév.", 1, 100, 120, 0, 100, 60, 2.2],
    ["CdP INFRA BUILD", 2, 400, 285, 50, 0, 0, 0.71],
    ["Data Business", 0, 0, 0, 0, 30, 30, null],
  ]);
});

test("coverage counts stubs, unknown capacities and plans, uncovered cards, generic and outside j.h", () => {
  assert.deepEqual(READOUT.coverage, {
    stubs: 1, unknownCapacity: 2, withoutPlan: 1, assignedCards: 2, cardsWithoutAssignment: 1,
    genericJh: 20, outsideJh: 10,
  });
});

test("an empty snapshot reads as zeros, not NaN", () => {
  const empty = computeCapacityReadout({ exerciseYear: 2027, persons: [], assignments: [] }, [], CONFIG, NOW);
  assert.deepEqual(empty.kpis, {
    persons: 0, external: 0, capacityJh: 0, demandJh: 0, doneJh: 0, plannedJh: 0, doneAllJh: 0, freeJh: 0, overJh: 0, genericJh: 0,
    ratio: null, engagement: null, perimeterShare: null, progress: null, yearElapsed: 0,
    overloaded: 0, cardsWithoutAssignment: 0, withoutPlan: 0,
  });
  assert.deepEqual(empty.transverse.map((row) => [row.name, row.consumers, row.engagement]), [["Beta", [], null]]);
  assert.deepEqual(empty.weighing, [{ domainId: "beta", name: "Beta", cards: [] }]);
});
