// Rows of one file that carry the same Id (a Projets onglet, a ProjetsCdP
// export): which one a reader keeps. It used to be the first one read, so
// the row order of the export decided the card's title, type, domain or
// chef de projet (ADR 056: the same files give the same board, whatever
// the order of their rows). Pure.

/** A row as the readers hold it: its line and its cells. */
export interface DuplicateRow {
  line: number;
  cells: string[];
}

/** The rule, worded for the report. */
export const KEPT_ROW_RULE = "la plus fréquente, puis la plus complète, puis la première par ordre alphabétique";

// The row's content, cell by cell, blanks around the cells ignored.
function content(row: DuplicateRow): string {
  return row.cells.map((cell) => cell.trim()).join("\u001f");
}

function filled(row: DuplicateRow): number {
  return row.cells.filter((cell) => cell.trim() !== "").length;
}

/**
 * The row kept among rows sharing one Id, independent of their order: the
 * content most rows repeat, then the row with the most non-empty cells,
 * then the smallest content in string order; among identical rows, the
 * smallest line.
 * Input: the rows (at least one). Output: the kept row.
 * Failure modes: throws on an empty list (a caller bug: a group always
 * holds the row that opened it).
 */
export function keptRow<T extends DuplicateRow>(rows: readonly T[]): T {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(content(row), (counts.get(content(row)) ?? 0) + 1);
  let best: T | undefined;
  for (const row of rows) {
    if (best === undefined || better(row, best, counts)) best = row;
  }
  if (best === undefined) throw new Error("keptRow: no row");
  return best;
}

function better(a: DuplicateRow, b: DuplicateRow, counts: ReadonlyMap<string, number>): boolean {
  const [ca, cb] = [content(a), content(b)];
  const [na, nb] = [counts.get(ca) ?? 0, counts.get(cb) ?? 0];
  if (na !== nb) return na > nb;
  if (filled(a) !== filled(b)) return filled(a) > filled(b);
  if (ca !== cb) return ca < cb;
  return a.line < b.line;
}
