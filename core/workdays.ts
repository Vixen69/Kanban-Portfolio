// Working days left in the exercise (ADR 048): the divisor that turns the
// engaged reste à faire into « ≈ N personnes d'ici le 31/12 ». Weekdays
// minus the French public holidays; leave is NOT deducted (said on screen).
// Timezone-free: every date is handled as a UTC calendar day.

/** A calendar day, month 1–12. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const DAY_MS = 86_400_000;

function utc(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

/**
 * Easter Sunday of a year (anonymous Gregorian algorithm, Meeus/Jones/Butcher).
 * Input: the year. Output: the date. Failure: none.
 */
export function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

/**
 * The French public holidays of a year, as UTC day timestamps: the eight
 * fixed ones plus Easter Monday, Ascension and Whit Monday.
 * Input: the year. Output: the set of timestamps. Failure: none.
 */
export function frenchHolidays(year: number): Set<number> {
  const fixed: [number, number][] = [[1, 1], [5, 1], [5, 8], [7, 14], [8, 15], [11, 1], [11, 11], [12, 25]];
  const days = new Set(fixed.map(([month, day]) => utc({ year, month, day })));
  const easter = utc(easterSunday(year));
  for (const offset of [1, 39, 50]) days.add(easter + offset * DAY_MS);
  return days;
}

/**
 * The working days from a day (inclusive) to 31 December of the exercise
 * (inclusive): weekdays minus the French public holidays. The count starts
 * at the later of the day and 1 January of the exercise, so a year still in
 * preparation reads its whole year.
 * Inputs: today, the exercise year. Output: the count, 0 when today is past
 * the exercise. Failure: none.
 */
export function workingDaysLeft(today: CalendarDate, exerciseYear: number): number {
  const start = Math.max(utc(today), utc({ year: exerciseYear, month: 1, day: 1 }));
  const end = utc({ year: exerciseYear, month: 12, day: 31 });
  const holidays = frenchHolidays(exerciseYear);
  let count = 0;
  for (let day = start; day <= end; day += DAY_MS) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(day)) count++;
  }
  return count;
}

/**
 * The local calendar day of an instant (the shared clock).
 * Input: epoch milliseconds. Output: the CalendarDate. Failure: none.
 */
export function calendarDateOf(epochMs: number): CalendarDate {
  const date = new Date(epochMs);
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}
