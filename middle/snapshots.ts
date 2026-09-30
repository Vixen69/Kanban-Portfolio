// Board snapshots (ADR 042, author 2026-09-17): « prendre un snapshot
// parce qu'on sait qu'on va faire des réimports… pouvoir réimporter
// exactement ces états-là ». A take freezes the facts beside the log
// (base cards, the capacity of each exercise, the applied config, the
// current year) with the log's position. A restore puts the facts back
// and appends ONE `restored` event: the log keeps everything, the fold
// reads it again from the snapshot's position (core/restore.ts). One is
// taken automatically before each import load and each year switch.
// ADR 058: a restore also removes the capacity of the years the snapshot
// held none for, and puts an applied config back only onto the versioned
// model it was applied on — otherwise it is set aside (ADR 038).

import { randomUUID } from "node:crypto";
import type { BoardStorage } from "../core/ports.ts";
import type { BoardConfig, CapacitySnapshot, CardEvent } from "../core/types.ts";
import { exerciseYears } from "../core/exercise.ts";
import { foldEvents } from "../core/state.ts";
import { boardAt, diffBoards } from "../core/snapshot-diff.ts";
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
    configOverride: configStore.getOverride(), configDefaultsHash: configStore.getDefaultsHash(),
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
  /** True when the snapshot's applied config was set aside: applied on another versioned model (ADR 038/058). */
  configSetAside: boolean;
  /** The exercise years whose capacity the restore removed: the snapshot held none for them (ADR 058). */
  capacityCleared: number[];
}

const SET_ASIDE_NOTE =
  "configuration de l’instantané écartée à la restauration : le modèle versionné (config/board.json) a changé et fait foi (ADR 038)";

// The years whose capacity a restore removes (ADR 058): the years the
// board holds cards for now and the years the take probed — exactly
// exerciseYears(snapshot cards, snapshot year) — minus those the snapshot
// captured a capacity for. Read BEFORE the cards are replaced.
async function staleCapacityYears(storage: BoardStorage, snapshot: BoardSnapshot, currentYear: number): Promise<number[]> {
  const cards = await storage.listBaseCards();
  const years = new Set([...exerciseYears(cards, currentYear), ...exerciseYears(snapshot.cards, snapshot.exerciseYear)]);
  for (const entry of snapshot.capacity) years.delete(entry.exerciseYear);
  return [...years].sort((a, b) => a - b);
}

// Whether the snapshot's override was applied on the model running now:
// its stamp says so (ADR 058); a snapshot taken before carries none — its
// override is then trusted only when it IS the one running.
function sameModel(configStore: ConfigStore, snapshot: BoardSnapshot): boolean {
  if (snapshot.configDefaultsHash !== undefined) return snapshot.configDefaultsHash === configStore.getDefaultsHash();
  return JSON.stringify(snapshot.configOverride) === JSON.stringify(configStore.getOverride());
}

// Puts the applied config back (ADR 042) — or sets it aside when it was
// applied on another versioned model (ADR 038/058). True when set aside.
function restoreConfig(configStore: ConfigStore, snapshot: BoardSnapshot, actor: string): boolean {
  if (snapshot.configOverride === null || sameModel(configStore, snapshot)) {
    configStore.restoreOverride(snapshot.configOverride, actor);
    return false;
  }
  configStore.setAsideOverride(snapshot.configOverride, actor, SET_ASIDE_NOTE);
  return true;
}

/**
 * Restores a snapshot: the base cards replaced, the capacity of the years
 * it held none for removed and each captured one re-imported (ADR 058),
 * the applied config put back (or removed; set aside when it was applied
 * on another versioned model, ADR 038), the current year set, then the
 * `restored` event appended — last, so the log says « done » only once
 * the facts are back. Every step is idempotent: a failure midway is
 * retried by restoring again.
 * Inputs: the deps, the snapshot id, the actor, the instant.
 * Output: the summary, the appended event, the runtime config, whether
 * the config was set aside, the years whose capacity was removed.
 * Failure: BadRequest on an unknown id; storage errors propagate.
 */
export async function restoreSnapshot(deps: SnapshotDeps, id: string, actor: string, now: Date): Promise<RestoreResult> {
  const { storage, configStore } = deps;
  const snapshot = await storage.loadSnapshot(id);
  if (snapshot === null) throw new BadRequest("Instantané inconnu.");
  const capacityCleared = await staleCapacityYears(storage, snapshot, configStore.getExerciseYear());
  await storage.restoreCards(snapshot.cards);
  for (const year of capacityCleared) await storage.clearCapacity(year);
  for (const entry of snapshot.capacity) await storage.importCapacity(entry);
  const configSetAside = restoreConfig(configStore, snapshot, actor);
  const config = configStore.getExerciseYear() === snapshot.exerciseYear
    ? configStore.getRuntime()
    : configStore.setExerciseYear(snapshot.exerciseYear, actor);
  const event = await storage.appendEvent(restoreEvent(snapshot, actor, now.toISOString()));
  console.log(
    `${event.ts} restauration de l’instantané ${snapshot.id} : journal relu depuis ${snapshot.logSeq}` +
      `, capacité retirée : ${capacityCleared.length} exercice(s)${configSetAside ? ", configuration appliquée écartée (ADR 038)" : ""}`,
  );
  return { snapshot: summarizeSnapshot(snapshot), event, config, configSetAside, capacityCleared };
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

/**
 * GET /api/snapshots/:id/diff — what changed on the board since that
 * snapshot (ADR 053): the board at its log position against the board now,
 * card by card (arrived, absent from the import, gone, back, moved, domain,
 * type, title, archived) and, since ADR 055, the refreshed values — chef de
 * projet, the money and effort figures as numbers, date RDR, plan de charge
 * (the one change engine the import report reads too). A read: nothing is
 * written.
 * Inputs: the deps, the route's id. Output: 200 with { snapshot, changes }.
 * Failure: BadRequest (→ 400) on a missing or unknown id.
 */
export async function getSnapshotDiff(deps: SnapshotDeps, id: unknown): Promise<ApiResult> {
  if (typeof id !== "string" || id === "") throw new BadRequest("Identifiant d’instantané attendu.");
  const snapshot = await deps.storage.loadSnapshot(id);
  if (snapshot === null) throw new BadRequest("Instantané inconnu.");
  const [cards, events] = await Promise.all([deps.storage.listBaseCards(), deps.storage.listEvents()]);
  const then = boardAt(snapshot.cards, events, snapshot.logSeq);
  const changes = diffBoards(deps.configStore.getRuntime(), then, foldEvents(cards, events));
  return { status: 200, body: { snapshot: summarizeSnapshot(snapshot), changes } };
}
