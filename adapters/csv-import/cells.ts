// Shared cell readers for the contract parsers: French amount and date
// cells with their anomalies aggregated into a tallies map (tallies.ts).

import { parseFrenchAmount, parseFrenchDate } from "./values.ts";
import { tallyInto } from "./tallies.ts";
import type { Tally } from "./tallies.ts";

/**
 * Reads an amount cell (k€ or j.h): empty -> null; unreadable -> null +
 * tally; a unit written in the cell and negative values are tallied.
 * Inputs: the raw cell, its column label, the 1-based line, the tallies.
 * Outputs: the number or null. Failure modes: none.
 */
export function amountCell(
  raw: string, column: string, line: number, tallies: Map<string, Tally>,
): number | null {
  const parsed = parseFrenchAmount(raw);
  if (parsed.kind === "empty") return null;
  if (parsed.kind === "invalid") {
    tallyInto(tallies, `« ${column} » illisible`, line);
    return null;
  }
  if (parsed.unit !== undefined) tallyInto(tallies, `« ${column} » : unité écrite dans la cellule`, line);
  if (parsed.value < 0) tallyInto(tallies, `« ${column} » négatif`, line);
  return parsed.value;
}

/**
 * Reads a plain date cell: a dated value -> ISO date (serial reads
 * tallied); empty -> null; anything else -> null + tally.
 * Inputs: the raw cell, its column label, the 1-based line, the tallies.
 * Outputs: the ISO date or null. Failure modes: none.
 */
export function dateCell(
  raw: string, column: string, line: number, tallies: Map<string, Tally>,
): string | null {
  const parsed = parseFrenchDate(raw);
  if (parsed.kind === "date") {
    if (parsed.via === "serial") tallyInto(tallies, `« ${column} » lu comme numéro de série Excel`, line);
    return parsed.iso;
  }
  if (parsed.kind !== "empty") tallyInto(tallies, `« ${column} » illisible`, line);
  return null;
}
