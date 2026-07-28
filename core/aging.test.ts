import { test } from "node:test";
import assert from "node:assert/strict";
import { ageCategory, ageLabel, daysInColumn, daysSince, decayAlpha, isAndon, isStale } from "./aging.ts";
import { testCard, testConfig } from "./test-helpers.ts";
import type { AgeCategory, AgeThresholds, CardState } from "./types.ts";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const CONFIG = testConfig();
const AGE = CONFIG.age; // { freshMaxDays: 7, recentMaxDays: 28, agingMaxDays: 60 }

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function state(overrides: Parameters<typeof testCard>[0] = {}, daysHere = 0): CardState {
  return { ...testCard(overrides), enteredColumnAt: daysAgo(daysHere), comments: [], archived: false };
}

function assertClose(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} au lieu de ${expected}`);
}

test("daysSince: whole days, clamped at zero, robust to bad input", () => {
  assert.equal(daysSince(daysAgo(3), NOW), 3);
  assert.equal(daysSince(NOW.toISOString(), NOW), 0);
  assert.equal(daysSince(daysAgo(-2), NOW), 0); // future
  assert.equal(daysSince("pas-une-date", NOW), 0);
  assert.equal(daysSince(new Date(NOW.getTime() - 86_400_000 * 1.9).toISOString(), NOW), 1);
});

test("daysInColumn reads enteredColumnAt", () => {
  assert.equal(daysInColumn(state({}, 12), NOW), 12);
});

test("ageCategory: boundaries at 7/28/60 inclusive (table)", () => {
  const cases: [number, AgeCategory][] = [
    [0, "fresh"], [7, "fresh"],
    [8, "recent"], [28, "recent"],
    [29, "aging"], [60, "aging"],
    [61, "stale"], [400, "stale"],
  ];
  for (const [days, expected] of cases) {
    assert.equal(ageCategory(days, AGE), expected, `${days} jours`);
  }
});

test("decayAlpha: silent through recent, 0.12->0.30 aging, capped 0.45 stale", () => {
  const cases: [number, number][] = [
    [0, 0], [7, 0], [28, 0], // fresh + recent stay flat
    [29, 0.12 + (1 / 32) * 0.18], // just past recentMaxDays
    [44, 0.21], // midpoint of the aging band
    [60, 0.3], // end of the aging band
    [105, 0.375], // halfway up the stale ramp (60 + 45 of 90)
    [150, 0.45], // end of the stale ramp (60 + 1.5 x 60)
    [500, 0.45], // capped
  ];
  for (const [days, expected] of cases) {
    assertClose(decayAlpha(days, AGE), expected, `${days} jours`);
  }
});

test("decayAlpha generalizes to non-default thresholds", () => {
  const age: AgeThresholds = { freshMaxDays: 5, recentMaxDays: 10, agingMaxDays: 20 };
  assertClose(decayAlpha(10, age), 0, "fin recent");
  assertClose(decayAlpha(15, age), 0.21, "milieu vieillit");
  assertClose(decayAlpha(20, age), 0.3, "fin vieillit");
  assertClose(decayAlpha(35, age), 0.375, "mi-rampe stagnant"); // ramp = 30
  assertClose(decayAlpha(50, age), 0.45, "plafond");
});

test("ageLabel: days, then weeks, then months (table)", () => {
  const cases: [number, string][] = [
    [0, "0j"], [3, "3j"], [13, "13j"], [14, "2s"], [21, "3s"], [59, "8s"], [60, "2m"], [200, "7m"],
  ];
  for (const [days, expected] of cases) {
    assert.equal(ageLabel(days), expected, `${days} jours`);
  }
});

test("isStale: strictly beyond agingMaxDays only", () => {
  assert.equal(isStale(state({}, 61), CONFIG, NOW), true);
  assert.equal(isStale(state({}, 60), CONFIG, NOW), false);
});

test("isAndon: blocked strictly beyond the threshold", () => {
  const blocked = (since: string | null, isBlocked = true): CardState =>
    state({ blocked: isBlocked, blockedSince: since }, 30);
  assert.equal(isAndon(blocked(daysAgo(6)), CONFIG, NOW), true);
  assert.equal(isAndon(blocked(daysAgo(5)), CONFIG, NOW), false);
  assert.equal(isAndon(blocked(null), CONFIG, NOW), false);
  assert.equal(isAndon(blocked(daysAgo(10), false), CONFIG, NOW), false);
});
