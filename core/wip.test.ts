// WIP limits per cell (ADR 046): read per cell, summed per column only when
// every canal has one, the unified columns keyed "*", set immutably.

import { test } from "node:test";
import assert from "node:assert/strict";
import { UNIFIED_LANE, unifiedColumnIds } from "./layout.ts";
import { cellWipLimit, columnWipLimit, withCellWipLimit } from "./wip.ts";
import { testConfig } from "./test-helpers.ts";

// In the test config the qualification anchor is the second column: col1
// and col2 have no canal, col3 has the two canals laneA and laneB.
const CONFIG = { ...testConfig(), wipLimits: { col1: { "*": 5 }, col3: { laneA: 2 } } };

test("the test topology: col1 and col2 unified, col3 with canals", () => {
  assert.deepEqual([...unifiedColumnIds(CONFIG)], ["col1", "col2"]);
});

test("cellWipLimit: the cell's own limit, null when none", () => {
  assert.equal(cellWipLimit(CONFIG, UNIFIED_LANE, "col1"), 5);
  assert.equal(cellWipLimit(CONFIG, UNIFIED_LANE, "col2"), null);
  assert.equal(cellWipLimit(CONFIG, "laneA", "col3"), 2);
  assert.equal(cellWipLimit(CONFIG, "laneB", "col3"), null);
  assert.equal(cellWipLimit(CONFIG, "laneA", "nope"), null);
});

test("columnWipLimit: the unified column's own, the canals' sum only when complete", () => {
  assert.equal(columnWipLimit(CONFIG, "col1"), 5);
  assert.equal(columnWipLimit(CONFIG, "col2"), null);
  assert.equal(columnWipLimit(CONFIG, "col3"), null, "laneB has no limit: no column limit");
  const complete = withCellWipLimit(CONFIG, "laneB", "col3", 3);
  assert.equal(columnWipLimit(complete, "col3"), 5);
  assert.equal(columnWipLimit({ ...complete, lanes: [] }, "col3"), null, "no canal at all: nothing to sum");
});

test("withCellWipLimit: sets, removes, drops emptied rows, never mutates the input", () => {
  const set = withCellWipLimit(CONFIG, "laneB", "col3", 4);
  assert.deepEqual(set.wipLimits, { col1: { "*": 5 }, col3: { laneA: 2, laneB: 4 } });
  assert.deepEqual(CONFIG.wipLimits, { col1: { "*": 5 }, col3: { laneA: 2 } }, "input untouched");
  const cleared = withCellWipLimit(set, "laneA", "col3", null);
  assert.deepEqual(cleared.wipLimits, { col1: { "*": 5 }, col3: { laneB: 4 } });
  const emptied = withCellWipLimit(withCellWipLimit(cleared, "laneB", "col3", null), UNIFIED_LANE, "col1", null);
  assert.deepEqual(emptied.wipLimits, {});
  assert.notEqual(set, CONFIG);
});
