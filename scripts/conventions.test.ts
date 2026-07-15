// Unit tests for the convention scanner (scripts/conventions.ts). The script
// check-conventions.ts gates the pipeline (verify.sh step 2); if FUNCTION_START
// stopped matching arrows, or the brace counter miscounted, the checker would
// pass every file silently and the green output would look normal. These pin
// the boundaries so that regression is caught.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNCTION_START, MAX_FUNCTION_LINES, functionLengths } from "./conventions.ts";

// An arrow function whose start-through-close spans exactly `total` lines:
// "const f = () => {" + (total-2) body lines + "};".
function arrow(total: number): string[] {
  return ["const f = () => {", ...Array(total - 2).fill("  step();"), "};"];
}

// A named function declaration spanning exactly `total` lines.
function named(total: number): string[] {
  return ["function foo() {", ...Array(total - 2).fill("  step();"), "}"];
}

test("the cap is 40 lines", () => {
  assert.equal(MAX_FUNCTION_LINES, 40);
});

test("a 40-line function passes, 41 fails", () => {
  assert.deepEqual(functionLengths(arrow(40)), []);
  assert.deepEqual(functionLengths(arrow(41)), [{ line: 1, length: 41 }]);
});

test("named function declarations are measured too", () => {
  assert.deepEqual(functionLengths(named(40)), []);
  assert.deepEqual(functionLengths(named(41)), [{ line: 1, length: 41 }]);
});

test("nested braces are counted once — the body length is the full outer span", () => {
  const lines = ["function big() {", "  if (a) {", ...Array(45).fill("    step();"), "  }", "}"];
  const found = functionLengths(lines);
  // If an inner "}" ended the scan early, length would be short / mislocated.
  assert.equal(found.length, 1);
  assert.equal(found[0]?.line, 1);
  assert.equal(found[0]?.length, lines.length); // 49, through the outer close
});

test("FUNCTION_START matches the shapes it must, and rejects plain statements", () => {
  assert.ok(FUNCTION_START.test("const f = () => {"));
  assert.ok(FUNCTION_START.test("export function foo() {"));
  assert.ok(FUNCTION_START.test("  async function bar() {"));
  assert.ok(FUNCTION_START.test("  handler: (req, res) => {"));
  assert.equal(FUNCTION_START.test("const x = 3;"), false);
  assert.equal(FUNCTION_START.test("if (ready) {"), false);
});

test("documents the known undercount: multi-line-param arrows count from '=> {'", () => {
  const lines = ["const f = (", "  a,", "  b,", ") => {", ...Array(40).fill("  step();"), "};"];
  const found = functionLengths(lines);
  // The arrow's real span is the whole array, but FUNCTION_START only matches
  // ") => {" (line 4), so it is measured from there — an accepted heuristic
  // undercount, not a bug.
  assert.equal(found.length, 1);
  assert.equal(found[0]?.line, 4);
  assert.equal(found[0]?.length, lines.length - 3);
});
