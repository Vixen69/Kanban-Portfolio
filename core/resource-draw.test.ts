// The resource draw (ADR 041): which cards take days from a transverse
// domain's people — named assignments and generic rows, zero days ignored.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, CapacitySnapshot } from "./types.ts";
import { resourceDrawByDomain } from "./resource-draw.ts";
import { testConfig, testPerson } from "./test-helpers.ts";

const CONFIG: BoardConfig = {
  ...testConfig(),
  domains: [
    { id: "ad", name: "A&D", short: "A&D", color: "#000", transverse: true },
    { id: "infra", name: "INFRA", short: "INF", color: "#000", transverse: true },
    { id: "erp", name: "ERP", short: "ERP", color: "#000" },
  ],
};

const SNAPSHOT: CapacitySnapshot = {
  exerciseYear: 2026,
  persons: [
    testPerson({ id: "p-ad", domain: "ad" }),
    testPerson({ id: "p-infra", domain: "infra" }),
    testPerson({ id: "p-erp", domain: "erp" }),
    testPerson({ id: "p-none", domain: null }),
  ],
  assignments: [
    { personId: "p-ad", cardId: "S1", jh: 10, done: 0 },
    { personId: "p-ad", cardId: "S2", jh: 0, done: 0 },      // zero days: does not draw
    { personId: "p-infra", cardId: "S2", jh: 5, done: 5 },
    { personId: "p-erp", cardId: "S3", jh: 8, done: 0 },      // not transverse
    { personId: "p-none", cardId: "S4", jh: 8, done: 0 },     // no domain
    { personId: "ghost", cardId: "S5", jh: 8, done: 0 },      // unknown person
  ],
  generic: [
    { metier: "Archi", domain: "ad", cardId: "S6", jh: 3, done: 0 },
    { metier: "Archi", domain: "ad", cardId: null, jh: 3, done: 0 },
    { metier: "Réseau", domain: "infra", cardId: "S1", jh: 0, done: 0 },
  ],
};

test("resourceDrawByDomain: one set per transverse domain, named persons and generic rows, zero days ignored", () => {
  const draw = resourceDrawByDomain(SNAPSHOT, CONFIG);
  assert.deepEqual([...draw.keys()], ["ad", "infra"]);
  assert.deepEqual([...draw.get("ad")!].sort(), ["S1", "S6"]);
  assert.deepEqual([...draw.get("infra")!], ["S2"]);
});

test("resourceDrawByDomain: no snapshot = the domains with empty sets", () => {
  const draw = resourceDrawByDomain(null, CONFIG);
  assert.deepEqual([...draw.entries()].map(([id, set]) => [id, set.size]), [["ad", 0], ["infra", 0]]);
  assert.deepEqual([...resourceDrawByDomain(SNAPSHOT, testConfig()).entries()].map(([id, set]) => [id, set.size]), [["beta", 0]],
    "the test config's own transverse domain, nobody of it in the snapshot");
});
