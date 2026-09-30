// The cells of a ProjetsJalons row (R7), split from jalons.ts to respect
// the 300-line file cap: whether a milestone is passed — the statut when
// filled, else the date against the reference day (ADR 058: the export's
// day), else the « franchi » cell — with the surveys and the count of the
// path that decided each cell. Pure.

import { normalizeLabel } from "./normalize.ts";
import { parseFrenchBoolean, parseFrenchDate } from "./values.ts";
import { tallyInto } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";

export type Milestone = "RDO" | "RDLI" | "RDR";

/** How many milestone cells each path decided — the report's self-diagnosis. */
export interface JalonsReading {
  statut: number;
  date: number;
  franchi: number;
}

/** What reading a row's milestone cells needs, and where it counts. */
export interface CellContext {
  match: HeaderMatch;
  /** The reference day (aaaa-mm-jj) a milestone date is compared with. */
  todayIso: string;
  franchiValues: Map<string, number>;
  statutValues: Map<string, number>;
  reading: JalonsReading;
  tallies: Map<string, Tally>;
}

/**
 * One cell of a ProjetsJalons row by canonical column, trimmed ("" when the
 * column is absent). Inputs: the context, the row, the column label.
 * Output: the text. Failure modes: none.
 */
export function cell(ctx: CellContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}


function surveyFranchi(ctx: CellContext, raw: string): void {
  const key = raw === "" ? "(vide)" : normalizeLabel(raw);
  ctx.franchiValues.set(key, (ctx.franchiValues.get(key) ?? 0) + 1);
}

// What a « franchi » cell says, without any signalement: true / false, or
// null when empty or unreadable.
function quietFlag(raw: string): boolean | null {
  const bool = parseFrenchBoolean(raw);
  if (bool !== "invalid") return bool;
  const date = parseFrenchDate(raw);
  if (date.kind === "date" || date.kind === "flag") return true;
  return date.kind === "no" ? false : null;
}

/**
 * Whether one milestone of a row is passed: the statut cell decides when
 * filled (author, 2026-09-11); otherwise the date against the reference
 * day, then the « franchi » cell (the earlier rule). Surveys and counts
 * land in the context.
 * Inputs: the context, the row, the milestone. Output: passed or not.
 * Failure modes: none — anomalies are tallied.
 */
export function passed(ctx: CellContext, row: CsvRow, milestone: Milestone): boolean {
  const statut = cell(ctx, row, `${milestone} (Statut)`);
  if (statut !== "") return byStatut(ctx, row, milestone, statut);
  return byDate(ctx, row, milestone);
}

// « Approuvé » = passed, any other statut = not passed (surveyed). The date
// and the « franchi » cell only confirm: a disagreement is signaled, the
// statut wins.
function byStatut(ctx: CellContext, row: CsvRow, milestone: Milestone, statut: string): boolean {
  const key = normalizeLabel(statut);
  ctx.statutValues.set(key, (ctx.statutValues.get(key) ?? 0) + 1);
  ctx.reading.statut++;
  const approved = key === "approuve";
  const dated = parseFrenchDate(cell(ctx, row, milestone));
  if (dated.kind === "date" && (dated.iso <= ctx.todayIso) !== approved) {
    tallyInto(ctx.tallies,
      `« ${milestone} » ${dated.iso <= ctx.todayIso ? "passé" : "à venir"} mais statut « ${statut} » — le statut fait foi`, row.line);
  }
  const flagRaw = cell(ctx, row, `${milestone} franchi`);
  surveyFranchi(ctx, flagRaw);
  const flag = quietFlag(flagRaw);
  if (flag !== null && flag !== approved) {
    tallyInto(ctx.tallies, `« ${milestone} franchi » dit ${flag ? "oui" : "non"} mais statut « ${statut} » — le statut fait foi`, row.line);
  }
  return approved;
}

// No statut: the milestone's date column decides (passed = at or before
// the audit day); the « franchi » cell is the fallback when that date is
// missing or unreadable, and a disagreement is signaled — the date wins.
function byDate(ctx: CellContext, row: CsvRow, milestone: Milestone): boolean {
  const dated = parseFrenchDate(cell(ctx, row, milestone));
  if (dated.kind !== "date") {
    if (dated.kind === "invalid") {
      tallyInto(ctx.tallies, `« ${milestone} » illisible — « ${milestone} franchi » fait foi`, row.line, dated.raw.slice(0, 40));
    }
    return franchi(ctx, row, `${milestone} franchi`);
  }
  ctx.reading.date++;
  const flagRaw = cell(ctx, row, `${milestone} franchi`);
  surveyFranchi(ctx, flagRaw);
  const passedByDate = dated.iso <= ctx.todayIso;
  const flag = quietFlag(flagRaw);
  if (flag !== null && flag !== passedByDate) {
    tallyInto(ctx.tallies,
      `« ${milestone} » ${passedByDate ? "passé" : "à venir"} mais « ${milestone} franchi » dit ${flag ? "oui" : "non"} — la date fait foi`,
      row.line);
  }
  return passedByDate;
}

// A « franchi » cell (last fallback): booleans (VRAI/FAUX, oui/non, o/n,
// 1/0) as they are; a date counts as passed (a future one is signaled);
// « x » counts as passed; empty = not passed; anything else is unreadable
// = not passed.
function franchi(ctx: CellContext, row: CsvRow, column: string): boolean {
  const raw = cell(ctx, row, column);
  surveyFranchi(ctx, raw);
  ctx.reading.franchi++;
  const bool = parseFrenchBoolean(raw);
  if (bool === null) return false;
  if (bool !== "invalid") return bool;
  const date = parseFrenchDate(raw);
  if (date.kind === "date") {
    if (date.iso > ctx.todayIso) tallyInto(ctx.tallies, `« ${column} » daté dans le futur — compté franchi`, row.line);
    return true;
  }
  if (date.kind === "flag") return true;
  if (date.kind === "no") return false;
  tallyInto(ctx.tallies, `« ${column} » illisible — compté non franchi`, row.line);
  return false;
}
