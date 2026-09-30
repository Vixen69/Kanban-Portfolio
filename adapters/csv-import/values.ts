// French-flavored cell parsing for the PPM exports: amounts with comma
// decimals and space thousand separators, dates in FR formats or Excel
// serial numbers, milestones sometimes filled with "oui"/"x" (or Excel's
// VRAI/FAUX booleans) instead of a date (docs/IMPORT-MAPPING.md « Nombres
// et dates à la française »). Nothing throws: every outcome is a typed
// case the caller reports.

import { normalizeLabel } from "./normalize.ts";
import { readNumber } from "./numbers.ts";

/** Outcome of parsing an amount cell. */
export type ParsedAmount =
  | { kind: "value"; value: number; unit?: string; ambiguous?: { alternative: number } }
  | { kind: "empty" }
  | { kind: "invalid"; raw: string };

const FORMULA_ERRORS = ["#ref!", "#n/a", "#div/0!", "#valeur!", "#nom?", "#value!", "#name?"];
// Every blank goes, visible or not: spaces, tabs, NBSP, narrow NBSP, the
// Unicode spaces, zero-width space, BOM (September SP cells still failed
// after « k » was accepted — something invisible sat in « 501 k »).
const BLANKS = /[\s ­  -​  　﻿]/g;
// Units seen after the figure: € / k€, « eur », « ke » (the August SP
// export's k€) and a bare « k » (the September SP export: « 501 k »); a
// currency before it is the en-US rendering (« €1,234.50 », ADR 056).
const SUFFIX_UNIT = /(k?€|k?eur(?:os?)?|ke|k)$/i;
const PREFIX_UNIT = /^(k?€|eur)/i;

// Sign, currency prefix, unit suffix and accounting parentheses around the
// figure: the compact number left, whether it is negated, the unit written.
function stripDecorations(compact: string): { core: string; negated: boolean; unit: string | null } {
  const paren = compact.match(/^\((.*)\)$/);
  let body = paren === null ? compact : (paren[1] ?? "");
  const sign = body.startsWith("-") || body.startsWith("+") ? body.slice(0, 1) : "";
  body = body.slice(sign.length);
  const prefix = body.match(PREFIX_UNIT);
  if (prefix !== null) body = body.slice(prefix[0].length);
  const suffix = prefix === null ? body.match(SUFFIX_UNIT) : null;
  if (suffix !== null) body = body.slice(0, -suffix[0].length);
  const unit = prefix?.[0] ?? suffix?.[0] ?? null;
  return { core: (sign === "-" ? "-" : "") + body, negated: paren !== null, unit };
}

/**
 * Parses an amount cell, French first, whatever the converter's locale.
 * Inputs: the raw cell text.
 * Outputs: value (comma or dot decimals, space/NBSP thousand separators;
 * en-US « 1,234.50 », « 1.234,50 », scientific « 1,2345E+03 » and
 * accounting negatives « (1 234,50 €) » since ADR 056; a stray unit like
 * « € »/« k€ »/« ke »/« k » after the figure, or a currency before it, is
 * stripped and kept in `unit` so the caller can signal it — the column's
 * unit is the contract's, never the cell's; `ambiguous` carries the
 * thousands reading of a lone comma + three digits, « 1,035 », whose
 * French reading 1.035 is the value), empty (blank cell), or invalid
 * (dashes, N/A, question marks, formula errors, anything unreadable).
 * Negative values are returned as values; flagging them is the caller's.
 * Failure modes: none.
 */
export function parseFrenchAmount(raw: string): ParsedAmount {
  const cell = raw.trim();
  if (cell === "") return { kind: "empty" };
  const lowered = cell.toLowerCase();
  if (["-", "—", "n/a", "na", "?"].includes(lowered) || FORMULA_ERRORS.includes(lowered)) {
    return { kind: "invalid", raw: cell };
  }
  const { core, negated, unit } = stripDecorations(cell.replace(BLANKS, ""));
  const reading = readNumber(core);
  if (reading === null || (negated && core.startsWith("-"))) return { kind: "invalid", raw: cell };
  const flip = (n: number): number => (negated && n !== 0 ? -n : n);
  const result: ParsedAmount = { kind: "value", value: flip(reading.value) };
  if (unit !== null) result.unit = unit;
  if (reading.ambiguous !== undefined) result.ambiguous = { alternative: flip(reading.ambiguous.alternative) };
  return result;
}

/**
 * Reads the year of an « Année » cell whatever its rendering (ADR 056):
 * « 2026 », « 2 026 », « 2026,00 », « 2,026 » / « 2.026 » (a thousands
 * separator — no year reads 2.026), a date « 01/01/2026 » or its Excel
 * serial number.
 * Input: the raw cell. Output: the year (1990–2100), null when the cell
 * is empty or holds no plausible year. Failure modes: none.
 */
export function parseYearCell(raw: string): number | null {
  const plausible = (n: number | undefined): n is number => n !== undefined && Number.isInteger(n) && n >= 1990 && n <= 2100;
  const compact = raw.replace(BLANKS, "");
  if (/^\d[.,]\d{3}$/.test(compact)) {
    const year = Number(compact.replace(/[.,]/, ""));
    return plausible(year) ? year : null;
  }
  const amount = parseFrenchAmount(raw);
  if (amount.kind === "value" && amount.unit === undefined && plausible(amount.value)) return amount.value;
  const date = parseFrenchDate(raw);
  const year = date.kind === "date" ? Number(date.iso.slice(0, 4)) : undefined;
  return plausible(year) ? year : null;
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

// « o »/« n » are how the August ProjetsJalons export writes oui/non.
const YES_FLAGS = ["oui", "o", "x", "vrai", "true", "ok", "yes", "y"];
const NO_FLAGS = ["non", "n", "faux", "false", "no"];

/**
 * Parses a boolean-ish cell (Excel FR renders VRAI/FAUX; OUI/NON, 1/0 and
 * their English twins occur in the wild).
 * Inputs: the raw cell text. Outputs: true, false, null for an empty cell,
 * or "invalid" for anything else (the caller signals it).
 * Failure modes: none.
 */
export function parseFrenchBoolean(raw: string): boolean | null | "invalid" {
  const label = normalizeLabel(raw);
  if (label === "") return null;
  if (YES_FLAGS.includes(label) || label === "1") return true;
  if (NO_FLAGS.includes(label) || label === "0") return false;
  return "invalid";
}

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
