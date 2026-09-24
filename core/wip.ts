// WIP limits per cell (ADR 046, author 2026-09-24: « une limite par case
// et pas par colonne »). The limit is read where it is shown — on the cell
// — and set there too (⚙ › Limites WIP). A column without canal (ADR 039)
// has one cell, keyed "*". A set limit warns at 80 %, reddens beyond,
// never blocks (§1). The default model carries none: the PMO sets them
// once the flow has lived.

import type { BoardConfig } from "./types.ts";
import { UNIFIED_LANE, unifiedColumnIds } from "./layout.ts";

/**
 * The WIP limit of one cell.
 * Inputs: the config, the canal id (UNIFIED_LANE for a column without
 * canal), the column id. Output: the limit, null when none. Failure: none.
 */
export function cellWipLimit(config: BoardConfig, laneId: string, columnId: string): number | null {
  return config.wipLimits[columnId]?.[laneId] ?? null;
}

/**
 * The WIP limit of a whole column: its one cell's when it has no canal,
 * else the sum of its cells' — only when every canal has one (a partial
 * set is no column limit). Read by the Flux tab's encours vs limites.
 * Inputs: the config, the column id. Output: the limit or null. Failure: none.
 */
export function columnWipLimit(config: BoardConfig, columnId: string): number | null {
  if (unifiedColumnIds(config).has(columnId)) return cellWipLimit(config, UNIFIED_LANE, columnId);
  if (config.lanes.length === 0) return null;
  let total = 0;
  for (const lane of config.lanes) {
    const limit = cellWipLimit(config, lane.id, columnId);
    if (limit === null) return null;
    total += limit;
  }
  return total;
}

/**
 * The config with one cell's limit set (or removed, null) — a new object,
 * the input untouched; an emptied row disappears from the table.
 * Inputs: the config, the canal id (or UNIFIED_LANE), the column id, the
 * limit or null. Output: the new config. Failure: none.
 */
export function withCellWipLimit(config: BoardConfig, laneId: string, columnId: string, limit: number | null): BoardConfig {
  const row: Record<string, number> = { ...(config.wipLimits[columnId] ?? {}) };
  if (limit === null) delete row[laneId];
  else row[laneId] = limit;
  const wipLimits: Record<string, Record<string, number>> = { ...config.wipLimits };
  if (Object.keys(row).length === 0) delete wipLimits[columnId];
  else wipLimits[columnId] = row;
  return { ...config, wipLimits };
}
