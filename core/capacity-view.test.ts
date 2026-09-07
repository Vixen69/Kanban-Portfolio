import { test } from "node:test";
import assert from "node:assert/strict";
import type { CapacitySnapshot, CardState } from "./types.ts";
import { computeCapacityReadout } from "./capacity-view.ts";
import { testCard, testConfig, testPerson } from "./test-helpers.ts";

const CONFIG = testConfig(); // alpha; beta is transverse (ADR 024)

function state(overrides: Partial<CardState>): CardState {
  return { ...testCard(overrides), archived: false, ...overrides } as CardState;
}

// p1/p2 belong to the transverse beta domain, p3 to alpha (capacity
// unknown), p4 is a PdC stub without domain or profile; S999 is outside
// the fold (archived or deleted).
const SNAPSHOT: CapacitySnapshot = {
  exerciseYear: 2026,
  persons: [
    testPerson({ id: "p1", name: "Alice MERLE", domain: "beta", profileId: "pA", capacityJh: 200 }),
    testPerson({ id: "p2", name: "Bruno DUBOIS", domain: "beta", profileId: "pB", capacityJh: 40, external: true }),
    testPerson({ id: "p3", name: "Chloé NGUYEN", domain: "alpha", profileId: "pA", capacityJh: null }),
    testPerson({ id: "p4", name: "Stub PDC", domain: null, profileId: null, metier: "", capacityJh: null, source: "pdc" }),
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

const READOUT = computeCapacityReadout(SNAPSHOT, CARDS, CONFIG);

test("kpis: capacity, demand, global ratio, overloads and uncovered cards", () => {
  assert.deepEqual(READOUT.kpis, {
    persons: 4, external: 1, capacityJh: 240, demandJh: 250, doneJh: 50,
    ratio: 1.04, overloaded: 1, cardsWithoutAssignment: 1,
  });
  assert.equal(READOUT.exerciseYear, 2026);
});

test("the transverse matrix names who consumes beta's people, heaviest first", () => {
  assert.equal(READOUT.transverse.length, 1);
  const beta = READOUT.transverse[0];
  assert.deepEqual(
    [beta?.domainId, beta?.name, beta?.capacityJh, beta?.demandJh, beta?.ratio],
    ["beta", "Beta", 240, 210, 0.88],
  );
  assert.deepEqual(beta?.consumers.map((c) => [c.domainId, c.name, c.jh, c.share]), [
    ["alpha", "Alpha", 120, 0.5],
    ["beta", "Beta", 90, 0.38],
  ]);
});

test("domain rows follow the config order, then the persons without domain", () => {
  assert.deepEqual(READOUT.domains.map((row) => [row.domainId, row.name, row.persons, row.withoutCapacity, row.capacityJh, row.demandJh, row.ratio, row.transverse, row.external]), [
    ["alpha", "Alpha", 1, 1, 0, 30, null, false, 0],
    ["beta", "Beta", 2, 0, 240, 210, 0.88, true, 1],
    [null, "Sans domaine", 1, 1, 0, 10, null, false, 0],
  ]);
});

test("profile rows follow the config order, then the persons without profile", () => {
  assert.deepEqual(READOUT.profiles.map((row) => [row.profileId, row.name, row.persons, row.capacityJh, row.demandJh, row.ratio]), [
    ["pA", "Profil A", 2, 200, 180, 0.9],
    ["pB", "Profil B", 1, 40, 60, 1.5],
    [null, "Sans profil", 1, 0, 10, null],
  ]);
});

test("the cards weighing on a transverse domain, with their share of its capacity", () => {
  assert.deepEqual(READOUT.weighing.map((row) => [row.domainId, row.cards.map((c) => [c.cardId, c.title, c.domainName, c.jh, c.share])]), [
    ["beta", [["S001", "Atelier", "Alpha", 120, 0.5], ["S002", "Portail", "Beta", 90, 0.38]]],
  ]);
  const top1 = computeCapacityReadout(SNAPSHOT, CARDS, CONFIG, 1);
  assert.equal(top1.weighing[0]?.cards.length, 1);
});

test("overloads list the persons above 100 % with resolved names", () => {
  assert.deepEqual(READOUT.overloads.map((o) => [o.load.person.id, o.load.ratio, o.domainName, o.profileName, o.load.cards.length]), [
    ["p2", 1.5, "Beta", "Profil B", 1],
  ]);
});

test("coverage counts stubs, unknown capacities, uncovered cards, generic and outside j.h", () => {
  assert.deepEqual(READOUT.coverage, {
    stubs: 1, unknownCapacity: 2, assignedCards: 2, cardsWithoutAssignment: 1,
    genericJh: 20, outsideJh: 10,
  });
});

test("an empty snapshot reads as zeros, not NaN", () => {
  const empty = computeCapacityReadout({ exerciseYear: 2027, persons: [], assignments: [] }, [], CONFIG);
  assert.deepEqual(empty.kpis, {
    persons: 0, external: 0, capacityJh: 0, demandJh: 0, doneJh: 0, ratio: null, overloaded: 0, cardsWithoutAssignment: 0,
  });
  assert.deepEqual(empty.transverse.map((row) => [row.name, row.consumers]), [["Beta", []]]);
  assert.deepEqual(empty.weighing, [{ domainId: "beta", name: "Beta", cards: [] }]);
});
