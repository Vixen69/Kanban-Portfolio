// The class of each column for the reste à faire (ADR 048, author
// 2026-09-28): a column is wholly ENGAGÉ (the work mobilises people now —
// in Qualification and Études the workshops already take the architects),
// NON ENGAGÉ (Demandes, Prêts — RDLI passed but not started —, Pause) or
// HORS CALCUL (Terminé and after). The classes are DERIVED from the flow
// anchors and gates the config already carries, never from column ids:
// engagé = from the qualification anchor up to the column before the first
// DoR-validated column, plus from the activation anchor up to the column
// before the terminal one.

import type { BoardConfig, Column } from "./types.ts";
import { resolveFlowAnchors, terminalColumnIds } from "./flow.ts";

/** How a column's reste à faire counts. */
export type ColumnClass = "engaged" | "idle" | "excluded";

// Indexes [from, to) of a span, empty when either bound is missing.
function span(from: number, to: number): number[] {
  if (from < 0 || to <= from) return [];
  return Array.from({ length: to - from }, (_, index) => from + index);
}

/**
 * The class of every column of the config.
 * Inputs: the board config. Output: column id → class, one entry per
 * column. Failure: none — without flow anchors every column is « idle »;
 * without a DoR gate the first span is empty; without a terminal column the
 * second span runs to the end; the terminal span always wins.
 */
export function columnClasses(config: BoardConfig): Record<string, ColumnClass> {
  const columns = config.columns;
  const classes: Record<string, ColumnClass> = {};
  for (const column of columns) classes[column.id] = "idle";
  const anchors = resolveFlowAnchors(config);
  if (anchors === null) return classes;
  const indexOf = (column: Column | null): number => (column === null ? -1 : columns.findIndex((c) => c.id === column.id));
  const q = indexOf(anchors.qualification);
  const dor = columns.findIndex((column) => column.gate === "DoR");
  const a = indexOf(anchors.activation);
  const t = indexOf(anchors.terminal);
  const engaged = [...span(q, dor), ...span(a, t >= 0 ? t : columns.length)];
  for (const index of engaged) classes[columns[index]!.id] = "engaged";
  for (const id of terminalColumnIds(config)) classes[id] = "excluded";
  return classes;
}

/**
 * The columns of one class, in board order (the gutter's legend).
 * Inputs: the config, the class. Output: the columns. Failure: none.
 */
export function columnsOfClass(config: BoardConfig, cls: ColumnClass): Column[] {
  const classes = columnClasses(config);
  return config.columns.filter((column) => classes[column.id] === cls);
}
