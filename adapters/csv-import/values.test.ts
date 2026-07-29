// Table-driven checks of the French-flavored cell parsers (amounts, dates,
// milestone flags) — the pitfalls catalogued in docs/IMPORT-MAPPING.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrenchAmount, parseFrenchDate } from "./values.ts";

const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);

test("amounts: French formats parse, separators tolerated", () => {
  const CASES: Array<[string, number]> = [
    ["1234", 1234],
    ["1234,56", 1234.56],
    ["1234.56", 1234.56],
    ["1 234,5", 1234.5],
    [`1${NBSP}234`, 1234],
    [`12${NNBSP}345,00`, 12345],
    ["-42,5", -42.5],
    ["0", 0],
  ];
  for (const [raw, expected] of CASES) {
    assert.deepEqual(parseFrenchAmount(raw), { kind: "value", value: expected }, raw);
  }
});

test("amounts: a unit written in the cell is stripped and reported", () => {
  assert.deepEqual(parseFrenchAmount("120 k€"), { kind: "value", value: 120, unit: "k€" });
  assert.deepEqual(parseFrenchAmount("85€"), { kind: "value", value: 85, unit: "€" });
});

test("amounts: blanks are empty, junk is invalid with the raw kept", () => {
  assert.deepEqual(parseFrenchAmount(""), { kind: "empty" });
  assert.deepEqual(parseFrenchAmount("   "), { kind: "empty" });
  for (const raw of ["-", "N/A", "?", "#REF!", "#N/A", "12,3,4", "abc", "1 2 3 abc"]) {
    assert.equal(parseFrenchAmount(raw).kind, "invalid", raw);
  }
});

test("dates: FR formats, ISO, datetimes and the 2-digit year pivot", () => {
  const CASES: Array<[string, string]> = [
    ["29/07/2026", "2026-07-29"],
    ["1/3/2026", "2026-03-01"],
    ["29-07-2026", "2026-07-29"],
    ["29.07.26", "2026-07-29"],
    ["15/06/95", "1995-06-15"],
    ["29/07/2026 14:30", "2026-07-29"],
    ["29/07/2026 14:30:05", "2026-07-29"],
    ["2026-07-29", "2026-07-29"],
    ["2026-07-29T08:00:00", "2026-07-29"],
  ];
  for (const [raw, iso] of CASES) {
    assert.deepEqual(parseFrenchDate(raw), { kind: "date", iso }, raw);
  }
});

test("dates: Excel serials parse with the interpretation marked", () => {
  assert.deepEqual(parseFrenchDate("46242"), { kind: "date", iso: "2026-08-08", via: "serial" });
  assert.equal(parseFrenchDate("1000").kind, "invalid");
  assert.equal(parseFrenchDate("999999").kind, "invalid");
});

test("dates: yes-flags, explicit noes, blanks, impossible calendars, junk", () => {
  for (const raw of ["oui", "OUI", "x", "X", "vrai"]) {
    assert.deepEqual(parseFrenchDate(raw), { kind: "flag" }, raw);
  }
  for (const raw of ["non", "FAUX", "faux", "false"]) {
    assert.deepEqual(parseFrenchDate(raw), { kind: "no" }, raw);
  }
  assert.deepEqual(parseFrenchDate(""), { kind: "empty" });
  const JUNK = ["31/02/2026", "13/13/2026", "00/01/2026", "demain", "2026/07/29", "99", "2026-07-1929"];
  for (const raw of JUNK) {
    assert.equal(parseFrenchDate(raw).kind, "invalid", raw);
  }
});
