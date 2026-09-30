// Checks of ADR 054: a fact the files leave blank keeps the stored value;
// a fact they carry — zero included — replaces it; the plan de charge is
// one fact, replaced or kept whole; a new card has nothing to keep.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Card } from "../../core/types.ts";
import { keepStoredFacts, keptFactCounts } from "./keep-facts.ts";
import type { KeptFact } from "./keep-facts.ts";

const STORED = {
  id: "PE1@2026", title: "Atelier", owner: "Alice MERLE", typeId: "etude", codename: "PE1", sciformaId: "PE1",
  budgetRdli: 150, budgetEstimated: 120, budgetEngaged: 30, budgetConsumed: 80,
  effortEstimated: 110, effortConsumed: 70,
  chargeByProfile: [{ profileId: "pmo", jh: 40, done: 25 }, { profileId: "dev", jh: 20, done: 0 }],
  dateRdr: "2026-09-15",
} as unknown as Card;

const CASES: Array<{ name: string; fresh: Partial<Card>; expect: Partial<Card>; kept: string[] }> = [
  { name: "no CdP file: the owner stands", fresh: { owner: "" }, expect: { owner: "Alice MERLE" }, kept: ["chef de projet"] },
  { name: "a blank owner of spaces is blank", fresh: { owner: "  " }, expect: { owner: "Alice MERLE" }, kept: ["chef de projet"] },
  { name: "a new owner replaces", fresh: { owner: "Bruno DIAZ" }, expect: { owner: "Bruno DIAZ" }, kept: [] },
  {
    name: "no SP file: the money stands", fresh: { budgetEstimated: null, budgetEngaged: null, budgetRdli: null },
    expect: { budgetEstimated: 120, budgetEngaged: 30, budgetRdli: 150 }, kept: ["enveloppe RDLI k€", "estimé k€", "engagé k€"],
  },
  { name: "zero is a figure, not a blank", fresh: { budgetConsumed: 0 }, expect: { budgetConsumed: 0 }, kept: [] },
  { name: "no plan de charge: the old plan stands whole", fresh: { chargeByProfile: [] }, expect: { chargeByProfile: STORED.chargeByProfile }, kept: ["plan de charge par métier"] },
  {
    name: "a new plan replaces the old one whole", fresh: { chargeByProfile: [{ profileId: "pmo", jh: 50, done: 30 }] },
    expect: { chargeByProfile: [{ profileId: "pmo", jh: 50, done: 30 }] }, kept: [],
  },
  { name: "no Projets onglet (COUT PREV carries no « Fin »): the RDR date stands", fresh: { dateRdr: null }, expect: { dateRdr: "2026-09-15" }, kept: ["date RDR"] },
  { name: "no code: code and Sciforma id stand", fresh: { codename: null, sciformaId: null }, expect: { codename: "PE1", sciformaId: "PE1" }, kept: ["code projet", "identifiant Sciforma"] },
];

for (const c of CASES) {
  test(`ADR 054: ${c.name}`, () => {
    const tally = new Map<KeptFact, number>();
    const fresh = { ...STORED, ...c.fresh } as Card;
    const card = keepStoredFacts(fresh, STORED, tally);
    for (const [key, value] of Object.entries(c.expect)) assert.deepEqual(card[key as keyof Card], value, key);
    assert.deepEqual(keptFactCounts(tally).map((f) => f.label), c.kept);
    assert.deepEqual(fresh, { ...STORED, ...c.fresh }, "the rebuilt card is left untouched");
  });
}

test("ADR 054: a new card has nothing to keep; a blank stored value keeps nothing", () => {
  const tally = new Map<KeptFact, number>();
  const fresh = { ...STORED, owner: "" } as Card;
  assert.equal(keepStoredFacts(fresh, undefined, tally), fresh);
  assert.equal(keepStoredFacts(fresh, { ...STORED, owner: "" } as Card, tally).owner, "");
  assert.deepEqual(keptFactCounts(tally), []);
});

test("ADR 054: the tally counts cards per fact, in the report's order", () => {
  const tally = new Map<KeptFact, number>();
  for (let i = 0; i < 3; i++) keepStoredFacts({ ...STORED, owner: "", dateRdr: null } as Card, STORED, tally);
  keepStoredFacts({ ...STORED, dateRdr: null } as Card, STORED, tally);
  assert.deepEqual(keptFactCounts(tally), [{ label: "chef de projet", cards: 3 }, { label: "date RDR", cards: 4 }]);
});
