// The WIP limits table of the board config (ADR 046): column → canal (or
// "*" for a column without canal, ADR 039) → limit ≥ 1. Parsed apart from
// config.ts to keep that file within its size.

import { fail, requireRecord } from "./config-parse.ts";

function parseLimit(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    fail(`${path} doit être un entier ≥ 1`);
  }
  return value;
}

/**
 * Parses the WIP limits per cell. A missing table means no limit
 * anywhere; every key must name a known column or canal, so a typo never
 * silently limits nothing.
 * Inputs: the raw table, the parsed lanes and columns (ids).
 * Output: the normalized table. Failure: throws the French validation
 * error naming the offending key.
 */
export function parseWipLimits(
  value: unknown, lanes: readonly { id: string }[], columns: readonly { id: string }[],
): Record<string, Record<string, number>> {
  if (value === undefined || value === null) return {};
  const table = requireRecord(value, "wipLimits");
  const laneIds = new Set(lanes.map((lane) => lane.id));
  const result: Record<string, Record<string, number>> = {};
  for (const [columnId, cells] of Object.entries(table)) {
    if (!columns.some((column) => column.id === columnId)) fail(`wipLimits : colonne inconnue « ${columnId} »`);
    const row = requireRecord(cells, `wipLimits.${columnId}`);
    const limits: Record<string, number> = {};
    for (const [laneId, limit] of Object.entries(row)) {
      if (laneId !== "*" && !laneIds.has(laneId)) fail(`wipLimits.${columnId} : canal inconnu « ${laneId} »`);
      limits[laneId] = parseLimit(limit, `wipLimits.${columnId}.${laneId}`);
    }
    result[columnId] = limits;
  }
  return result;
}
