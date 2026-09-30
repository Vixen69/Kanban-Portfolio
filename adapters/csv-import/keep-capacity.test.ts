// Checks of ADR 054 on the capacity snapshot: a part the files left blank
// (COUT PREV demand, a person's domain / profile / capacity) keeps the
// stored one; a present part replaces it; another year keeps nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { CapacitySnapshot, Person } from "../../core/types.ts";
import { keepStoredCapacity } from "./keep-capacity.ts";

function person(over: Partial<Person> = {}): Person {
  return {
    id: "p-1", name: "Jean ROCA", domain: "infra", subDomain: null, profileId: "pmo", metier: "PMO",
    external: false, capacityJh: 200, plannedJh: 70, doneJh: 35, capacitySource: "pdc", source: "pdc", ...over,
  };
}

const STORED: CapacitySnapshot = {
  exerciseYear: 2026, persons: [person()], assignments: [{ personId: "p-1", cardId: "PE1@2026", jh: 40, done: 25 }],
  generic: [], coutsDemand: [{ centre: "CdP INFRA", cardId: "PE1@2026", jh: 40, done: 25 }],
};

test("ADR 054: without a Coût file the COUT PREV demand stands; with one it is replaced", () => {
  const fresh: CapacitySnapshot = { ...STORED, assignments: [], coutsDemand: [] };
  const kept = keepStoredCapacity(fresh, STORED);
  assert.deepEqual(kept.coutsDemand, STORED.coutsDemand);
  assert.deepEqual(kept.assignments, [], "the plan de charge's own facts are the fresh ones");
  const next = [{ centre: "CdP INFRA", cardId: "PE1@2026", jh: 50, done: 30 }];
  assert.deepEqual(keepStoredCapacity({ ...STORED, coutsDemand: next }, STORED).coutsDemand, next);
});

test("ADR 054: a person's blank domain, profile or capacity keeps the stored value; present values replace", () => {
  const fresh: CapacitySnapshot = { ...STORED, persons: [person({ domain: null, profileId: null, capacityJh: null, capacitySource: undefined, plannedJh: 90 })] };
  const [kept] = keepStoredCapacity(fresh, STORED).persons;
  assert.deepEqual([kept?.domain, kept?.profileId, kept?.capacityJh, kept?.capacitySource, kept?.plannedJh], ["infra", "pmo", 200, "pdc", 90]);
  const moved = keepStoredCapacity({ ...STORED, persons: [person({ domain: "erp" })] }, STORED).persons[0];
  assert.equal(moved?.domain, "erp");
});

test("ADR 054: a first load or another year's snapshot keeps nothing", () => {
  const fresh: CapacitySnapshot = { ...STORED, coutsDemand: [] };
  assert.equal(keepStoredCapacity(fresh, null), fresh);
  assert.equal(keepStoredCapacity(fresh, { ...STORED, exerciseYear: 2025 }), fresh);
});
