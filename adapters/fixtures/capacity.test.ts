// Capacity generator tests (ADR 024/028): determinism, assignments that
// sum back to the cards' charges, planned loads beyond the board.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { toCard } from "../../core/state.ts";
import { FIXTURES_SEED, generatePortfolio } from "./generate.ts";
import { generateCapacity } from "./capacity.ts";

const NOW = new Date("2026-07-06T12:00:00.000Z");
const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;
const PORTFOLIO = generatePortfolio(CONFIG, NOW);

test("the capacity snapshot is deterministic and sums back to the cards' charges", () => {
  const cards = PORTFOLIO.subjects.map((subject) => toCard(subject, PORTFOLIO.financialsById.get(subject.id) ?? null));
  const snapshot = generateCapacity(CONFIG, cards, FIXTURES_SEED);
  assert.deepEqual(generateCapacity(CONFIG, cards, FIXTURES_SEED), snapshot);
  assert.equal(snapshot.exerciseYear, 2026);
  assert.ok(snapshot.persons.length >= 2 * CONFIG.profiles.length);
  assert.ok(snapshot.persons.some((p) => p.capacityJh === null), "some unknown capacities");
  assert.ok(snapshot.persons.some((p) => p.external), "some externals");
  const personIds = new Set(snapshot.persons.map((p) => p.id));
  assert.equal(personIds.size, snapshot.persons.length, "unique person ids");
  const byCard = new Map<string, number>();
  for (const a of snapshot.assignments) {
    assert.ok(personIds.has(a.personId));
    byCard.set(a.cardId, Math.round(((byCard.get(a.cardId) ?? 0) + a.jh) * 100) / 100);
  }
  for (const card of cards) {
    const expected = card.chargeByProfile
      .filter((c) => snapshot.persons.some((p) => p.profileId === c.profileId))
      .reduce((sum, c) => Math.round((sum + c.jh) * 100) / 100, 0);
    assert.equal(byCard.get(card.id) ?? 0, expected, card.id);
  }
});

test("decisions (ADR 026): Pause subjects carry a traced D4; no decision predates its subject", () => {
  const decided = PORTFOLIO.events.filter((e) => e.type === "decided");
  assert.ok(decided.length >= 3, String(decided.length));
  const created = new Map(PORTFOLIO.subjects.map((s) => [s.id, s.createdAt]));
  for (const e of decided) assert.ok(e.ts > (created.get(e.cardId) ?? ""), e.cardId);
  for (const s of PORTFOLIO.subjects.filter((s) => s.columnId === "pause")) {
    const own = decided.filter((e) => e.cardId === s.id);
    assert.equal(own.length, 1, s.id);
    assert.equal(own[0]?.payload["decisionId"], "D4");
    assert.ok(typeof own[0]?.payload["reason"] === "string" && own[0].payload["reason"] !== "");
  }
});

test("capacity (ADR 028): the planned load covers the board's demand, some persons lack a plan", () => {
  const cards = PORTFOLIO.subjects.map((subject) => toCard(subject, PORTFOLIO.financialsById.get(subject.id) ?? null));
  const snapshot = generateCapacity(CONFIG, cards, FIXTURES_SEED);
  const demand = new Map<string, number>();
  for (const a of snapshot.assignments) demand.set(a.personId, Math.round(((demand.get(a.personId) ?? 0) + a.jh) * 100) / 100);
  let withPlan = 0;
  for (const person of snapshot.persons) {
    if (person.plannedJh === null) {
      assert.equal(person.doneJh, null, person.id);
      continue;
    }
    withPlan++;
    assert.ok(person.plannedJh + 0.01 >= (demand.get(person.id) ?? 0), person.id);
    assert.ok(person.doneJh !== null && person.doneJh <= person.plannedJh + 0.01, person.id);
  }
  assert.ok(withPlan >= snapshot.persons.length * 0.8, String(withPlan));
  assert.ok(withPlan < snapshot.persons.length, "a few persons are absent from the plan de charge");
});
