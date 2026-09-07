// Synthetic decisions for the fixtures (ADR 026): every subject parked in
// the Pause column carries a traced D4, and a few subjects in flow carry a
// D2 / D3 / D5, some with a review date already past — so the fiche, the
// tickets and the sidebar have something to show. Drawn from the seeded
// RNG AFTER every other draw, so the validated dataset stays untouched.

import type { BoardConfig, Card } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { lifecycleEvent } from "../../core/events.ts";
import type { SeededRandom } from "./random.ts";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Share of in-flow subjects (outside Pause) that carry a decision. */
const DECIDED_SHARE = 0.08;
/** Column that means D4 (a parked subject). */
const PAUSE_COLUMN = "pause";
/** Columns where decisions are drawn; terminal stages carry none. */
const FLOW_COLUMNS: ReadonlySet<string> = new Set(["qualification", "etudes", "prets", "actifs"]);

const REASONS: readonly string[] = [
  "Équipe Archi & Dev saturée jusqu’à la fin du trimestre.",
  "Valeur attendue faible au regard du reste à faire.",
  "Engagement pris auprès du métier, à protéger.",
  "Dépendance non levée côté fournisseur.",
  "Périmètre à requalifier avec le RDOM avant tout nouvel engagement.",
  "Proche de la fin : on livre avant d’ouvrir autre chose.",
];

/** Actor written on the synthetic decisions. */
export const DECISION_ACTOR = "rsp-pilote";

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function groundsFor(rng: SeededRandom, config: BoardConfig, family: "proteger" | "pause"): string[] {
  const pool = config.decisionGrounds.filter((ground) => ground.family === family).map((ground) => ground.id);
  return rng.shuffle(pool).slice(0, Math.min(pool.length, rng.int(1, 2)));
}

function decisionFor(rng: SeededRandom, columnId: string): string | null {
  if (columnId === PAUSE_COLUMN) return "D4";
  if (!FLOW_COLUMNS.has(columnId) || rng.next() >= DECIDED_SHARE) return null;
  const roll = rng.next();
  return roll < 0.6 ? "D2" : roll < 0.8 ? "D3" : "D5";
}

/**
 * The decided events of one subject (zero or one).
 * Inputs: the seeded RNG, the board config (decision ids, grid terms), the
 * subject (column, creation date), now in ms.
 * Output: the events (never dated before the subject exists). Failure:
 * none — a config without the referential's ids yields no event.
 */
export function decisionEvents(
  rng: SeededRandom, config: BoardConfig, subject: Pick<Card, "id" | "columnId" | "createdAt">, nowMs: number,
): CardEventInput[] {
  const decisionId = decisionFor(rng, subject.columnId);
  if (decisionId === null || !config.decisions.some((d) => d.id === decisionId)) return [];
  const family = decisionId === "D2" ? "proteger" : "pause";
  const tsMs = Math.max(nowMs - rng.int(3, 60) * DAY_MS, Date.parse(subject.createdAt) + HOUR_MS);
  const reviewDate = decisionId === "D2" ? null : iso(nowMs + rng.int(-20, 45) * DAY_MS).slice(0, 10);
  return [
    lifecycleEvent("decided", subject.id, DECISION_ACTOR, iso(tsMs), {
      decisionId,
      grounds: groundsFor(rng, config, family),
      reason: rng.pick(REASONS),
      reviewDate,
    }),
  ];
}
