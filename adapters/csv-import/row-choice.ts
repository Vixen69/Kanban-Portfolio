// Which row a reader keeps when several rows of one file carry the same Id
// — a « Doute à trancher » (ADR 062): the options are the distinct rows
// (by content, never by line: a line number moves from one export to the
// next), each labelled with the columns where they differ; the tool's
// proposal is the row of duplicate-rows.ts (ADR 056, independent of the
// row order). Shared by the Projets onglet and SP readers. Pure.

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
  /** Column label → index: the columns the labels may show, in display order. */
  columns: ReadonlyArray<[string, number]>;
  /** Columns whose values are people's names: shown to the PMO, never written in the log. */
  personal?: ReadonlySet<string>;
  code: string | null;
  name: string;
  title: string;
  /** Keys the doubt answers to (a side file's rows are asked about only when a card joins them). */
  joinKeys?: readonly string[];
}

/**
 * The option id of a row: a fingerprint of its trimmed content.
 * Input: the row. Output: « r:<8 hex> ». Failure modes: none.
 */
export function rowOptionId(row: ChoiceRow): string {
  return `r:${fnv1a(row.cells.map((cell) => cell.trim()).join("\u001f"))}`;
}

function value(row: ChoiceRow, index: number): string {
  return (row.cells[index] ?? "").trim();
}

// One option per distinct content (its first line), labelled with the
// columns that differ between the options.
function options<T extends ChoiceRow>(input: RowChoiceInput<T>): { specs: DoubtOptionSpec[]; firsts: Map<string, T> } {
  const firsts = new Map<string, T>();
  for (const row of [...input.rows].sort((a, b) => a.line - b.line)) if (!firsts.has(rowOptionId(row))) firsts.set(rowOptionId(row), row);
  const distinct = [...firsts.values()];
  const differing = input.columns.filter(([, index]) => new Set(distinct.map((row) => value(row, index))).size > 1);
  const specs = [...firsts].map(([id, row]): DoubtOptionSpec => {
    const parts = differing.map(([label, index]) => [label, `${label} « ${value(row, index) || "(vide)"} »`] as const);
    const shown = (keep: (label: string) => boolean): string => {
      const words = parts.filter(([label]) => keep(label)).map(([, text]) => text);
      return `ligne ${row.line}${words.length === 0 ? " (autres colonnes)" : ` : ${words.join(", ")}`}`;
    };
    return { id, label: shown(() => true), trace: shown((label) => input.personal?.has(label) !== true), consequence: null };
  });
  return { specs, firsts };
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
  const { specs, firsts } = options(input);
  if (specs.length < 2) return proposed;
  const differs = specs[0]?.label.includes(" : ") === true ? "" : " (seules d'autres colonnes diffèrent)";
  const applied = askOrPropose(book, {
    kind: "duplicate-row", detail: input.detail, code: input.code, name: input.name, title: input.title,
    why: `${input.rows.length} lignes de ${input.source} portent ${input.code === null ? "ce nom" : `l'Id « ${input.code} »`}` +
      ` et ne disent pas la même chose${differs}. L'outil garde ${KEPT_ROW_RULE}.`,
    options: specs, proposed: rowOptionId(proposed), ...(input.joinKeys === undefined ? {} : { joinKeys: input.joinKeys }),
  });
  return applied === rowOptionId(proposed) ? proposed : firsts.get(applied) ?? proposed;
}
