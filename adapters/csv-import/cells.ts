// Shared cell readers for the contract parsers: French amount and date
// cells with their anomalies aggregated into a tallies map (tallies.ts).

import { parseFrenchAmount, parseFrenchDate } from "./values.ts";
import { sampleOf } from "./cell-sample.ts";
import { tallyInto } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { ImportReport } from "./report.ts";

/**
 * The words that mark an ambiguous-separator tally (ADR 056): the readers
 * emit their tallies as signalements; promoteAmbiguous moves these ones to
 * the douteux, where a possible 1000× error belongs.
 */
export const AMBIGUOUS_MARK = "séparateur ambigu";

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
    tallyInto(tallies, `« ${column} » illisible`, line, sampleOf(raw));
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
  if (parsed.kind !== "empty") tallyInto(tallies, `« ${column} » illisible`, line, sampleOf(raw));
  return null;
}

/**
 * Reads a money cell into k€: a value written in euros (« 120 500 € »)
 * is divided by 1000 and tallied; « k€ », « ke » or no unit is taken as k€.
 * Empty -> null; unreadable -> null + tally; negatives tallied; a lone
 * comma followed by three digits (« 1,035 », « 120,500 € ») keeps the
 * French reading and is tallied under AMBIGUOUS_MARK (ADR 056).
 * Inputs: the raw cell, its column label, the 1-based line, the tallies.
 * Outputs: the k€ amount or null. Failure modes: none.
 */
export function moneyCell(
  raw: string, column: string, line: number, tallies: Map<string, Tally>,
): number | null {
  const parsed = parseFrenchAmount(raw);
  if (parsed.kind === "empty") return null;
  if (parsed.kind === "invalid") {
    tallyInto(tallies, `« ${column} » illisible`, line, sampleOf(raw));
    return null;
  }
  if (parsed.ambiguous !== undefined) {
    tallyInto(tallies, `« ${column} » : ${AMBIGUOUS_MARK} — lu à la française (virgule décimale), à vérifier : mille fois plus en lecture anglaise`, line, sampleOf(raw));
  }
  let value = parsed.value;
  if (parsed.unit !== undefined && /^(€|euros?)$/i.test(parsed.unit)) {
    value = Math.round(value) / 1000;
    tallyInto(tallies, `« ${column} » en euros — converti en k€`, line);
  }
  if (value < 0) tallyInto(tallies, `« ${column} » négatif`, line);
  return value;
}

/**
 * Moves the ambiguous-separator signalements (AMBIGUOUS_MARK) to the
 * douteux, file, lines and column kept (ADR 056: a « 1,035 » may be 1 035).
 * Input: the report, once every reader has run. Output: none (mutates the
 * report). Failure modes: none.
 */
export function promoteAmbiguous(report: ImportReport): void {
  const ambiguous = report.warnings.filter((w) => w.message.includes(AMBIGUOUS_MARK));
  if (ambiguous.length === 0) return;
  report.warnings = report.warnings.filter((w) => !w.message.includes(AMBIGUOUS_MARK));
  for (const w of ambiguous) report.doubtful.push({ file: w.file ?? "?", question: w.message });
}
