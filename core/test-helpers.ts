// Shared factories for core and adapter tests (test-only module).

import type { BoardConfig, Card } from "./types.ts";

/**
 * A small valid board topology for tests: 2 lanes, 3 columns, 2 domains,
 * the default aging steps and andon threshold.
 * Output: a fresh BoardConfig (safe to mutate in a test). Failure: none.
 */
export function testConfig(): BoardConfig {
  return {
    lanes: [
      { id: "laneA", name: "Lane A", nature: "Clair" },
      { id: "laneB", name: "Lane B", nature: "Complexe" },
    ],
    columns: [
      { id: "col1", name: "Colonne 1", wipLimit: null },
      { id: "col2", name: "Colonne 2", wipLimit: 3 },
      { id: "col3", name: "Colonne 3", wipLimit: null },
    ],
    domains: ["Alpha", "Beta"],
    types: [
      { id: "t1", name: "Type 1", short: "T1" },
      { id: "t2", name: "Type 2", short: "T2" },
    ],
    agingStepsDays: [7, 21, 45, 90],
    andonThresholdDays: 5,
  };
}

/**
 * A card with sane defaults, overridable per test.
 * Input: partial Card overrides. Output: a complete Card. Failure: none.
 */
export function testCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "S001",
    title: "Sujet de test",
    domain: "Alpha",
    laneId: "laneA",
    columnId: "col1",
    owner: "M. Test",
    criticality: "normal",
    typeId: "t1",
    codename: "PX0000001",
    tags: [],
    dependencies: [],
    blocked: false,
    blockedReason: null,
    blockedSince: null,
    budget: null,
    consumed: null,
    remaining: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "fixtures",
    ...overrides,
  };
}
