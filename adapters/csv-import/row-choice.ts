// Which row a reader keeps when several rows of one file carry the same Id
// — a « Doute à trancher » (ADR 062): the options are the distinct rows,
// each labelled with the columns where they differ; the tool's proposal is
// the row of duplicate-rows.ts (ADR 056, independent of the row order).
// An option is identified by its content (never by line: a line number
// moves from one export to the next) — the content of the SHOWN columns
// that are not people's names (ADR 062, « Données personnelles »: nothing
// derived from a name enters the log, and an unknown column may hold
// one). When two distinct rows differ only elsewhere (a Responsable, an
// unlisted column), the options fall back to their line numbers and the
// doubt is asked at each import, never remembered. And whenever the rows
// differ in a people's-name column, the doubt is asked at each import too:
// the log cannot tell whether the names changed since the PMO chose, so a
// remembered choice could silently give the card another chef de projet
// (author's rule for the chefs de projet, 2026-09-30). Shared by the
// Projets onglet and SP readers. Pure.

import { fnv1a } from "./hash.ts";
import { KEPT_ROW_RULE, keptRow } from "./duplicate-rows.ts";
import type { DuplicateRow } from "./duplicate-rows.ts";
import { askOrPropose } from "./doubt-book.ts";
import type { DoubtBook, DoubtOptionSpec } from "./doubt-book.ts";

/** A row of a file, with its cells. */
export type ChoiceRow = DuplicateRow;

/** Where the rows come from and how to name the project. */
export interface RowChoiceInput<T extends ChoiceRow> {
  rows: readonly T[];
  /** The file's label in the doubt (« l'onglet Projets », « SP »). */
  source: string;
  /** The doubt detail: the source's key (« projets », « sp »). */
  detail: string;
  /** Column label → index: the columns the labels may show, in display order — the only ones an option id is made of. */
  columns: ReadonlyArray<[string, number]>;
  /** Columns whose values are people's names: shown to the PMO, never written in the log nor hashed into it. */
  personal?: ReadonlySet<string>;
  code: string | null;
  name: string;
  title: string;
  /** Keys the doubt answers to (a side file's rows are asked about only when a card joins them). */
  joinKeys?: readonly string[];
}

function value(row: ChoiceRow, index: number): string {
  return (row.cells[index] ?? "").trim();
}

/**
 * The option id of a row: a fingerprint of its trimmed cells in the shown
 * columns, the people's-name columns left out.
 * Inputs: the row, the shown columns, the personal ones. Output:
 * « r:<8 hex> ». Failure modes: none.
 */
export function rowOptionId(row: ChoiceRow, columns: ReadonlyArray<[string, number]>, personal?: ReadonlySet<string>): string {
  const cells = columns.filter(([label]) => personal?.has(label) !== true).map(([, index]) => value(row, index));
  return `r:${fnv1a(cells.join("\u001f"))}`;
}

// The whole trimmed row: what makes two rows « the same » (in memory only, never logged).
const contentOf = (row: ChoiceRow): string => row.cells.map((cell) => cell.trim()).join("\u001f");

interface Options<T> {
  specs: DoubtOptionSpec[];
  /** The option id of any row of the group (its distinct content's). */
  idOf: (row: T) => string;
  byId: Map<string, T>;
  /** True when the options are told apart by line number only (never remembered). */
  byLine: boolean;
  /** True when the rows differ in a people's-name column (never remembered). */
  personalDiffers: boolean;
}

// One option per distinct content (its first line), labelled with the
// columns that differ between the options.
function options<T extends ChoiceRow>(input: RowChoiceInput<T>): Options<T> {
  const firsts = new Map<string, T>();
  for (const row of [...input.rows].sort((a, b) => a.line - b.line)) if (!firsts.has(contentOf(row))) firsts.set(contentOf(row), row);
  const distinct = [...firsts.values()];
  const safeId = (row: T): string => rowOptionId(row, input.columns, input.personal);
  const byLine = new Set(distinct.map(safeId)).size < distinct.length;
  const idOf = (row: T): string => {
    const first = firsts.get(contentOf(row)) ?? row;
    return byLine ? `ligne:${first.line}` : safeId(first);
  };
  const differing = input.columns.filter(([, index]) => new Set(distinct.map((row) => value(row, index))).size > 1);
  const personalDiffers = differing.some(([label]) => input.personal?.has(label) === true);
  const specs = distinct.map((row): DoubtOptionSpec => {
    const parts = differing.map(([label, index]) => [label, `${label} « ${value(row, index) || "(vide)"} »`] as const);
    const shown = (keep: (label: string) => boolean): string => {
      const words = parts.filter(([label]) => keep(label)).map(([, text]) => text);
      return `ligne ${row.line}${words.length === 0 ? " (autres colonnes)" : ` : ${words.join(", ")}`}`;
    };
    return { id: idOf(row), label: shown(() => true), trace: shown((label) => input.personal?.has(label) !== true), consequence: null };
  });
  return { specs, idOf, byId: new Map(distinct.map((row) => [idOf(row), row])), byLine, personalDiffers };
}

/**
 * The row kept among the rows of one Id: the PMO's choice (or a remembered
 * one), else the tool's row (duplicate-rows.ts). Rows that all say the
 * same thing ask nothing.
 * Inputs: the rows and how to name them, the book (absent = proposal).
 * Output: the kept row. Failure modes: throws on an empty list (a caller bug).
 */
export function chooseRow<T extends ChoiceRow>(input: RowChoiceInput<T>, book: DoubtBook | undefined): T {
  const proposed = keptRow(input.rows);
  const { specs, idOf, byId, byLine, personalDiffers } = options(input);
  if (specs.length < 2) return proposed;
  const differs = specs[0]?.label.includes(" : ") === true ? "" : " (seules d'autres colonnes diffèrent)";
  const applied = askOrPropose(book, {
    kind: "duplicate-row", detail: input.detail, code: input.code, name: input.name, title: input.title,
    why: `${input.rows.length} lignes de ${input.source} portent ${input.code === null ? "ce nom" : `l'Id « ${input.code} »`}` +
      ` et ne disent pas la même chose${differs}. L'outil garde ${KEPT_ROW_RULE}.`,
    options: specs, proposed: idOf(proposed), ...(input.joinKeys === undefined ? {} : { joinKeys: input.joinKeys }),
    ...(byLine || personalDiffers ? { askedEachTime: true as const } : {}),
  });
  return applied === idOf(proposed) ? proposed : byId.get(applied) ?? proposed;
}
