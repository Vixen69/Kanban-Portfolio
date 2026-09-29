// The two display rules of the interface: aggregates in whole units, card-
// and fiche-level figures with at most one decimal — French throughout.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtNum, fmtUnit } from "./format.ts";

const NBSP = String.fromCharCode(0x202f);

test("fmtUnit rounds to whole units and groups in French", () => {
  assert.equal(fmtUnit(1250), `1${NBSP}250`);
  assert.equal(fmtUnit(25011.0399999997), `25${NBSP}011`);
  assert.equal(fmtUnit(24.5), "25");
  assert.equal(fmtUnit(0), "0");
});

test("fmtNum keeps at most one decimal, French comma", () => {
  assert.equal(fmtNum(24.52), "24,5");
  assert.equal(fmtNum(36.099999999994), "36,1");
  assert.equal(fmtNum(24), "24");
  assert.equal(fmtNum(1250.04), `1${NBSP}250`);
  assert.equal(fmtNum(0.25), "0,3");
});

test("non-finite values render as a dash, never NaN", () => {
  assert.equal(fmtUnit(Number.NaN), "—");
  assert.equal(fmtNum(Number.POSITIVE_INFINITY), "—");
});
