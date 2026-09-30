// The COUT PREV reader's row pass (ADR 030/034/056 — split from couts.ts
// to respect the 300-line cap): each row is counted, its « Année » read
// whatever its rendering (« 2 026 », « 2026,00 », « 01/01/2026 ») and
// surveyed, its project facts kept for the order-free resolution
// (couts-facts.ts), its ME cells tested — an unreadable cell is « ni vide
// ni zéro », never a silent zero — and its « Charge » days folded by cost
// centre. Pure.

import { normalizeLabel } from "./normalize.ts";
import { parseFrenchAmount, parseFrenchDate, parseYearCell } from "./values.ts";
import { sampleOf } from "./cell-sample.ts";
import { tallyInto } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import type { RowRef } from "./report.ts";
import type { RowFacts } from "./couts-facts.ts";
import type { CoutsStats } from "./couts-stats.ts";

/** The four ME cells whose non-zero presence keeps a project alive. */
export const ME_COLUMNS = [
  "Charge finale ME (Res) (J)", "Charge réelle ME (Res) (J)", "Coût final ME (Res ouTrans)", "Coût réel ME (Res ouTrans)",
] as const;

/** One « Projet. Id » as its rows are read. */
export interface Seen {
  id: string;
  /** Every row's project facts (couts-facts.ts resolves them). */
  rows: RowFacts[];
  onYear: boolean;
  hasMe: boolean;
  /** Lines of exercise-year rows whose ME cells hold something unreadable — neither empty nor zero. */
  meUnreadable: number[];
  /** « Charge » rows of the exercise year by cost centre (normalized key). */
  charges: Map<string, { centre: string; jh: number; done: number }>;
  ref: RowRef;
}

/** What the row pass reads and feeds. */
export interface RowContext {
  fileName: string;
  year: string;
  match: HeaderMatch;
  seen: Map<string, Seen>;
  stats: CoutsStats;
  tallies: Map<string, Tally>;
  /** « Année » values read, by year (or « illisible »), for the survey. */
  years: Map<string, Tally>;
}

/**
 * Reads one cell of the row by its canonical column.
 * Inputs: the context, the row, the column. Output: the trimmed cell, ""
 * when the column is absent. Failure modes: none.
 */
export function cell(ctx: RowContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// A « Charge » row (« Type de centre de coût ») adds its days to the
// project's cost centre — the macro's « appel de charges » (ADR 034): days
// = « Charge finale ME (Res) (J) », done = « Charge réelle ME (Res) (J) ».
function foldCharge(ctx: RowContext, row: CsvRow, seen: Seen): void {
  if (!normalizeLabel(cell(ctx, row, "Type de centre de coût")).startsWith("charge")) return;
  const centre = cell(ctx, row, "Centre de coût") || "(Sans centre de coût)";
  const jh = parseFrenchAmount(cell(ctx, row, "Charge finale ME (Res) (J)"));
  const done = parseFrenchAmount(cell(ctx, row, "Charge réelle ME (Res) (J)"));
  const key = normalizeLabel(centre);
  const bucket = seen.charges.get(key) ?? { centre, jh: 0, done: 0 };
  bucket.jh = round2(bucket.jh + (jh.kind === "value" ? jh.value : 0));
  bucket.done = round2(bucket.done + (done.kind === "value" ? done.value : 0));
  seen.charges.set(key, bucket);
}

// An accounting format writes zero as a dash (« - € »): zero, said.
const ACCOUNTING_ZERO = /^(?:€\s*)?[-–—](?:\s*€)?$/;

// The ME verdict of one row: a non-zero figure; else something unreadable
// (neither empty nor zero — ADR 056: never counted as zero); else none.
function rowMe(ctx: RowContext, row: CsvRow): "figure" | "unreadable" | "none" {
  let unreadable = false;
  for (const column of ME_COLUMNS) {
    const raw = cell(ctx, row, column);
    const parsed = parseFrenchAmount(raw);
    if (parsed.kind === "value" && parsed.value !== 0) return "figure";
    if (parsed.kind !== "invalid") continue;
    if (ACCOUNTING_ZERO.test(raw)) {
      tallyInto(ctx.tallies, `« ${column} » : tiret comptable lu comme zéro`, row.line);
      continue;
    }
    tallyInto(ctx.tallies, `« ${column} » illisible — ni vide ni zéro, le projet est gardé (douteux)`, row.line, sampleOf(raw));
    unreadable = true;
  }
  return unreadable ? "unreadable" : "none";
}

// The row's year, surveyed: the survey lists every value read so a
// reformatted « Année » column stands out (ADR 056).
function readYear(ctx: RowContext, row: CsvRow): boolean {
  const raw = cell(ctx, row, "Année");
  const year = parseYearCell(raw);
  tallyInto(ctx.years, year === null ? "illisible" : String(year), row.line, year === null ? sampleOf(raw) : undefined);
  return year !== null && year === Number(ctx.year);
}

function rowFacts(ctx: RowContext, row: CsvRow, onYear: boolean): RowFacts {
  const exported = parseFrenchDate(cell(ctx, row, "Date d'export"));
  return {
    name: cell(ctx, row, "Projet. Nom"), type: cell(ctx, row, "Projet.Type"), etat: cell(ctx, row, "Projet.Etat du processus"),
    portfolio: cell(ctx, row, "Projet.Portefeuille"), actif: cell(ctx, row, "Projet.Actif"),
    exportDate: exported.kind === "date" ? exported.iso : null, onYear,
  };
}

/**
 * Reads one data row into its project: counted, year surveyed, facts
 * kept, ME tested and « Charge » days folded on the exercise year.
 * Inputs: the context, the row. Output: none (mutates the context).
 * Failure modes: none — a row without « Projet. Id » is tallied, ignored.
 */
export function readRow(ctx: RowContext, row: CsvRow): void {
  if (row.cells.every((c) => c.trim() === "")) return;
  ctx.stats.rows++;
  const id = cell(ctx, row, "Projet. Id");
  if (id === "") {
    tallyInto(ctx.tallies, "ligne sans « Projet. Id » — ignorée", row.line);
    return;
  }
  const onYear = readYear(ctx, row);
  if (!onYear) ctx.stats.otherYearRows++;
  const seen: Seen = ctx.seen.get(id) ?? {
    id, rows: [], onYear: false, hasMe: false, meUnreadable: [], charges: new Map(), ref: { file: ctx.fileName, line: row.line },
  };
  ctx.seen.set(id, seen);
  seen.rows.push(rowFacts(ctx, row, onYear));
  if (!onYear) return;
  seen.onYear = true;
  const me = rowMe(ctx, row);
  if (me === "figure") seen.hasMe = true;
  if (me === "unreadable") seen.meUnreadable.push(row.line);
  foldCharge(ctx, row, seen);
}
