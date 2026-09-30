// Checks of the chef de projet rule (R6, author 2026-09-30): Responsable 1,
// else the next one when the first is a domain lead; the domain lead when he
// is the only name; without PARAM nobody is known as a lead.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickOwner } from "./owner-rule.ts";

const LEADS = new Set(["LAMBERT Luc", "ROUSSEL Marc"]);
const isLead = (cell: string): boolean => LEADS.has(cell);

const CASES: Array<{ name: string; cells: string[]; lead: boolean; owner: string | null; skipped: number; taken: boolean }> = [
  { name: "Responsable 1 is not a lead", cells: ["Alice MERLE", "LAMBERT Luc", ""], lead: true, owner: "Alice MERLE", skipped: 0, taken: false },
  { name: "Responsable 1 is a lead: Responsable 2", cells: ["LAMBERT Luc", "Alice MERLE", ""], lead: true, owner: "Alice MERLE", skipped: 1, taken: false },
  { name: "two leads then a name", cells: ["LAMBERT Luc", "ROUSSEL Marc", "Dan ROY"], lead: true, owner: "Dan ROY", skipped: 2, taken: false },
  { name: "the only name is a lead: he is the chef de projet", cells: ["LAMBERT Luc", "", ""], lead: true, owner: "LAMBERT Luc", skipped: 0, taken: true },
  { name: "only leads: the first one", cells: ["", "ROUSSEL Marc", "LAMBERT Luc"], lead: true, owner: "ROUSSEL Marc", skipped: 0, taken: true },
  { name: "blanks only: no chef de projet", cells: ["", " ", ""], lead: true, owner: null, skipped: 0, taken: false },
  { name: "without PARAM: Responsable 1 as given", cells: ["LAMBERT Luc", "Alice MERLE", ""], lead: false, owner: "LAMBERT Luc", skipped: 0, taken: false },
];

for (const c of CASES) {
  test(`chef de projet: ${c.name}`, () => {
    const pick = pickOwner(c.cells, c.lead ? isLead : null);
    assert.deepEqual([pick.owner, pick.leadsSkipped, pick.leadTaken], [c.owner, c.skipped, c.taken]);
  });
}
