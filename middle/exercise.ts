// The year switch route (ADR 035/038): « Changer d'année en cours ». The
// server computes the plan (core/exercise-switch) over the folded board,
// writes its events in one batch, then records the new current exercise —
// in that order: the pins must be in the log before the year changes.
// Refused unless the requested year is the one right after the current
// exercise. Actor: the server's until RP3. Logs carry counts only.

import type { BoardStorage } from "../core/ports.ts";
import { foldEvents } from "../core/state.ts";
import { switchPlan } from "../core/exercise-switch.ts";
import type { ConfigStore } from "./config-store.ts";
import { BadRequest } from "./errors.ts";
import { SERVER_ACTOR } from "./api.ts";
import type { ApiResult } from "./api.ts";

/**
 * POST /api/exercise/switch — makes the next year the current exercise.
 * Inputs: the storage, the config store, the parsed JSON body ({ year }).
 * Output: 200 with { year, pinned, archived, activated, config }.
 * Failure: BadRequest (→ 400) when `year` is not the year after the current
 * exercise; storage errors propagate (→ 500) — nothing partially written
 * for the events, and the year is not changed then.
 */
export async function postExerciseSwitch(storage: BoardStorage, store: ConfigStore, raw: unknown): Promise<ApiResult> {
  const current = store.getExerciseYear();
  const year = typeof raw === "object" && raw !== null ? (raw as { year?: unknown }).year : undefined;
  if (year !== current + 1) {
    throw new BadRequest(`Bascule refusée : l’exercice suivant est ${current + 1} (en cours : ${current}).`);
  }
  const [events, baseCards] = await Promise.all([storage.listEvents(), storage.listBaseCards()]);
  const ts = new Date().toISOString();
  const plan = switchPlan(foldEvents(baseCards, events), current, year, SERVER_ACTOR, ts);
  await storage.importCards([], plan.events);
  const config = store.setExerciseYear(year, SERVER_ACTOR);
  console.log(
    `${ts} bascule d’exercice ${current} → ${year} : ${plan.pinned} épinglée(s), ${plan.archived} archivée(s), ${plan.activated} activée(s)`,
  );
  return { status: 200, body: { year, pinned: plan.pinned, archived: plan.archived, activated: plan.activated, config } };
}
