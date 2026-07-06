// Event-model tests for the fixtures port: the design's movement history,
// blockages and comments must arrive as a per-card chronological stream of
// imported / moved / blocked / commented events that folds back to the
// exact snapshots.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { InMemoryEventStore, type CardEventInput } from "../../core/events.ts";
import { foldEvents, toCard } from "../../core/state.ts";
import { createFixtures } from "./index.ts";
import { FIXTURES_ACTOR, generatePortfolio } from "./generate.ts";
import { AGE_PROFILE, FLOW_ORDER } from "./distributions.ts";
import { COMMENTS, CP_NAMES } from "../../fixtures/dataset.ts";

const NOW = new Date("2026-07-06T12:00:00.000Z");
const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;
const PORTFOLIO = generatePortfolio(CONFIG, NOW);
const SUBJECT_BY_ID = new Map(PORTFOLIO.subjects.map((subject) => [subject.id, subject]));

function eventsOf(cardId: string): CardEventInput[] {
  return PORTFOLIO.events.filter((event) => event.cardId === cardId);
}

/** Timestamp of the card's entry into its current column (last position event). */
function entryTs(cardId: string): string {
  const positions = eventsOf(cardId).filter(
    (event) => event.type === "imported" || event.type === "moved",
  );
  return (positions[positions.length - 1] as CardEventInput).ts;
}

test("every card starts with one imported event into Demandes", () => {
  for (const subject of PORTFOLIO.subjects) {
    const events = eventsOf(subject.id);
    const imported = events.filter((event) => event.type === "imported");
    assert.equal(imported.length, 1, subject.id);
    const first = events[0] as CardEventInput;
    assert.equal(first.type, "imported", subject.id);
    assert.equal(first.toColumn, "demandes", subject.id);
    assert.equal(first.fromColumn, null, subject.id);
    assert.equal(first.payload["laneId"], subject.laneId, subject.id);
    assert.equal(first.actor, FIXTURES_ACTOR, subject.id);
    assert.equal(first.ts, subject.createdAt, subject.id);
  }
});

test("moved events walk the flow path up to the current column", () => {
  for (const subject of PORTFOLIO.subjects) {
    const moves = eventsOf(subject.id).filter((event) => event.type === "moved");
    const index = FLOW_ORDER.indexOf(subject.columnId);
    assert.ok(index >= 0, subject.id);
    assert.equal(moves.length, index, subject.id);
    moves.forEach((move, k) => {
      assert.equal(move.fromColumn, FLOW_ORDER[k], subject.id);
      assert.equal(move.toColumn, FLOW_ORDER[k + 1], subject.id);
      assert.equal(move.payload["laneId"], subject.laneId, subject.id);
      assert.equal(move.actor, FIXTURES_ACTOR, subject.id);
    });
  }
});

test("event timestamps are non-decreasing per card, all before now", () => {
  const nowIso = NOW.toISOString();
  for (const subject of PORTFOLIO.subjects) {
    const events = eventsOf(subject.id);
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1] as CardEventInput;
      const next = events[i] as CardEventInput;
      assert.ok(prev.ts <= next.ts, `${subject.id}: ${prev.type} > ${next.type}`);
    }
    for (const event of events) assert.ok(event.ts < nowIso, subject.id);
  }
});

test("age in column follows AGE_PROFILE; blocked cards respect the age floor", () => {
  const DAY_MS = 86_400_000;
  for (const subject of PORTFOLIO.subjects) {
    const days = Math.round((NOW.getTime() - Date.parse(entryTs(subject.id))) / DAY_MS);
    const [lo, hi] = AGE_PROFILE[subject.columnId] as [number, number];
    if (subject.blocked) {
      // Floor = rand(35, hi); rand(35, 28) degenerates to 29–35 for "done".
      const floor = subject.columnId === "done" ? 29 : 35;
      assert.ok(days >= floor, `${subject.id}: ${days}j bloqué < ${floor}j`);
      assert.ok(days <= Math.max(hi, 35), `${subject.id}: ${days}j > max`);
    } else {
      assert.ok(days >= lo && days <= hi, `${subject.id}: ${days}j hors [${lo}, ${hi}]`);
    }
  }
});

test("the seed reproduces the design prototype's per-card ages (S002)", () => {
  // Regression pin for the RNG alignment with design/data.jsx (the design
  // draws an actor for the last transition; the port burns that draw).
  // S002 entered « actifs » 54 days before NOW in the validated prototype.
  assert.equal(entryTs("S002"), "2026-05-13T12:00:00.000Z");
});

test("blocked cards carry exactly one blocked event, after column entry", () => {
  for (const subject of PORTFOLIO.subjects) {
    const blockedEvents = eventsOf(subject.id).filter((event) => event.type === "blocked");
    if (!subject.blocked) {
      assert.equal(blockedEvents.length, 0, subject.id);
      continue;
    }
    assert.equal(blockedEvents.length, 1, subject.id);
    const event = blockedEvents[0] as CardEventInput;
    assert.equal(event.payload["reason"], subject.blockedReason, subject.id);
    assert.equal(event.ts, subject.blockedSince, subject.id);
    assert.equal(event.actor, FIXTURES_ACTOR, subject.id);
    assert.ok(event.ts > entryTs(subject.id), subject.id);
  }
});

test("the seed only contains imported, moved, blocked and commented events", () => {
  const types = new Set(PORTFOLIO.events.map((event) => event.type));
  for (const type of types) {
    assert.ok(["imported", "moved", "blocked", "commented"].includes(type), type);
  }
});

test("comments: 0 to 2 commented events per card, pooled text, CP author", () => {
  let withComments = 0;
  for (const subject of PORTFOLIO.subjects) {
    const comments = eventsOf(subject.id).filter((event) => event.type === "commented");
    assert.ok(comments.length <= 2, subject.id);
    if (comments.length > 0) withComments++;
    for (const comment of comments) {
      assert.ok(COMMENTS.includes(comment.payload["text"] as string), subject.id);
      assert.ok(CP_NAMES.includes(comment.actor), subject.id);
      assert.ok(comment.ts >= subject.createdAt, subject.id);
    }
  }
  assert.ok(withComments > 0, "aucun sujet commenté");
  assert.ok(withComments < PORTFOLIO.subjects.length, "tous les sujets commentés");
});

test("folding the seeded events reproduces every snapshot", () => {
  const { dataSource, seedEvents } = createFixtures(CONFIG, NOW);
  const store = new InMemoryEventStore();
  for (const input of seedEvents) store.append(input);
  const cards = dataSource
    .listSubjects()
    .map((subject) => toCard(subject, dataSource.getFinancials(subject.id)));
  const states = foldEvents(cards, store.list());
  assert.equal(states.length, PORTFOLIO.subjects.length);
  for (const state of states) {
    const subject = SUBJECT_BY_ID.get(state.id);
    assert.ok(subject, state.id);
    assert.equal(state.columnId, subject.columnId, state.id);
    assert.equal(state.laneId, subject.laneId, state.id);
    assert.equal(state.blocked, subject.blocked, state.id);
    assert.equal(state.blockedReason, subject.blockedReason, state.id);
    assert.equal(state.blockedSince, subject.blockedSince, state.id);
    assert.equal(state.enteredColumnAt, entryTs(state.id), state.id);
    const commented = eventsOf(state.id).filter((event) => event.type === "commented");
    assert.equal(state.comments.length, commented.length, state.id);
    const financials = PORTFOLIO.financialsById.get(state.id);
    assert.equal(state.budgetEstimated, financials?.budget ?? null, state.id);
    assert.equal(state.budgetConsumed, financials?.consumed ?? null, state.id);
  }
});
