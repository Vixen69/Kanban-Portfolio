// The grouped changes of the ONE change engine (ADR 053/055), as the PMO
// reads them: one section per fact — the refreshed values first (plan de
// charge, the money and effort figures, chef de projet, date RDR, type,
// titre, domaine, déplacés), the presence changes before them where the
// screen shows them, the archiving after. Shared by the import report and
// « Comparer avec maintenant ». Also the words and numbers of one row: ids
// into the config's names, ISO days into French dates, the signed delta
// and its direction, at the engine's precision (the hundredth). Pure; no
// React.

import type { BoardConfig } from "../core/types.ts";
import type { CardChange, CardPlanFigures, ChangeKind, FigureFact, PlanChange, PlanFigures } from "../core/snapshot-diff.ts";
import { FIGURE_FACTS } from "../core/snapshot-diff.ts";
import { domainName } from "../core/domain-check.ts";

/**
 * The numbers of a change row: French, at most two decimals — the
 * precision the change engine compares at (core/figure-changes.ts), so a
 * listed change never reads « 12,3 → 12,3 ». The board keeps its one
 * decimal (./format.ts).
 */
const CHANGE_NUM = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function fmtChange(value: number): string {
  return Number.isFinite(value) ? CHANGE_NUM.format(value) : "—";
}

/** One section of grouped changes: its key, its French title, its rows. */
export interface ChangeSection {
  key: string;
  label: string;
  items: CardChange[];
}

/**
 * Which changes a screen groups:
 * - « values »: the import report, whose arrivals, absences and returns are
 *   listed apart with their reasons — they are left out here;
 * - « all »: « Comparer avec maintenant », every kind.
 */
export type ChangeScope = "values" | "all";

/** A section is folded above this many rows, even when it is the first. */
export const OPEN_MAX_ROWS = 30;

type Spec = { key: string; label: string; match: (change: CardChange) => boolean };

const byKind = (kind: ChangeKind, label: string): Spec => ({ key: kind, label, match: (change) => change.kind === kind });

// The figures in the mockup's order: money the PMO watches first, then effort.
const FIGURE_ORDER: readonly FigureFact[] = [
  "budgetEstimated", "budgetConsumed", "budgetEngaged", "budgetRdli", "effortEstimated", "effortConsumed",
];

/**
 * A label as a section title: its first letter upper-cased (« chef de
 * projet » → « Chef de projet »). Input: the text. Output: the title.
 * Failure modes: none — an empty text stays empty.
 */
export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function byFigure(fact: FigureFact): Spec {
  const spec = FIGURE_FACTS.find((entry) => entry.fact === fact);
  const label = spec === undefined ? fact : `${capitalized(spec.label)} ${spec.unit}`;
  return { key: `figure:${fact}`, label, match: (change) => change.kind === "figure" && change.figure.fact === fact };
}

const PRESENCE: readonly Spec[] = [
  byKind("added", "Nouveaux projets"),
  byKind("absent", "Absents du dernier import (gardés, marqués ∅)"),
  byKind("removed", "Disparus du tableau"),
  byKind("back", "De retour dans l’import"),
];

const VALUES: readonly Spec[] = [
  byKind("plan", "Plan de charge"),
  ...FIGURE_ORDER.map(byFigure),
  byKind("owner", "Chef de projet"),
  byKind("dateRdr", "Date RDR"),
  byKind("type", "Type"),
  byKind("title", "Titre"),
  byKind("domain", "Domaine"),
  byKind("moved", "Déplacés"),
];

const LIFECYCLE: readonly Spec[] = [byKind("archived", "Archivés"), byKind("unarchived", "Désarchivés")];

/**
 * The changes grouped by fact, in reading order, empty sections left out;
 * inside a section the engine's order (by title) is kept.
 * Inputs: the changes, the scope. Output: the non-empty sections.
 * Failure modes: none — a kind no section knows is not shown.
 */
export function groupChanges(changes: readonly CardChange[], scope: ChangeScope): ChangeSection[] {
  const specs = scope === "all" ? [...PRESENCE, ...VALUES, ...LIFECYCLE] : [...VALUES, ...LIFECYCLE];
  return specs
    .map((spec) => ({ key: spec.key, label: spec.label, items: changes.filter(spec.match) }))
    .filter((section) => section.items.length > 0);
}

/**
 * Whether a section starts unfolded: only the first one, and only while it
 * is short enough to read at a glance. Inputs: its index among the shown
 * sections, its row count. Output: true when open. Failure modes: none.
 */
export function sectionOpen(index: number, rows: number): boolean {
  return index === 0 && rows <= OPEN_MAX_ROWS;
}

/**
 * An ISO day (« 2026-10-01 ») as the French read it (« 01/10/2026 »).
 * Input: the ISO text. Output: the French date, or the text unchanged when
 * it is not an ISO day. Failure modes: none.
 */
export function frDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match === null ? iso : `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * One side of a text change in the config's words: a column (and canal)
 * name for a move, a domain or type name, a French date for the RDR; the
 * text itself otherwise. Inputs: the config, the change's kind, the value.
 * Output: the words, « — » for none, « Sans domaine » for an empty domain
 * (ADR 061). Failure modes: none — an id the config no longer declares
 * shows as is.
 */
export function changeWords(config: BoardConfig, kind: ChangeKind, value: string | null): string {
  if (kind === "domain" && value !== null) return domainName(config, value);
  if (value === null || value === "") return "—";
  if (kind === "type") return config.types.find((t) => t.id === value)?.name ?? value;
  if (kind === "dateRdr") return frDay(value);
  if (kind !== "moved") return value;
  const [columnId, laneId] = value.split("|");
  const column = config.columns.find((c) => c.id === columnId)?.name ?? columnId ?? "?";
  return laneId === undefined ? column : `${column} · ${config.lanes.find((l) => l.id === laneId)?.name ?? laneId}`;
}

/**
 * A figure of a row: at most two decimals (the engine's precision),
 * French. Input: the value or null. Output: the text, « — » for none.
 * Failure modes: none.
 */
export function fmtFigure(value: number | null): string {
  return value === null ? "—" : fmtChange(value);
}

/** The direction of a change: up, down, or none (no delta, or zero once rounded). */
export type Trend = "up" | "down" | null;

/**
 * The direction and signed text of a delta (« +12,5 », « −3 »).
 * Input: the delta, null when a side is missing. Output: { trend, text };
 * text is empty when there is no direction. Failure modes: none.
 */
export function signedDelta(delta: number | null): { trend: Trend; text: string } {
  if (delta === null || fmtChange(Math.abs(delta)) === "0") return { trend: null, text: "" };
  return delta > 0 ? { trend: "up", text: `+${fmtChange(delta)}` } : { trend: "down", text: `−${fmtChange(-delta)}` };
}

/** What a trend is read on: a figure of the card, or a plan de charge figure (prévu, RAF). */
export type TrendMeasure = FigureFact | "planned" | "raf";

/**
 * The tone of a trend mark: « warn » (amber — a demand that grows), « ok »
 * (green — a demand that shrinks), « neutral » (the normal progress of a
 * project, or a fall that says nothing).
 */
export type TrendTone = "warn" | "ok" | "neutral";

/** Rises that are a project's normal progress: money spent or engaged, days consumed. */
const PROGRESS: ReadonlySet<TrendMeasure> = new Set(["budgetConsumed", "budgetEngaged", "effortConsumed"]);
/** Falls worth the green: less left to do, a lower estimate. */
const RELIEF: ReadonlySet<TrendMeasure> = new Set(["raf", "budgetEstimated"]);

/**
 * The tone of a trend on a measure: a rise of réalisé k€, engagé k€ or
 * consommé j.h is neutral (the project progresses); a rise of estimé,
 * enveloppe RDLI, meilleur estimé, prévu or RAF is amber; a fall of RAF
 * or estimé is green, any other fall neutral.
 * Inputs: the measure, the trend. Output: the tone, null when no trend.
 * Failure modes: none.
 */
export function trendTone(measure: TrendMeasure, trend: Trend): TrendTone | null {
  if (trend === null) return null;
  if (trend === "up") return PROGRESS.has(measure) ? "neutral" : "warn";
  return RELIEF.has(measure) ? "ok" : "neutral";
}

/**
 * The delta of two plan figures at the engine's precision (the hundredth),
 * so float noise (0.1 + 0.2) never decides a direction. Inputs: before,
 * after. Output: after − before, rounded. Failure modes: none.
 */
export function planDelta(before: number, after: number): number {
  return Math.round((after - before) * 100) / 100;
}

/**
 * A métier's name. Inputs: the config, the profile id. Output: the name,
 * the id when the config no longer declares it. Failure modes: none.
 */
export function profileName(config: BoardConfig, profileId: string): string {
  return config.profiles.find((profile) => profile.id === profileId)?.name ?? profileId;
}

/**
 * « a → b » of one plan figure, in j.h. Inputs: the figures before and
 * after, the figure read. Output: the text. Failure modes: none.
 */
export function planPair(before: PlanFigures, after: PlanFigures, key: keyof PlanFigures): string {
  return `${fmtChange(before[key])} → ${fmtChange(after[key])}`;
}

function planSide(figures: CardPlanFigures, key: "planned" | "raf"): string {
  return figures.breakdown ? fmtChange(figures[key]) : "sans ventilation";
}

/**
 * The one-line reading of a plan de charge change: « prévu a → b j.h · RAF
 * a → b j.h », « sans ventilation » for a side without per-métier plan
 * (counted 0, ADR 048). Input: the plan change. Output: the text.
 * Failure modes: none.
 */
export function planSummary(plan: PlanChange): string {
  const { before, after } = plan;
  return `prévu ${planSide(before, "planned")} → ${planSide(after, "planned")} j.h · RAF ${planSide(before, "raf")} → ${planSide(after, "raf")} j.h`;
}

/**
 * The list key of a change: a card has one change per kind, and one per
 * figure. Input: the change. Output: the key. Failure modes: none.
 */
export function changeKey(change: CardChange): string {
  return change.kind === "figure" ? `${change.kind}:${change.figure.fact}:${change.cardId}` : `${change.kind}:${change.cardId}`;
}
