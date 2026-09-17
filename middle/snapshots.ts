// Board snapshots (ADR 042, author 2026-09-17): « prendre un snapshot
// parce qu'on sait qu'on va faire des réimports… pouvoir réimporter
// exactement ces états-là ». A take freezes the facts beside the log
// (base cards, the capacity of each exercise, the applied config, the
// current year) with the log's position. A restore puts the facts back
// and appends ONE `restored` event: the log keeps everything, the fold
// reads it again from the snapshot's position (core/restore.ts). One is
// taken automatically before each import load and each year switch.

import { randomUUID } from "node:crypto";
import type { BoardStorage } from "../core/ports.ts";
import type { BoardConfig, CapacitySnapshot, CardEvent } from "../core/types.ts";
import { exerciseYears } from "../core/exercise.ts";
import { restoreEvent, summarizeSnapshot, type BoardSnapshot, type SnapshotSummary } from "../core/snapshot.ts";
import type { ConfigStore } from "./config-store.ts";
import { BadRequest } from "./errors.ts";
import { serializedWrite, SERVER_ACTOR } from "./api.ts";
import type { ApiResult } from "./api.ts";

/** What the snapshot operations need. */
export interface SnapshotDeps {
  storage: BoardStorage;
  configStore: ConfigStore;
}

const LABEL_MAX = 120;

/**
 * Takes a snapshot of the board as stored now.
 * Inputs: the deps, the label (why), the actor, the instant.
 * Output: the summary of the stored snapshot. Failure: storage errors propagate.
 */
export async function takeSnapshot(deps: SnapshotDeps, label: string, actor: string, now: Date): Promise<SnapshotSummary> {
  const { storage, configStore } = deps;
  const [cards, logSeq] = await Promise.all([storage.listBaseCards(), storage.lastSeq()]);
  const exerciseYear = configStore.getExerciseYear();
  const found = await Promise.all(exerciseYears(cards, exerciseYear).map((year) => storage.getCapacity(year)));
  const capacity = found.filter((entry): entry is CapacitySnapshot => entry !== null);
  const snapshot: BoardSnapshot = {
    id: `snap-${now.toISOString().slice(0, 19).replace(/[-:T]/g, "")}-${randomUUID().slice(0, 8)}`,
    ts: now.toISOString(), actor, label, logSeq, exerciseYear, cards, capacity,
    configOverride: configStore.getOverride(),
  };
  await storage.saveSnapshot(snapshot);
  console.log(`${snapshot.ts} instantané ${snapshot.id} : ${cards.length} carte(s), journal à ${logSeq}`);
  return summarizeSnapshot(snapshot);
}

/** What a restore returns. */
export interface RestoreResult {
  snapshot: SnapshotSummary;
  event: CardEvent;
  config: BoardConfig;
}

/**
 * Restores a snapshot: the base cards replaced, each captured capacity
 * re-imported, the applied config put back (or removed), the current year
 * set, then the `restored` event appended — last, so the log says « done »
 * only once the facts are back. Every step is idempotent: a failure
 * midway is retried by restoring again.
 * Inputs: the deps, the snapshot id, the actor, the instant.
 * Output: the summary, the appended event, the runtime config.
 * Failure: BadRequest on an unknown id; storage errors propagate.
 */
export async function restoreSnapshot(deps: SnapshotDeps, id: string, actor: string, now: Date): Promise<RestoreResult> {
  const { storage, configStore } = deps;
  const snapshot = await storage.loadSnapshot(id);
  if (snapshot === null) throw new BadRequest("Instantané inconnu.");
  await storage.restoreCards(snapshot.cards);
  for (const entry of snapshot.capacity) await storage.importCapacity(entry);
  configStore.restoreOverride(snapshot.configOverride, actor);
  const config = configStore.getExerciseYear() === snapshot.exerciseYear
    ? configStore.getRuntime()
    : configStore.setExerciseYear(snapshot.exerciseYear, actor);
  const event = await storage.appendEvent(restoreEvent(snapshot, actor, now.toISOString()));
  console.log(`${event.ts} restauration de l’instantané ${snapshot.id} : journal relu depuis ${snapshot.logSeq}`);
  return { snapshot: summarizeSnapshot(snapshot), event, config };
}

// The label of a manual take: a non-empty string, trimmed, capped.
function parseLabel(raw: unknown): string {
  const label = typeof raw === "object" && raw !== null ? (raw as { label?: unknown }).label : undefined;
  if (typeof label !== "string" || label.trim() === "") {
    throw new BadRequest("Un libellé est attendu : pourquoi cet instantané.");
  }
  return label.trim().slice(0, LABEL_MAX);
}

/**
 * POST /api/snapshots — takes a snapshot with the body's label.
 * Inputs: the deps, the parsed JSON body ({ label }).
 * Output: 201 with the summary. Failure: BadRequest (→ 400) without a label.
 */
export async function postSnapshot(deps: SnapshotDeps, raw: unknown): Promise<ApiResult> {
  const label = parseLabel(raw);
  return { status: 201, body: await takeSnapshot(deps, label, SERVER_ACTOR, new Date()) };
}

/**
 * GET /api/snapshots — the stored snapshots, newest first.
 * Output: 200 with the summaries. Failure: storage errors propagate.
 */
export async function getSnapshots(deps: SnapshotDeps): Promise<ApiResult> {
  return { status: 200, body: await deps.storage.listSnapshots() };
}

/**
 * POST /api/snapshots/:id/restore — restores one snapshot, serialized
 * with the card intents so none validates against a half-restored board.
 * Inputs: the deps, the route's id. Output: 200 with the RestoreResult.
 * Failure: BadRequest (→ 400) on a missing or unknown id.
 */
export async function postRestore(deps: SnapshotDeps, id: unknown): Promise<ApiResult> {
  if (typeof id !== "string" || id === "") throw new BadRequest("Identifiant d’instantané attendu.");
  return serializedWrite(async () => ({ status: 200, body: await restoreSnapshot(deps, id, SERVER_ACTOR, new Date()) }));
}
