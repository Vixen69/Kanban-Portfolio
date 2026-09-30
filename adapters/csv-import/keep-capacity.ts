// ADR 054 for the capacity snapshot: a load replaces a year's snapshot
// whole when a plan de charge came, but a part the files left blank keeps
// the stored one — the COUT PREV « Charge » reading without a Coût file
// (ADR 034), a person's domain, profile or capacity without PARAM or
// Ress.Profils. Persons are matched by their opaque id (a hash of the
// matricule, stable from one load to the next).

import type { CapacitySnapshot, Person } from "../../core/types.ts";

// The person facts another file than the plan de charge may carry.
const PERSON_FACTS = ["domain", "subDomain", "profileId", "capacityJh"] as const;

function keepPerson(fresh: Person, stored: Person | undefined): Person {
  if (stored === undefined) return fresh;
  const person: Person = { ...fresh };
  for (const fact of PERSON_FACTS) {
    if (fresh[fact] === null && stored[fact] !== null) Object.assign(person, { [fact]: stored[fact] });
  }
  if (fresh.capacityJh === null && stored.capacityJh !== null && stored.capacitySource !== undefined) {
    person.capacitySource = stored.capacitySource;
  }
  return person;
}

/**
 * The capacity snapshot to store: the fresh one, its blank parts filled
 * from the snapshot already stored for the same year.
 * Inputs: the snapshot the files built, the stored one (null on a first
 * load, or for another year — then nothing is kept). Output: a new
 * snapshot; the inputs are left untouched. Failure modes: none.
 */
export function keepStoredCapacity(fresh: CapacitySnapshot, stored: CapacitySnapshot | null): CapacitySnapshot {
  if (stored === null || stored.exerciseYear !== fresh.exerciseYear) return fresh;
  const before = new Map(stored.persons.map((p) => [p.id, p]));
  const persons = fresh.persons.map((p) => keepPerson(p, before.get(p.id)));
  const freshCouts = fresh.coutsDemand ?? [];
  const coutsDemand = freshCouts.length === 0 && (stored.coutsDemand ?? []).length > 0 ? stored.coutsDemand : fresh.coutsDemand;
  return { ...fresh, persons, ...(coutsDemand === undefined ? {} : { coutsDemand }) };
}
