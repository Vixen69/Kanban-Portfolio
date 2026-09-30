// Which SP rows are one project (ADR 062, split from sp.ts): the rows of
// one Id; the rows without Id under one name, joined to the Id whose rows
// carry that name when exactly one does. The grouping reads every row
// before deciding, so it no longer depends on the rows' order (it used to:
// a row without Id read before its Id's row set that row aside). Two Ids
// under one name stay two projects (ADR 058). Pure.

import type { CsvRow } from "./csv.ts";

/** An SP row past the structural gates. */
export interface SpRow {
  row: CsvRow;
  line: number;
  cells: string[];
  /** « Id » when filled, else null. */
  id: string | null;
  nom: string;
  normalizedName: string;
}

function push<K>(map: Map<K, SpRow[]>, key: K, row: SpRow): void {
  map.set(key, [...(map.get(key) ?? []), row]);
}

/**
 * Groups the rows by project, in the order of each group's first line.
 * Input: the rows past the gates. Output: the groups (each non-empty).
 * Failure modes: none.
 */
export function groupRows(rows: readonly SpRow[]): SpRow[][] {
  const byId = new Map<string, SpRow[]>();
  const nameless = new Map<string, SpRow[]>();
  for (const row of rows) {
    if (row.id !== null) push(byId, row.id, row);
    else push(nameless, row.normalizedName, row);
  }
  const groups = [...byId.values()];
  for (const [name, loose] of nameless) {
    const owners = groups.filter((group) => group.some((row) => row.normalizedName === name));
    const owner = owners.length === 1 ? owners[0] : undefined;
    if (owner === undefined) groups.push(loose);
    else owner.push(...loose);
  }
  const firstLine = (group: readonly SpRow[]): number => Math.min(...group.map((row) => row.line));
  return groups.sort((a, b) => firstLine(a) - firstLine(b));
}
