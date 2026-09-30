// The numeric core of a cell, whatever the locale of the machine that
// converted the workbook (ADR 056, author 2026-09-30): the RUNBOOK's
// conversion saves cells « as shown », so the same export can arrive
// French (« 1 234,50 »), en-US (« 1,234.50 ») or with a scientific
// notation. Every reading that is unambiguous is accepted; the one that is
// not — a lone comma followed by exactly three digits (« 1,035 »: 1,035
// in French, 1 035 in English) — keeps the French reading and says so,
// so the caller can raise a douteux instead of a silent 1000× error.
// Pure and dependency-free; blanks and units are the caller's.

/** A number read from a cell's text, with the other reading when the separators are ambiguous. */
export interface NumberReading {
  value: number;
  /** Set only for a lone comma + three digits: the thousands (en-US) reading. */
  ambiguous?: { alternative: number };
}

const SCIENTIFIC = /^\d+(?:[.,]\d+)?e[+-]?\d+$/i;
const DIGITS = /^\d+$/;

// « 1,234,567 » (comma groups) or « 1.234.567 » (dot groups).
function isGrouped(text: string, separator: "," | "."): boolean {
  return (separator === "," ? /^\d{1,3}(?:,\d{3})+$/ : /^\d{1,3}(?:\.\d{3})+$/).test(text);
}

// Both separators present: the LAST one is the decimal mark, the other one
// must group the integer part by thousands (« 1,234.50 », « 1.234,50 »).
function readMixed(body: string): NumberReading | null {
  const at = Math.max(body.lastIndexOf(","), body.lastIndexOf("."));
  const group = body[at] === "," ? "." : ",";
  const integer = body.slice(0, at);
  const fraction = body.slice(at + 1);
  if (!DIGITS.test(fraction) || !isGrouped(integer, group)) return null;
  return { value: Number(`${integer.split(group).join("")}.${fraction}`) };
}

// One kind of separator. Several occurrences can only be thousands groups;
// a single one is the decimal mark (French comma, or a dot) — ambiguous
// when it is a comma followed by exactly three digits after a 1–3 digit
// integer that is not zero (« 0,125 » is never a thousands group).
function readSingleKind(body: string): NumberReading | null {
  const separator = body.includes(",") ? "," : ".";
  const parts = body.split(separator);
  if (parts.length > 2) return isGrouped(body, separator) ? { value: Number(parts.join("")) } : null;
  const [integer = "", fraction = ""] = parts;
  if (!DIGITS.test(integer) || !DIGITS.test(fraction)) return null;
  const value = Number(`${integer}.${fraction}`);
  if (separator === "," && /^[1-9]\d{0,2}$/.test(integer) && fraction.length === 3) {
    return { value, ambiguous: { alternative: Number(integer + fraction) } };
  }
  return { value };
}

/**
 * Reads the number of a compacted cell (no blanks, no unit, no
 * parentheses): digits with an optional leading sign, French or en-US
 * separators, or a scientific notation (« 1,2345E+03 »).
 * Input: the compact text. Output: the reading (with `ambiguous` for a
 * lone comma + three digits, French value kept), or null when the text is
 * not a number. Failure modes: none.
 */
export function readNumber(text: string): NumberReading | null {
  const negative = text.startsWith("-");
  const body = /^[+-]/.test(text) ? text.slice(1) : text;
  if (body === "") return null;
  let reading: NumberReading | null;
  if (DIGITS.test(body)) reading = { value: Number(body) };
  else if (SCIENTIFIC.test(body)) reading = { value: Number(body.replace(",", ".")) };
  else if (body.includes(",") && body.includes(".")) reading = readMixed(body);
  else reading = readSingleKind(body);
  if (reading === null || !Number.isFinite(reading.value)) return null;
  if (!negative) return reading;
  const signed: NumberReading = { value: reading.value === 0 ? 0 : -reading.value };
  if (reading.ambiguous !== undefined) signed.ambiguous = { alternative: -reading.ambiguous.alternative };
  return signed;
}
