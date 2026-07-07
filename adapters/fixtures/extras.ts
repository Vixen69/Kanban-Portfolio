// design-v10 detail-field seeding for the fixtures, split from generate.ts to
// respect the 300-line file cap. seedExtras runs as a FINAL pass over the
// drafts: fresh RNG draws taken AFTER every position/age draw, so the board
// grid and per-card ages stay identical to the validated prototype.

import type { BoardConfig, ChargeEntry, Financials, Risk } from "../../core/types.ts";
import type { Subject } from "../../core/ports.ts";
import type { SeededRandom } from "./random.ts";
import { ALERT_NOTES, CONTENTION_NOTES, RISK_DESC } from "../../fixtures/dataset.ts";
import { RDR_HORIZON } from "./distributions.ts";

const DAY_MS = 86_400_000;

// Splits the best estimate (j.h) across 1-3 shuffled profiles (design weights),
// returning the plan de charge entries and the chosen profiles (for contention).
function splitCharge(rng: SeededRandom, profileIds: string[], est: number, cons: number): { entries: ChargeEntry[]; profs: string[] } {
  const profs = rng.shuffle(profileIds).slice(0, rng.int(1, 3));
  const weights = profs.map(() => 0.4 + rng.next());
  const sum = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const entries = profs.map((profileId, i) => {
    const jh = i === profs.length - 1 ? Math.max(0, est - acc) : Math.round((est * (weights[i] as number)) / sum);
    acc += jh;
    const done = est ? Math.round(jh * (cons / est)) : 0;
    return { profileId, jh, done: Math.min(jh, done) };
  });
  return { entries, profs };
}

// 0-2 retained risks, each a bearing entity (riskType id) + a pooled description.
function rollRisks(rng: SeededRandom, riskTypeIds: string[]): Risk[] {
  const chosen = rng.shuffle(riskTypeIds).slice(0, rng.int(0, 2));
  return chosen.map((type) => ({ type, desc: rng.pick(RISK_DESC[type] ?? [""]) }));
}

/**
 * Fills the design-v10 detail fields of one subject in place, derived from its
 * real effort/budget values with fresh RNG draws.
 * Inputs: the seeded RNG, the board config (for profile/risk/constraint ids),
 * the subject to mutate, its financials (budget k€ pair), the current time ms.
 * Output: none — mutates the subject. Failure: none.
 */
export function seedExtras(
  rng: SeededRandom, config: BoardConfig, s: Subject, financials: Financials, nowMs: number,
): void {
  const est = s.effortEstimated ?? 0;
  const cons = s.effortConsumed ?? 0;
  const bEst = financials.budget ?? 0;
  const bCons = financials.consumed ?? 0;
  s.budgetRdli = Math.round(bEst * (0.92 + rng.next() * 0.3));
  s.budgetEngaged = Math.round(bCons + (Math.max(bEst, bCons) - bCons) * (0.35 + rng.next() * 0.5));
  const { entries, profs } = splitCharge(rng, config.profiles.map((p) => p.id), est, cons);
  s.chargeByProfile = entries;
  s.contentionProfiles = rng.next() < 0.5 ? rng.shuffle(profs).slice(0, rng.int(1, Math.min(2, profs.length))) : [];
  s.contentionNote = rng.next() < 0.4 ? rng.pick(CONTENTION_NOTES) : "";
  const [hl, hh] = RDR_HORIZON[s.columnId] ?? [30, 180];
  s.dateRdr = new Date(nowMs + rng.int(hl, hh) * DAY_MS).toISOString();
  s.risks = rollRisks(rng, config.riskTypes.map((r) => r.id));
  s.projectConstraints = rng.shuffle(config.projectConstraints.map((c) => c.id)).slice(0, rng.int(0, 2));
  s.alerts = rng.next() < 0.4 ? rng.shuffle(ALERT_NOTES).slice(0, rng.int(1, 2)) : [];
}
