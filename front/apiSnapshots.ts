// The snapshot calls (ADR 042): take, list, restore — over the same fetch
// wrapper as the rest of the API.

import type { BoardConfig, CardEvent } from "../core/types.ts";
import type { SnapshotSummary } from "../core/snapshot.ts";
import { jsonInit, request } from "./api.ts";

/**
 * GET /api/snapshots — the stored snapshots' summaries, newest first.
 * Output: the summaries. Failure: rejects with ApiError.
 */
export function fetchSnapshots(): Promise<SnapshotSummary[]> {
  return request<SnapshotSummary[]>("/api/snapshots");
}

/**
 * POST /api/snapshots — takes a snapshot of the board as stored now.
 * Input: the label (why). Output: the summary. Failure: rejects with ApiError (400 without a label).
 */
export function postSnapshot(label: string): Promise<SnapshotSummary> {
  return request<SnapshotSummary>("/api/snapshots", jsonInit("POST", { label }));
}

/** What a restore returns: the snapshot, the `restored` event, the runtime config. */
export interface RestoreResult {
  snapshot: SnapshotSummary;
  event: CardEvent;
  config: BoardConfig;
}

/**
 * POST /api/snapshots/:id/restore — puts the board back to that snapshot.
 * Input: the snapshot id. Output: the RestoreResult. Failure: rejects with ApiError (400 on an unknown id).
 */
export function postRestore(id: string): Promise<RestoreResult> {
  return request<RestoreResult>(`/api/snapshots/${encodeURIComponent(id)}/restore`, jsonInit("POST", {}));
}
