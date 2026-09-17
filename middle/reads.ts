// The read routes beside the board: the incremental event fetch (ADR 040)
// and the capacity snapshot of an exercise (ADR 024/035). Split from
// api.ts to hold the 300-line file cap.

import type { BoardStorage } from "../core/ports.ts";
import type { ApiResult } from "./api.ts";
import { BadRequest } from "./errors.ts";

/**
 * GET /api/events?after=N — the events appended after sequence N, in
 * append order: the incremental refresh after the front's own writes
 * (ADR 040). Inputs: the storage, the raw `after` query value (absent = 0).
 * Output: 200 with { events }. Failure: BadRequest (→ 400) when `after` is
 * not a whole number ≥ 0 in the query string; storage errors propagate.
 */
export async function getEvents(storage: BoardStorage, rawAfter: unknown): Promise<ApiResult> {
  const after = rawAfter === undefined ? 0 : typeof rawAfter === "string" ? Number(rawAfter) : NaN;
  if (!Number.isInteger(after) || after < 0) throw new BadRequest("Paramètre « after » invalide.");
  return { status: 200, body: { events: await storage.listEvents({ afterSeq: after }) } };
}

/**
 * GET /api/capacity?exercise=YYYY — the capacity snapshot of one exercise
 * year (persons + assignments, ADR 024/035), or null when no import
 * carried one for that year. The read-outs are derived client-side by
 * core/capacity.ts.
 * Inputs: the storage, the year. Output: 200 with { capacity }.
 * Failure: propagates storage errors (→ 500).
 */
export async function getCapacity(storage: BoardStorage, year: number): Promise<ApiResult> {
  return { status: 200, body: { capacity: await storage.getCapacity(year) } };
}
