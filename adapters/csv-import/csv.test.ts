// Checks of the hand-rolled CSV reader: French Excel dialect (";"),
// quoting, line accounting, and the tolerated-anomaly warnings.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, sniffSeparator } from "./csv.ts";

function cellsOf(text: string): string[][] {
  return parseCsv(text).rows.map((r) => r.cells);
}

test("basic rows, CRLF and LF, with line numbers", () => {
  for (const eol of ["\r\n", "\n"]) {
    const result = parseCsv(`a;b${eol}c;d${eol}`);
    assert.deepEqual(result.rows, [
      { line: 1, cells: ["a", "b"] },
      { line: 2, cells: ["c", "d"] },
    ]);
    assert.equal(result.separator, ";");
    assert.deepEqual(result.warnings, []);
  }
});

test("last record without trailing newline is kept", () => {
  assert.deepEqual(cellsOf("a;b\nc;d"), [["a", "b"], ["c", "d"]]);
});

test("trailing newline produces no phantom row", () => {
  assert.equal(parseCsv("a;b\n").rows.length, 1);
});

test("an empty middle line yields a single-empty-cell row", () => {
  const rows = parseCsv("a;b\n\nc;d").rows;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], { line: 2, cells: [""] });
  assert.deepEqual(rows[2], { line: 3, cells: ["c", "d"] });
});

test("empty cells are preserved", () => {
  assert.deepEqual(cellsOf("a;;b"), [["a", "", "b"]]);
  assert.deepEqual(cellsOf(";;"), [["", "", ""]]);
});

test("quoted fields carry separators, escaped quotes and newlines", () => {
  assert.deepEqual(cellsOf('"x;y";b'), [["x;y", "b"]]);
  assert.deepEqual(cellsOf('"il a dit ""oui""";b'), [['il a dit "oui"', "b"]]);
  const multi = parseCsv('"l1\r\nl2";b\nsuite;fin');
  assert.deepEqual(multi.rows[0], { line: 1, cells: ["l1\nl2", "b"] });
  assert.deepEqual(multi.rows[1], { line: 3, cells: ["suite", "fin"] });
  assert.deepEqual(multi.warnings, []);
});

test("a lone quote inside an unquoted field is literal, warned once", () => {
  const result = parseCsv('ab"cd;e\nfg"h;i');
  assert.deepEqual(result.rows.map((r) => r.cells), [['ab"cd', "e"], ['fg"h', "i"]]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? "", /guillemet isolé/);
});

test("an unterminated quote keeps the remainder and warns", () => {
  const result = parseCsv('a;"jamais fermé\nsuite');
  assert.deepEqual(result.rows, [{ line: 1, cells: ["a", "jamais fermé\nsuite"] }]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? "", /non refermé/);
});

test("sniffSeparator: semicolon wins ties, quotes shield commas", () => {
  assert.deepEqual(sniffSeparator("a;b,c"), { separator: ";", deviant: false });
  assert.deepEqual(sniffSeparator("a,b,c"), { separator: ",", deviant: true });
  assert.deepEqual(sniffSeparator('"a,b";c'), { separator: ";", deviant: false });
  assert.deepEqual(sniffSeparator(""), { separator: ";", deviant: false });
  assert.deepEqual(sniffSeparator("a,b\nc;d;e"), { separator: ",", deviant: true });
});

test("a comma-separated file is read with commas and flagged", () => {
  const result = parseCsv("a,b\nc,d");
  assert.equal(result.separator, ",");
  assert.deepEqual(result.rows.map((r) => r.cells), [["a", "b"], ["c", "d"]]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? "", /séparateur/);
});
