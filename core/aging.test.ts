import { test } from "node:test";
import assert from "node:assert/strict";
import { ageLabel, agingStep, daysInColumn, daysSince, isAndon, isHotAge, isStale } from "./aging.ts";
import { testCard, testConfig } from "./test-helpers.ts";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const CONFIG = testConfig();

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

test("daysSince: whole days, clamped at zero, robust to bad input", () => {
  assert.equal(daysSince(daysAgo(3), NOW), 3);
  assert.equal(daysSince(NOW.toISOString(), NOW), 0);
  assert.equal(daysSince(daysAgo(-2), NOW), 0); // future
  assert.equal(daysSince("pas-une-date", NOW), 0);
  assert.equal(daysSince(new Date(NOW.getTime() - 86_400_000 * 1.9).toISOString(), NOW), 1);
});

test("agingStep crosses one step per threshold (table)", () => {
  const cases: [number, number][] = [
    [0, 0], [6, 0], [7, 1], [20, 1], [21, 2], [44, 2], [45, 3], [89, 3], [90, 4], [400, 4],
  ];
  for (const [days, expected] of cases) {
    assert.equal(agingStep(days, CONFIG), expected, `${days} jours`);
  }
});

test("ageLabel: days, then weeks, then months (table)", () => {
  const cases: [number, string][] = [
    [0, "0j"], [3, "3j"], [13, "13j"], [14, "2s"], [21, "3s"], [59, "8s"], [60, "2m"], [200, "7m"],
  ];
  for (const [days, expected] of cases) {
    assert.equal(ageLabel(days), expected, `${days} jours`);
  }
});

test("daysInColumn reads enteredColumnAt", () => {
  const state = { ...testCard(), enteredColumnAt: daysAgo(12) };
  assert.equal(daysInColumn(state, NOW), 12);
});

test("isHotAge: alerts from the second-to-last threshold (table)", () => {
  const cases: [number, boolean][] = [
    [0, false], [44, false], [45, true], [90, true], [200, true],
  ];
  for (const [days, expected] of cases) {
    assert.equal(isHotAge(days, CONFIG), expected, `${days} jours`);
  }
  const singleStep = { ...CONFIG, agingStepsDays: [10] };
  assert.equal(isHotAge(9, singleStep), false);
  assert.equal(isHotAge(10, singleStep), true);
});

test("isStale: beyond the last aging step only", () => {
  assert.equal(isStale({ ...testCard(), enteredColumnAt: daysAgo(91) }, CONFIG, NOW), true);
  assert.equal(isStale({ ...testCard(), enteredColumnAt: daysAgo(90) }, CONFIG, NOW), false);
});

test("isAndon: blocked strictly beyond the threshold", () => {
  const blocked = (since: string | null, isBlocked = true) => ({
    ...testCard({ blocked: isBlocked, blockedSince: since }),
    enteredColumnAt: daysAgo(30),
  });
  assert.equal(isAndon(blocked(daysAgo(6)), CONFIG, NOW), true);
  assert.equal(isAndon(blocked(daysAgo(5)), CONFIG, NOW), false);
  assert.equal(isAndon(blocked(null), CONFIG, NOW), false);
  assert.equal(isAndon(blocked(daysAgo(10), false), CONFIG, NOW), false);
});
