// The snapshot calls (ADR 042): take, list, restore, compare (ADR 053) — over the same fetch
// wrapper as the rest of the API.

import type { BoardConfig, CardEvent } from "../core/types.ts";
import type { SnapshotSummary } from "../core/snapshot.ts";
import type { CardChange } from "../core/snapshot-diff.ts";
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

/**
 * What a restore returns: the snapshot, the `restored` event, the runtime
 * config; whether the snapshot's applied config was set aside because the
 * versioned model changed since (ADR 038/058), and the exercise years
 * whose capacity was removed because the snapshot held none (ADR 058) —
 * both absent from a middle older than ADR 058.
 */
export interface RestoreResult {
  snapshot: SnapshotSummary;
  event: CardEvent;
  config: BoardConfig;
  configSetAside?: boolean;
  capacityCleared?: number[];
}

/**
 * What the admin must be told after a restore, beyond « the board is
 * back »: the snapshot's applied config set aside (its WIP limits,
 * category names and fields stay in the history, the versioned model
 * runs), the capacity removed for the years the snapshot held none.
 * Input: the restore's result. Output: the French notice, null when
 * neither happened. Failure modes: none.
 */
export function restoreNotice(result: Pick<RestoreResult, "configSetAside" | "capacityCleared">): string | null {
  const parts: string[] = [];
  if (result.configSetAside === true) {
    parts.push(
      "Configuration de l’instantané mise de côté : le modèle versionné (board.json) a changé depuis — " +
        "ses limites WIP, libellés et champs restent dans l’historique de configuration, le modèle versionné s’applique.",
    );
  }
  const cleared = result.capacityCleared ?? [];
  if (cleared.length > 0) {
    parts.push(`Capacité retirée (l’instantané n’en avait pas) : ${[...cleared].sort((a, b) => a - b).join(", ")}.`);
  }
  return parts.length === 0 ? null : `Instantané restauré. ${parts.join(" ")}`;
}

/**
 * POST /api/snapshots/:id/restore — puts the board back to that snapshot.
 * Input: the snapshot id. Output: the RestoreResult. Failure: rejects with ApiError (400 on an unknown id).
 */
export function postRestore(id: string): Promise<RestoreResult> {
  return request<RestoreResult>(`/api/snapshots/${encodeURIComponent(id)}/restore`, jsonInit("POST", {}));
}

/** What GET /api/snapshots/:id/diff returns (ADR 053). */
export interface SnapshotDiffResult {
  snapshot: SnapshotSummary;
  changes: CardChange[];
}

/**
 * GET /api/snapshots/:id/diff — what changed on the board since that
 * snapshot. Input: the snapshot id. Output: the SnapshotDiffResult.
 * Failure: rejects with ApiError (400 on an unknown id).
 */
export function fetchSnapshotDiff(id: string): Promise<SnapshotDiffResult> {
  return request<SnapshotDiffResult>(`/api/snapshots/${encodeURIComponent(id)}/diff`);
}
