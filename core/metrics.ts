// Portfolio metrics (design v12, « Metrics ») — the governance read-out a
// portfolio committee acts on: l'argent (budget croisé), la capacité (RAF
// par rôle et contention), le flux (débit, délais) et la santé (blocages,
// risques, encours). Computed EXCLUSIVELY from the event-derived card
// states and the event log: no separate metrics store, metrics are queries
// on events (ADR 002/007).
//
// v12 supersedes the v11 flow diagnostics (temps moyen par étape,
// composition d'âge, goulot) — see ADR 020. The flow/health half lives in
// ./metrics-flow.ts to hold the 300-line file cap.

import type { BoardConfig, CardEvent, CardState } from "./types.ts";
import { terminalColumnIds } from "./flow.ts";
import { profileLoadRows, remainingLoad, totalsOf, type GroupTotals } from "./totals.ts";
import {
  blockages,
  constraintCounts,
  flowSummary,
  riskCounts,
  wipRows,
  type Blockage,
  type FlowSummary,
  type LabelledCount,
  type WipRow,
} from "./metrics-flow.ts";

/** Charge restante et tension d'un profil DSI sur tout le portefeuille. */
export interface RoleLoad {
  id: string;
  name: string;
  color: string;
  /** Plan de charge total, j.h. */
  jh: number;
  /** Consommé, j.h. */
  done: number;
  /** Reste à faire = max(0, jh - done), j.h. */
  remaining: number;
  /** Nombre de sujets signalant ce profil « en tension ». */
  contention: number;
}

/** Everything the Metrics view renders. */
export interface PortfolioMetrics {
  /** Sujets non archivés. */
  activeCount: number;
  /** Sujets hors étapes terminales. */
  inFlowCount: number;
  /** Sujets en étape terminale. */
  finishedCount: number;
  blockedCount: number;
  /** Budget croisé agrégé (k€) et plan de charge (j.h) du portefeuille. */
  budget: GroupTotals;
  /** Reste à faire cumulé, j.h. */
  remainingTotal: number;
  /** Engagé / enveloppe RDLI, en %. 0 quand l'enveloppe est inconnue. */
  engagedPct: number;
  /** Réalisé / enveloppe RDLI, en %. 0 quand l'enveloppe est inconnue. */
  consumedPct: number;
  /** Profils porteurs de charge ou signalés en tension. */
  roles: RoleLoad[];
  /** Sous-ensemble des profils en tension, du plus signalé au moins. */
  contention: RoleLoad[];
  flow: FlowSummary;
  wip: WipRow[];
  blockages: Blockage[];
  risks: LabelledCount[];
  constraints: LabelledCount[];
}

// Sujets signalant chaque profil « en tension », comptés une fois par carte.
function contentionCounts(cards: readonly CardState[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    for (const id of new Set(card.contentionProfiles)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

// Merges the charge breakdown with the contention flags: a profile appears
// as soon as it carries charge OR is flagged, so a profile signalled en
// tension with nothing planned is still visible (that IS the warning).
function capacityRoles(
  totals: GroupTotals,
  counts: Map<string, number>,
  config: BoardConfig,
): RoleLoad[] {
  const rows = new Map<string, RoleLoad>();
  for (const row of profileLoadRows(totals, config)) {
    rows.set(row.id, { ...row, contention: counts.get(row.id) ?? 0 });
  }
  for (const [id, contention] of counts) {
    if (rows.has(id)) continue;
    const profile = config.profiles.find((candidate) => candidate.id === id);
    rows.set(id, {
      id,
      name: profile?.name ?? id,
      color: profile?.color ?? "#64748b",
      jh: 0,
      done: 0,
      remaining: 0,
      contention,
    });
  }
  return [...rows.values()].sort(
    (a, b) => b.contention - a.contention || b.remaining - a.remaining || a.name.localeCompare(b.name, "fr"),
  );
}

// Percentage of the RDLI envelope, rounded. A zero/unknown envelope yields
// 0 rather than Infinity: « pas d'enveloppe » is not « dépassement ».
function percentOfEnvelope(value: number, envelope: number): number {
  return envelope === 0 ? 0 : Math.round((value / envelope) * 100);
}

/**
 * Computes the whole Metrics read-out.
 * Inputs: the folded card states (archived ones are filtered out HERE, so
 * callers may hand over the full portfolio), the raw event log, the board
 * config and now.
 * Output: a PortfolioMetrics — see the interface doc for each part.
 * Failure: none — an empty portfolio yields zeroed metrics, null averages
 * and empty lists.
 */
export function computePortfolioMetrics(
  cards: readonly CardState[],
  events: CardEvent[],
  config: BoardConfig,
  now: Date,
): PortfolioMetrics {
  const active = cards.filter((card) => !card.archived);
  const terminal = terminalColumnIds(config);
  const budget = totalsOf(active);
  const roles = capacityRoles(budget, contentionCounts(active), config);
  let inFlowCount = 0;
  let blockedCount = 0;
  for (const card of active) {
    if (!terminal.has(card.columnId)) inFlowCount++;
    if (card.blocked) blockedCount++;
  }
  return {
    activeCount: active.length,
    inFlowCount,
    finishedCount: active.length - inFlowCount,
    blockedCount,
    budget,
    remainingTotal: remainingLoad(budget),
    engagedPct: percentOfEnvelope(budget.engaged, budget.rdli),
    consumedPct: percentOfEnvelope(budget.consumed, budget.rdli),
    roles,
    contention: roles.filter((role) => role.contention > 0),
    flow: flowSummary(active, events, config, now),
    wip: wipRows(active, config),
    blockages: blockages(active, config, now),
    risks: riskCounts(active, config),
    constraints: constraintCounts(active, config),
  };
}
