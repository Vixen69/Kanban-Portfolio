import { test } from "node:test";
import assert from "node:assert/strict";
import { createFixtures } from "./index.ts";
import { generatePortfolio } from "./generate.ts";
import { testConfig } from "../../core/test-helpers.ts";
import { foldEvents, toCard } from "../../core/state.ts";
import { InMemoryEventStore } from "../../core/events.ts";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const CONFIG = testConfig();

test("generation is deterministic for a given seed", () => {
  const a = generatePortfolio(CONFIG, NOW, 42);
  const b = generatePortfolio(CONFIG, NOW, 42);
  assert.deepEqual(JSON.parse(JSON.stringify(a.subjects)), JSON.parse(JSON.stringify(b.subjects)));
  assert.deepEqual(a.events, b.events);
  const c = generatePortfolio(CONFIG, NOW, 43);
  assert.notDeepEqual(a.subjects, c.subjects);
});

test("every subject references known lanes, columns and domains", () => {
  const { subjects } = generatePortfolio(CONFIG, NOW);
  const laneIds = new Set(CONFIG.lanes.map((l) => l.id));
  const columnIds = new Set(CONFIG.columns.map((c) => c.id));
  const domains = new Set(CONFIG.domains);
  for (const subject of subjects) {
    assert.ok(laneIds.has(subject.laneId), subject.id);
    assert.ok(columnIds.has(subject.columnId), subject.id);
    assert.ok(domains.has(subject.domain), subject.id);
    assert.equal(subject.source, "fixtures");
  }
});

test("subjects carry criticality, type and codename (design vocabulary)", () => {
  const { subjects } = generatePortfolio(CONFIG, NOW);
  const typeIds = new Set(CONFIG.types.map((type) => type.id));
  const crits = new Set(subjects.map((subject) => subject.criticality));
  for (const subject of subjects) {
    assert.match(subject.codename ?? "", /^PX\d{7}$/, subject.id);
    assert.ok(subject.typeId === null || typeIds.has(subject.typeId), subject.id);
  }
  assert.ok(crits.has("top") && crits.has("major") && crits.has("normal"), [...crits].join(","));
  const tops = subjects.filter((subject) => subject.criticality === "top").length;
  assert.ok(tops > 0 && tops < subjects.length / 4, `tops: ${tops}`);
});

test("dependencies reference existing other subjects", () => {
  const { subjects } = generatePortfolio(CONFIG, NOW);
  const ids = new Set(subjects.map((s) => s.id));
  for (const subject of subjects) {
    for (const dep of subject.dependencies) {
      assert.ok(ids.has(dep), `${subject.id} -> ${dep}`);
      assert.notEqual(dep, subject.id);
    }
  }
});

test("per-card history starts with created and is chronological", () => {
  const { events } = generatePortfolio(CONFIG, NOW);
  const byCard = new Map<string, typeof events>();
  for (const event of events) {
    const list = byCard.get(event.cardId) ?? [];
    list.push(event);
    byCard.set(event.cardId, list);
  }
  for (const [cardId, list] of byCard) {
    assert.equal(list[0]?.type, "created", cardId);
    for (let i = 1; i < list.length; i++) {
      assert.ok((list[i - 1]?.ts as string) <= (list[i]?.ts as string), cardId);
    }
  }
});

test("folding the seeded events reproduces every subject's position", () => {
  const { dataSource, seedEvents } = createFixtures(CONFIG, NOW);
  const store = new InMemoryEventStore();
  for (const input of seedEvents) store.append(input);
  const subjects = dataSource.listSubjects();
  const cards = subjects.map((s) => toCard(s, dataSource.getFinancials(s.id)));
  const states = foldEvents(cards, store.list());
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  for (const state of states) {
    const subject = subjectById.get(state.id);
    assert.equal(state.columnId, subject?.columnId, state.id);
    assert.equal(state.laneId, subject?.laneId, state.id);
  }
});

test("blocked cards exist, carry a reason, and stay in their column", () => {
  const { dataSource, seedEvents } = createFixtures(CONFIG, NOW);
  const store = new InMemoryEventStore();
  for (const input of seedEvents) store.append(input);
  const cards = dataSource.listSubjects().map((s) => toCard(s, dataSource.getFinancials(s.id)));
  const states = foldEvents(cards, store.list());
  const blocked = states.filter((s) => s.blocked);
  // The 3-column test topology only reaches the quotas of column indexes
  // 1 and 2 (2 + 3 cards); the 7-column real config is covered by the
  // acceptance test.
  assert.ok(blocked.length >= 4, `bloques: ${blocked.length}`);
  for (const card of blocked) {
    assert.ok(card.blockedReason, card.id);
    assert.ok(card.blockedSince, card.id);
  }
});

test("financials are consistent and unknown ids return null", () => {
  const { dataSource } = createFixtures(CONFIG, NOW);
  assert.equal(dataSource.getFinancials("GHOST"), null);
  for (const subject of dataSource.listSubjects()) {
    const financials = dataSource.getFinancials(subject.id);
    if (financials === null) continue;
    assert.ok((financials.budget as number) > 0);
    assert.equal(financials.remaining, (financials.budget as number) - (financials.consumed as number));
  }
});

test("listSubjects returns defensive copies", () => {
  const { dataSource } = createFixtures(CONFIG, NOW);
  const first = dataSource.listSubjects()[0];
  assert.ok(first);
  first.title = "MUTATED";
  assert.notEqual(dataSource.listSubjects()[0]?.title, "MUTATED");
});
