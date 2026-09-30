// ADR 056: figures and years read whatever the converter's locale; the
// one ambiguous shape (« 1,035 ») keeps the French reading and becomes a
// douteux naming file, row and column.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readNumber } from "./numbers.ts";
import { parseFrenchAmount, parseYearCell } from "./values.ts";
import { AMBIGUOUS_MARK, moneyCell, promoteAmbiguous } from "./cells.ts";
import { createReport, warn } from "./report.ts";
import { tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";

test("readNumber: French, en-US, grouped and scientific forms; junk is null", () => {
  const CASES: Array<[string, number | null]> = [
    ["1234", 1234], ["1234,5", 1234.5], ["1234.5", 1234.5], ["1,234.50", 1234.5], ["1.234,50", 1234.5],
    ["1,234,567", 1234567], ["1.234.567", 1234567], ["1,2345E+03", 1234.5], ["1.2e4", 12000], ["-42,5", -42.5],
    ["0,125", 0.125], ["12,3,4", null], ["12,34.5", null], ["1,234.5.6", null], ["", null], ["-", null], ["abc", null],
  ];
  for (const [text, expected] of CASES) assert.equal(readNumber(text)?.value ?? null, expected, text);
});

test("the ambiguous shape: a lone comma + three digits after a 1–3 digit integer", () => {
  assert.deepEqual(readNumber("1,035"), { value: 1.035, ambiguous: { alternative: 1035 } });
  assert.deepEqual(readNumber("-120,500"), { value: -120.5, ambiguous: { alternative: -120500 } });
  for (const text of ["0,125", "1234,500", "1,03", "1.035", "1,234.50"]) assert.equal(readNumber(text)?.ambiguous, undefined, text);
});

test("parseFrenchAmount: currency before the figure, accounting parentheses, units kept", () => {
  assert.deepEqual(parseFrenchAmount("€1,234.50"), { kind: "value", value: 1234.5, unit: "€" });
  assert.deepEqual(parseFrenchAmount("(1 234,50 €)"), { kind: "value", value: -1234.5, unit: "€" });
  assert.deepEqual(parseFrenchAmount("12.000,00 €"), { kind: "value", value: 12000, unit: "€" });
  assert.deepEqual(parseFrenchAmount("120,500 €"), { kind: "value", value: 120.5, unit: "€", ambiguous: { alternative: 120500 } });
  for (const raw of ["(-3)", "- €", "#REF!", "1 2 3 abc"]) assert.equal(parseFrenchAmount(raw).kind, "invalid", raw);
});

test("parseYearCell: every rendering of a year, null otherwise", () => {
  const CASES: Array<[string, number | null]> = [
    ["2026", 2026], ["2 026", 2026], ["2026,00", 2026], ["2026.0", 2026], ["2,026", 2026], ["2.026", 2026],
    ["01/01/2026", 2026], ["2026-03-01", 2026], ["46023", 2026], ["", null], ["vingt-six", null], ["26", null], ["2026 €", null],
  ];
  for (const [raw, expected] of CASES) assert.equal(parseYearCell(raw), expected, raw);
});

test("moneyCell tallies the ambiguity; promoteAmbiguous moves it to the douteux with file, rows and sample", () => {
  const tallies = new Map<string, Tally>();
  assert.equal(moneyCell("1,035", "Coût prév (ME)", 7, tallies), 1.035, "the French reading stays");
  assert.equal(moneyCell("1 035", "Coût prév (ME)", 8, tallies), 1035);
  const report = createReport();
  for (const [message, t] of tallies) warn(report, `${message} : ${tallyLabel(t)}`, "SP_2026.csv");
  warn(report, "autre signalement", "SP_2026.csv");
  promoteAmbiguous(report);
  assert.deepEqual(report.warnings.map((w) => w.message), ["autre signalement"]);
  assert.equal(report.doubtful.length, 1);
  assert.equal(report.doubtful[0]?.file, "SP_2026.csv");
  assert.ok(report.doubtful[0]?.question.includes(AMBIGUOUS_MARK));
  assert.match(report.doubtful[0]?.question ?? "", /^« Coût prév \(ME\) » : .* 1 cellule\(s\), ligne\(s\) 7 — ex\. « 1,035 »$/);
});
