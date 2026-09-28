// Working days left in the exercise (ADR 048): weekdays minus the French
// public holidays, leave not deducted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDateOf, easterSunday, frenchHolidays, workingDaysLeft } from "./workdays.ts";

test("easterSunday: the Gregorian computus on known years", () => {
  const cases: [number, number, number][] = [[2024, 3, 31], [2025, 4, 20], [2026, 4, 5], [2027, 3, 28], [2038, 4, 25]];
  for (const [year, month, day] of cases) assert.deepEqual(easterSunday(year), { year, month, day }, String(year));
});

test("frenchHolidays: eleven days, the moving ones from Easter", () => {
  const days = frenchHolidays(2026);
  assert.equal(days.size, 11);
  for (const [month, day] of [[4, 6], [5, 14], [5, 25], [7, 14], [12, 25]]) {
    assert.ok(days.has(Date.UTC(2026, month! - 1, day)), `${day}/${month}`);
  }
});

test("workingDaysLeft: the RSP of 1 October 2026 reads 64 days to the 31st of December", () => {
  assert.equal(workingDaysLeft({ year: 2026, month: 10, day: 1 }, 2026), 64);
  assert.equal(workingDaysLeft({ year: 2026, month: 12, day: 25 }, 2026), 4, "a holiday is not a working day");
  assert.equal(workingDaysLeft({ year: 2026, month: 12, day: 31 }, 2026), 1, "the last day counts");
});

test("workingDaysLeft: a year in preparation reads its whole year, a closed one reads nothing", () => {
  const whole = workingDaysLeft({ year: 2027, month: 1, day: 1 }, 2027);
  assert.equal(whole, 254, "261 weekdays minus 7 weekday holidays");
  assert.equal(workingDaysLeft({ year: 2026, month: 12, day: 15 }, 2027), whole);
  assert.equal(workingDaysLeft({ year: 2027, month: 1, day: 5 }, 2026), 0);
});

test("calendarDateOf: the local calendar day of an instant", () => {
  assert.deepEqual(calendarDateOf(new Date(2026, 9, 1, 10, 30).getTime()), { year: 2026, month: 10, day: 1 });
});
