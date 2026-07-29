// French-flavored cell parsing for the PPM exports: amounts with comma
// decimals and space thousand separators, dates in FR formats or Excel
// serial numbers, milestones sometimes filled with "oui"/"x" (or Excel's
// VRAI/FAUX booleans) instead of a date (docs/IMPORT-MAPPING.md « Nombres
// et dates à la française »). Nothing throws: every outcome is a typed
// case the caller reports.

import { normalizeLabel } from "./normalize.ts";

/** Outcome of parsing an amount cell. */
export type ParsedAmount =
  | { kind: "value"; value: number; unit?: string }
  | { kind: "empty" }
  | { kind: "invalid"; raw: string };

const FORMULA_ERRORS = ["#ref!", "#n/a", "#div/0!", "#valeur!", "#nom?", "#value!", "#name?"];
const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);

/**
 * Parses a French-formatted amount cell.
 * Inputs: the raw cell text.
 * Outputs: value (comma or dot decimals, space/NBSP thousand separators;
 * a stray unit suffix like « € »/« k€ » is stripped, kept in `unit` so the
 * caller can signal it — the column's unit is the contract's, never the
 * cell's), empty (blank cell), or invalid (dashes, N/A, question marks,
 * formula errors, anything unreadable). Negative values are returned as
 * values; flagging them is the caller's decision.
 * Failure modes: none.
 */
export function parseFrenchAmount(raw: string): ParsedAmount {
  const cell = raw.trim();
  if (cell === "") return { kind: "empty" };
  const lowered = cell.toLowerCase();
  if (["-", "—", "n/a", "na", "?"].includes(lowered) || FORMULA_ERRORS.includes(lowered)) {
    return { kind: "invalid", raw: cell };
  }
  const compact = cell.replaceAll(NBSP, "").replaceAll(NNBSP, "").replaceAll(" ", "");
  const unitMatch = compact.match(/(k?€|eur)$/i);
  const cleaned = (unitMatch === null ? compact : compact.slice(0, -unitMatch[0].length))
    .replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { kind: "invalid", raw: cell };
  const result: ParsedAmount = { kind: "value", value: Number(cleaned) };
  if (unitMatch !== null) result.unit = unitMatch[0];
  return result;
}

/** Outcome of parsing a date or milestone cell. */
export type ParsedDate =
  | { kind: "date"; iso: string; via?: "serial" }
  | { kind: "flag" }
  | { kind: "no" }
  | { kind: "empty" }
  | { kind: "invalid"; raw: string };

// Excel serial day 1 = 1900-01-01, with the historic 1900 leap-year bug —
// the usual epoch trick: days since 1899-12-30.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

const YES_FLAGS = ["oui", "x", "vrai", "true", "ok"];
const NO_FLAGS = ["non", "faux", "false"];

/**
 * Parses a date cell: FR formats (jj/mm/aaaa, jj-mm-aaaa, jj.mm.aaaa, with
 * an optional trailing hh:mm[:ss]; 2-digit years pivot at 70 — 70-99 map
 * to 19xx, 00-69 to 20xx), ISO (aaaa-mm-jj, optional time), or an Excel
 * serial number (plausible range 1990-2100, reported `via: "serial"` so
 * the caller can signal the interpretation). "oui"/"x"/"vrai" yield
 * `flag` — a milestone asserted without a date; "non"/"faux" yield `no` —
 * an explicit boolean negative (Excel FR renders VRAI/FAUX).
 * Inputs: the raw cell text. Outputs: one of the five typed cases; the
 * calendar is validated (31/02 is invalid).
 * Failure modes: none.
 */
export function parseFrenchDate(raw: string): ParsedDate {
  const cell = raw.trim();
  if (cell === "") return { kind: "empty" };
  const label = normalizeLabel(cell);
  if (YES_FLAGS.includes(label)) return { kind: "flag" };
  if (NO_FLAGS.includes(label)) return { kind: "no" };
  const fr = cell.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})( \d{1,2}:\d{2}(:\d{2})?)?$/);
  if (fr !== null) {
    const two = fr[3]?.length === 2 ? Number(fr[3]) : null;
    const year = two === null ? Number(fr[3]) : two >= 70 ? 1900 + two : 2000 + two;
    return calendarDate(year, Number(fr[2]), Number(fr[1]), cell);
  }
  const iso = cell.match(/^(\d{4})-(\d{2})-(\d{2})($|[T ])/);
  if (iso !== null) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), cell);
  if (/^\d{4,6}$/.test(cell)) {
    const ms = EXCEL_EPOCH_MS + Number(cell) * 86_400_000;
    const date = new Date(ms);
    const year = date.getUTCFullYear();
    if (year >= 1990 && year <= 2100) {
      return { kind: "date", iso: date.toISOString().slice(0, 10), via: "serial" };
    }
  }
  return { kind: "invalid", raw: cell };
}

// Rejects impossible calendar dates instead of letting Date roll them over.
function calendarDate(year: number, month: number, day: number, raw: string): ParsedDate {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!valid || year < 1990 || year > 2100) return { kind: "invalid", raw };
  return { kind: "date", iso: date.toISOString().slice(0, 10) };
}
