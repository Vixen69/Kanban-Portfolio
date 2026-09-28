// The reste à faire split by column class (ADR 048): what the board gutter
// reads out — RAF engagé, non engagé, hors calcul on the counted métiers —
// and the per-métier rows of the « Périmètre RAF » list. Built FROM the
// per-column aggregates, so the gutter is the sum of the headers.

import type { BoardConfig, Profile } from "./types.ts";
import type { ColumnClass } from "./column-class.ts";
import { scopedRaf, type GroupTotals } from "./totals.ts";

/** The gutter's figures on the counted métiers. */
export interface RafSplit {
  engaged: number;
  idle: number;
  excluded: number;
  /** Cards without a per-métier plan in the engaged columns, and elsewhere. */
  blindEngaged: number;
  blindOther: number;
}

/**
 * The reste à faire of the counted métiers, class by class.
 * Inputs: the per-column aggregates of the visible cards, the column
 * classes, the counted profile ids. Output: the RafSplit. Failure: none —
 * a column without a class counts as « idle ».
 */
export function rafSplit(
  byColumn: Record<string, GroupTotals>, classes: Record<string, ColumnClass>, counted: ReadonlySet<string>,
): RafSplit {
  const split: RafSplit = { engaged: 0, idle: 0, excluded: 0, blindEngaged: 0, blindOther: 0 };
  for (const [id, totals] of Object.entries(byColumn)) {
    const cls = classes[id] ?? "idle";
    split[cls] += scopedRaf(totals, counted);
    if (cls === "engaged") split.blindEngaged += totals.blind;
    else split.blindOther += totals.blind;
  }
  return split;
}

/** One métier of the « Périmètre RAF » list. */
export interface LensRow {
  profile: Profile;
  engaged: number;
  idle: number;
}

/**
 * Every métier of the config with its engaged and non-engaged reste à
 * faire over the visible cards, largest engaged first, then non engaged,
 * then name — independent of the métiers counted, so checking one never
 * moves a row.
 * Inputs: the per-column aggregates, the column classes, the config.
 * Output: one row per config profile. Failure: none.
 */
export function lensRows(
  byColumn: Record<string, GroupTotals>, classes: Record<string, ColumnClass>, config: BoardConfig,
): LensRow[] {
  const rows = config.profiles.map((profile) => {
    const one = new Set([profile.id]);
    const split = rafSplit(byColumn, classes, one);
    return { profile, engaged: split.engaged, idle: split.idle };
  });
  rows.sort((a, b) => b.engaged - a.engaged || b.idle - a.idle || a.profile.name.localeCompare(b.profile.name, "fr"));
  return rows;
}
