import { test } from "node:test";
import assert from "node:assert/strict";
import { demandByPersonDomain, loadByGroup, overloaded, personLoads, totalDemand } from "./capacity.ts";
import { testCard, testConfig, testPerson } from "./test-helpers.ts";
import type { CapacitySnapshot, CardState } from "./types.ts";

const CONFIG = testConfig();

function state(overrides: Parameters<typeof testCard>[0]): CardState {
  return { ...testCard(overrides), enteredColumnAt: "2026-01-01T00:00:00.000Z", comments: [], archived: false };
}

// Two transverse (beta) persons, one alpha person, one without capacity.
const SNAPSHOT: CapacitySnapshot = {
  exerciseYear: 2026,
  persons: [
    testPerson({ id: "p1", name: "Un", domain: "beta", subDomain: "b1", profileId: "pA", capacityJh: 200 }),
    testPerson({ id: "p2", name: "Deux", domain: "beta", subDomain: "b2", profileId: "pB", capacityJh: 100 }),
    testPerson({ id: "p3", name: "Trois", domain: "alpha", profileId: "pA", capacityJh: 200 }),
    testPerson({ id: "p4", name: "Quatre", domain: "alpha", profileId: null, capacityJh: null, source: "pdc" }),
  ],
  assignments: [
    { personId: "p1", cardId: "A1", jh: 150, done: 50 },
    { personId: "p1", cardId: "B1", jh: 120, done: 10 },
    { personId: "p2", cardId: "A1", jh: 60, done: 60 },
    { personId: "p3", cardId: "B1", jh: 40, done: 0 },
    { personId: "p4", cardId: "B1", jh: 30, done: 0 },
    { personId: "ghost", cardId: "B1", jh: 999, done: 0 },
  ],
};
const CARDS: CardState[] = [state({ id: "A1", domain: "alpha" }), state({ id: "B1", domain: "beta" })];

test("personLoads sums assignments, ranks by ratio, unknown capacities last, ghosts ignored", () => {
  const loads = personLoads(SNAPSHOT);
  assert.deepEqual(loads.map((l) => [l.person.id, l.jh, l.ratio]), [
    ["p1", 270, 1.35], ["p2", 60, 0.6], ["p3", 40, 0.2], ["p4", 30, null],
  ]);
  assert.deepEqual(loads[0]?.cards, [{ cardId: "A1", jh: 150, done: 50 }, { cardId: "B1", jh: 120, done: 10 }]);
  assert.deepEqual(overloaded(SNAPSHOT).map((l) => l.person.id), ["p1"]);
});

test("loadByGroup: capacity vs demand per profile, unknown capacities counted apart", () => {
  const byProfile = loadByGroup(SNAPSHOT, (p) => p.profileId);
  assert.deepEqual(byProfile.map((g) => [g.key, g.persons, g.withoutCapacity, g.capacityJh, g.demandJh, g.ratio]), [
    ["pA", 2, 0, 400, 310, 0.78], ["pB", 1, 0, 100, 60, 0.6],
  ]);
  const byTeam = loadByGroup(SNAPSHOT, (p) => (p.subDomain === null ? null : `${p.domain}/${p.subDomain}`));
  assert.deepEqual(byTeam.map((g) => [g.key, g.demandJh]), [["beta/b1", 270], ["beta/b2", 60]]);
});

test("demandByPersonDomain: the arbitration matrix, in config order, transverse flagged", () => {
  const rows = demandByPersonDomain(SNAPSHOT, CARDS, CONFIG);
  assert.deepEqual(rows.map((r) => [r.key, r.transverse, r.persons, r.capacityJh, r.demandJh, r.ratio]), [
    ["alpha", false, 2, 200, 70, 0.35], ["beta", true, 2, 300, 330, 1.1],
  ]);
  // beta's people: 210 j.h consumed by alpha's cards (A1), 120 by beta's own (B1).
  assert.deepEqual([...(rows[1]?.byCardDomain ?? [])], [["alpha", 210], ["beta", 120]]);
  assert.equal(rows[0]?.withoutCapacity, 1);
  // A card missing from the fold lands under "?".
  const partial = demandByPersonDomain(SNAPSHOT, [CARDS[0] as CardState], CONFIG);
  assert.equal(partial[1]?.byCardDomain.get("?"), 120);
});

test("totalDemand rounds float noise away", () => {
  assert.deepEqual(totalDemand([{ personId: "p", cardId: "c", jh: 0.1, done: 0.2 }, { personId: "p", cardId: "d", jh: 0.2, done: 0.1 }]),
    { jh: 0.3, done: 0.3 });
});
