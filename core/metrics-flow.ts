// Flow and health half of the Metrics view (design v12): débit, délais,
// encours vs limites, blocages, risques et contraintes. Split from
// metrics.ts to hold the 300-line file cap; computed exclusively from the
// cards and the event log — metrics are queries on events, never a store.

import type { BoardConfig, CardEvent, CardState } from "./types.ts";
import { daysInColumn } from "./aging.ts";
import { flowTimes, terminalColumnIds } from "./flow.ts";

const DAY_MS = 86_400_000;

/** Débit et délais moyens du portefeuille. */
export interface FlowSummary {
  /** Sujets entrés en livraison sur les 30 derniers jours. */
  throughput30: number;
  /** Idem sur 90 jours. */
  throughput90: number;
  /** Lead time moyen (jours), null quand rien n'est livré. */
  leadTimeAvg: number | null;
  /** Cycle time moyen (jours), null quand rien n'est livré. */
  cycleTimeAvg: number | null;
}

/** Encours d'une colonne face à sa limite cumulée. */
export interface WipRow {
  id: string;
  name: string;
  /** Sujets en cours dans la colonne (étapes terminales exclues). */
  count: number;
  /**
   * Limite cumulée = nombre de canaux x la limite de la colonne. La limite
   * WIP est une topologie par colonne appliquée cellule par cellule
   * (ADR 013) ; la somme sur les canaux est donc la limite de la colonne
   * entière. 0 = aucune limite définie.
   */
  limit: number;
  over: boolean;
}

/** Une ligne de la liste des blocages. */
export interface Blockage {
  id: string;
  title: string;
  /** Motif du blocage, null quand il n'a pas été précisé. */
  reason: string | null;
  /** Nom de la colonne courante, ou son id si absente de la config. */
  columnName: string;
  /** Jours passés dans la colonne courante. */
  days: number;
}

/** Un décompte étiqueté (risques par entité, contraintes projet). */
export interface LabelledCount {
  id: string;
  name: string;
  color: string;
  count: number;
}

// Groups the log by card once. flowTimes() re-scans whatever array it is
// given, so handing it a per-card slice turns an O(cards x events) sweep
// into one O(events) pass plus cheap per-card work.
function groupEventsByCard(events: CardEvent[]): Map<string, CardEvent[]> {
  const byCard = new Map<string, CardEvent[]>();
  for (const event of events) {
    const list = byCard.get(event.cardId);
    if (list) list.push(event);
    else byCard.set(event.cardId, [event]);
  }
  return byCard;
}

// Most recent arrival (ms) into a terminal column, or null. "Most recent"
// and not "first": a card sent back and re-delivered counts on its latest
// delivery, which is what a 30/90-day débit is asking about.
function lastTerminalEntry(events: CardEvent[], terminal: ReadonlySet<string>): number | null {
  let latest: number | null = null;
  for (const event of events) {
    if (event.toColumn === null || !terminal.has(event.toColumn)) continue;
    const ts = Date.parse(event.ts);
    if (!Number.isNaN(ts) && (latest === null || ts > latest)) latest = ts;
  }
  return latest;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Débit et délais moyens sur les sujets livrés (colonne terminale ou
 * au-delà, résolue depuis la config).
 * Inputs: the active card states, the full event log, the board config, now.
 * Output: a FlowSummary. Failure: none — a portfolio with nothing delivered
 * yields zeros and null averages.
 */
export function flowSummary(
  cards: readonly CardState[],
  events: CardEvent[],
  config: BoardConfig,
  now: Date,
): FlowSummary {
  const terminal = terminalColumnIds(config);
  const byCard = groupEventsByCard(events);
  const nowMs = now.getTime();
  const leads: number[] = [];
  const cycles: number[] = [];
  let throughput30 = 0;
  let throughput90 = 0;
  for (const card of cards) {
    if (!terminal.has(card.columnId)) continue;
    const mine = byCard.get(card.id) ?? [];
    const times = flowTimes(mine, card.id, config, now);
    if (times.leadTime !== null) leads.push(times.leadTime);
    if (times.cycleTime !== null) cycles.push(times.cycleTime);
    const delivered = lastTerminalEntry(mine, terminal);
    if (delivered === null) continue;
    const days = (nowMs - delivered) / DAY_MS;
    if (days <= 30) throughput30++;
    if (days <= 90) throughput90++;
  }
  return { throughput30, throughput90, leadTimeAvg: average(leads), cycleTimeAvg: average(cycles) };
}

/**
 * Encours par colonne face à la limite cumulée (canaux x limite colonne).
 * Les étapes terminales sont exclues du décompte : ce qui est livré n'est
 * plus de l'encours.
 * Inputs: the active card states, the board config.
 * Output: one WipRow per configured column, in board order. A column
 * without a WIP limit reports limit 0 and is never « over ». Failure: none.
 */
export function wipRows(cards: readonly CardState[], config: BoardConfig): WipRow[] {
  const terminal = terminalColumnIds(config);
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (terminal.has(card.columnId)) continue;
    counts.set(card.columnId, (counts.get(card.columnId) ?? 0) + 1);
  }
  const laneCount = config.lanes.length;
  return config.columns.map((column) => {
    const count = counts.get(column.id) ?? 0;
    const limit = column.wip === null ? 0 : column.wip * laneCount;
    return { id: column.id, name: column.name, count, limit, over: limit > 0 && count > limit };
  });
}

/**
 * Les sujets bloqués, du blocage le plus ancien au plus récent.
 * Inputs: the active card states, the board config, now.
 * Output: one Blockage per blocked card, sorted by decreasing days in
 * column. Failure: none.
 */
export function blockages(cards: readonly CardState[], config: BoardConfig, now: Date): Blockage[] {
  const columnName = new Map(config.columns.map((column) => [column.id, column.name]));
  const rows: Blockage[] = [];
  for (const card of cards) {
    if (!card.blocked) continue;
    rows.push({
      id: card.id,
      title: card.title,
      reason: card.blockedReason,
      columnName: columnName.get(card.columnId) ?? card.columnId,
      days: daysInColumn(card, now),
    });
  }
  rows.sort((a, b) => b.days - a.days || a.title.localeCompare(b.title, "fr"));
  return rows;
}

/**
 * Nombre de sujets porteurs de chaque risque, par entité porteuse.
 * Inputs: the active card states, the board config.
 * Output: one LabelledCount per configured risk type carrying at least one
 * subject, sorted by decreasing count. Risk types unknown to the config are
 * ignored. Failure: none.
 */
export function riskCounts(cards: readonly CardState[], config: BoardConfig): LabelledCount[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    for (const risk of card.risks) {
      counts.set(risk.type, (counts.get(risk.type) ?? 0) + 1);
    }
  }
  return config.riskTypes
    .map((type) => ({ id: type.id, name: type.name, color: type.color, count: counts.get(type.id) ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Répartition des contraintes projet, plus le décompte des sujets qui n'en
 * portent aucune (id « aucune », hors config — voir core/filters.ts).
 * Inputs: the active card states, the board config.
 * Output: one LabelledCount per configured constraint (even at zero, the
 * chips are a fixed read-out) followed by the « Aucune » row.
 * Failure: none.
 */
export function constraintCounts(cards: readonly CardState[], config: BoardConfig): LabelledCount[] {
  const counts = new Map<string, number>();
  let none = 0;
  for (const card of cards) {
    if (card.projectConstraints.length === 0) none++;
    for (const id of card.projectConstraints) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const rows = config.projectConstraints.map((constraint) => ({
    id: constraint.id,
    name: constraint.short,
    color: constraint.color,
    count: counts.get(constraint.id) ?? 0,
  }));
  rows.push({ id: "aucune", name: "Aucune", color: "#94a3b8", count: none });
  return rows;
}
