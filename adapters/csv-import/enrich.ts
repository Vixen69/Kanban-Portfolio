// The card assembly (R2/R7/R8): the `projets` sheet IS the deck — every
// entry is a card (identity, type, domain, sub-domain, owner, dates come
// from it); ProjetsJalons gives the position — unless the project's process
// state is a config done state (« Terminé »): then Done, whatever the
// milestones (ADR 043) — SP the 2026 costs. Join
// keys, in order of trust: Id, then full name, then the PE code embedded
// in the name (SP only). Every miss is counted, never silent. The report's
// « pris » lines ARE the cards. ADR 058: the name / code fallback is taken
// only when the card found no row by its Id, the key is carried by one
// row only, and that row carries no OTHER Id — a card never borrows
// another project's milestones or k€. ADR 062: the joins ADR 058 refuses
// or cannot settle, and the ambiguous SP figures, are « Doutes à
// trancher » (enrich-joins.ts).

import type { BoardConfig } from "../../core/types.ts";
import { resolveFlowAnchors } from "../../core/flow.ts";
import { createTolerantLookup } from "./normalize.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { ProjetEntry, ProjetsTable } from "./projets.ts";
import type { JalonEntry, JalonsTable, Stage } from "./jalons.ts";
import type { SpTable } from "./sp.ts";
import type { CardCharge } from "./charges.ts";
import { doubt, take, warn } from "./report.ts";
import { disambiguateIds } from "./card-identity.ts";
import type { ImportReport, RowRef } from "./report.ts";
import { createNameMarkerResolver, ruleLabel } from "./portfolio.ts";
import type { PortfolioHit } from "./portfolio.ts";
import { joinJalons, joinSp, spFigures } from "./enrich-joins.ts";
import type { JoinState } from "./enrich-joins.ts";
import type { DoubtBook } from "./doubt-book.ts";

/** One card, fully enriched — what the real import will load. */
export interface EnrichedCard {
  title: string;
  normalizedName: string;
  /** The Sciforma Id (stable identity), else a PE code, else null. */
  codename: string | null;
  /** Canal: every imported card lands in the « complicated » lane (Q3). */
  laneId: string;
  domainId: string | null;
  subDomainId: string | null;
  /** How the domain came: Orga columns, PARAM / the portfolio, or a bracketed name marker (ADR 036). */
  domainSource: "orga" | "param" | "marker" | null;
  /** The rule that gave the domain, worded for the report and the conflicts; null when none. */
  domainRule: string | null;
  owner: string | null;
  typeId: string | null;
  columnId: string;
  /** True when the export positioned the card — ProjetsJalons, or a done state (ADR 043); else entry column. */
  positioned: boolean;
  createdAt: string | null;
  dateRdr: string | null;
  budgetRdli: number | null;
  budgetEstimated: number | null;
  budgetConsumed: number | null;
  budgetEngaged: number | null;
  effortEstimated: number | null;
  effortConsumed: number | null;
  /** 2026 charges by profile, attached by charges.ts (empty until then). */
  charges: CardCharge[];
  /** The PdC project key the card joined (charges.ts), for the capacity
   * assignments (ADR 024); null until then or when uncovered. */
  pdcKey: string | null;
  ref: RowRef;
  /** The year-less board id when two name-derived ids collided (card-identity.ts, ADR 058); absent otherwise. */
  baseId?: string;
}

/** Join and coverage counters for the assembly read-out. */
export interface CardStats {
  total: number;
  positioned: number;
  stageCounts: Map<Stage, number>;
  withoutJalons: number;
  jalonsOutside: number;
  /** Cards the project's process state placed in Done (ADR 043). */
  doneByState: number;
  spById: number;
  spByName: number;
  spByCode: number;
  withoutSp: number;
  spOutside: number;
  withDomain: number;
  withSubDomain: number;
  /** Cards whose domain a bracketed name marker forced (ADR 036). */
  withMarker: number;
  withOwner: number;
  withType: number;
}

/** The assembled deck, or null when the `projets` sheet is absent. */
export interface CardAssembly {
  cards: EnrichedCard[];
  stats: CardStats;
}

interface JoinContext extends JoinState {
  report: ImportReport;
  laneId: string;
  /** The terminal column and the states that send a card there (ADR 043); null = no terminal anchor. */
  doneColumnId: string | null;
  isDoneState: (state: string) => boolean;
  stats: CardStats;
  /** The bracketed name markers of the config (ADR 036). */
  marker: (name: string) => PortfolioHit | null;
}

/**
 * Assembles the cards from the perimeter and its two enrichments.
 * Inputs: the `projets` table (null -> no assembly), the ProjetsJalons and
 * SP tables (nullable), the board config (lane, entry column, names), the
 * report, the book of the « Doutes à trancher » (ADR 062; absent = the
 * joins of ADR 058, French readings).
 * Outputs: the cards + stats; side effects: one « pris » line per card and
 * aggregated signalements for every join miss.
 * Failure modes: none.
 */
export function assembleCards(
  projets: ProjetsTable | null, jalons: JalonsTable | null, sp: SpTable | null,
  config: BoardConfig, report: ImportReport, book?: DoubtBook,
): CardAssembly | null {
  if (projets === null) return null;
  const ctx = createContext(jalons, sp, config, report, book);
  const cards = projets.entries.map((entry) => buildCard(ctx, entry));
  ctx.stats.total = cards.length;
  ctx.stats.jalonsOutside = (jalons?.entries.length ?? 0) - ctx.consumedJalons.size;
  ctx.stats.spOutside = (sp?.entries.length ?? 0) - ctx.consumedSp.size;
  for (const [message, t] of ctx.tallies) warn(report, `${message} : ${tallyLabel(t)}`, "assemblage");
  for (const clash of disambiguateIds(cards)) {
    doubt(report, "assemblage",
      `identité dérivée du nom « ${clash.id} » partagée par ${clash.titles.map((t) => `« ${t} »`).join(", ")} — un suffixe tiré du nom complet les distingue (ADR 058)`);
  }
  return { cards, stats: ctx.stats };
}

function createContext(
  jalons: JalonsTable | null, sp: SpTable | null, config: BoardConfig, report: ImportReport, book: DoubtBook | undefined,
): JoinContext {
  const anchors = resolveFlowAnchors(config);
  const doneStates = createTolerantLookup((config.exercise.doneStates ?? []).map((s): [string, string] => [s, s]));
  return {
    report, jalons, sp,
    laneId: config.lanes.find((l) => l.natureKey === "complicated")?.id ?? config.lanes[0]?.id ?? "",
    entryColumnId: anchors?.entry.id ?? config.columns[0]?.id ?? "",
    doneColumnId: anchors?.terminal?.id ?? null,
    isDoneState: (state) => state.trim() !== "" && doneStates(state) !== null,
    columnNames: new Map(config.columns.map((c) => [c.id, c.name])),
    consumedJalons: new Set(), consumedSp: new Set(),
    stats: {
      total: 0, positioned: 0, stageCounts: new Map(), withoutJalons: 0, jalonsOutside: 0, doneByState: 0,
      spById: 0, spByName: 0, spByCode: 0, withoutSp: 0, spOutside: 0,
      withDomain: 0, withSubDomain: 0, withMarker: 0, withOwner: 0, withType: 0,
    },
    tallies: new Map(),
    marker: createNameMarkerResolver(config),
    book,
  };
}

type DomainPart = Pick<EnrichedCard, "domainId" | "subDomainId" | "domainSource" | "domainRule">;

// The domain a card lands in (ADR 036): a bracketed marker in the project
// NAME forces its domain — the portfolio of a sold project is not to be
// trusted — else what the perimeter reader resolved.
function domainOf(ctx: JoinContext, entry: ProjetEntry): DomainPart {
  const marker = ctx.marker(entry.name);
  if (marker === null) {
    return { domainId: entry.domainId, subDomainId: entry.subDomainId, domainSource: entry.domainSource, domainRule: entry.domainRule };
  }
  ctx.stats.withMarker++;
  tallyInto(ctx.tallies, `${ruleLabel(marker)} → ${marker.domainId} (prime sur le portefeuille, ADR 036)`, entry.ref.line);
  return { domainId: marker.domainId, subDomainId: null, domainSource: "marker", domainRule: ruleLabel(marker) };
}

// Where the card lands (ADR 043): a project whose process state is a done
// state goes to the terminal column whatever its milestones — a missing or
// unapproved RDR is said in the report, the state wins. Else the last
// milestone passed; else the entry column, unpositioned.
function positionOf(ctx: JoinContext, entry: ProjetEntry, jalon: JalonEntry | null): { columnId: string; positioned: boolean } {
  if (ctx.doneColumnId !== null && isFinished(ctx, entry)) {
    ctx.stats.doneByState++;
    if (jalon?.stage !== "done") {
      tallyInto(ctx.tallies, `état « ${entry.state.trim()} » sans RDR approuvé — carte placée dans Terminé par l'état (ADR 043)`, entry.ref.line);
    }
    return { columnId: ctx.doneColumnId, positioned: true };
  }
  return { columnId: jalon?.columnId ?? ctx.entryColumnId, positioned: jalon !== null };
}

// True when the project's process state is a config done state and the
// topology has a terminal column to send it to (ADR 043).
function isFinished(ctx: JoinContext, entry: ProjetEntry): boolean {
  return ctx.doneColumnId !== null && ctx.isDoneState(entry.state);
}

// One perimeter row -> one card. The pris line names the column and the
// domain read-out so the ~20-project manual check reads in one glance.
function buildCard(ctx: JoinContext, entry: ProjetEntry): EnrichedCard {
  const jalon = joinJalons(ctx, entry, isFinished(ctx, entry));
  const spEntry = joinSp(ctx, entry);
  const figures = spFigures(ctx, entry, spEntry);
  const s = ctx.stats;
  const domainPart = domainOf(ctx, entry);
  if (domainPart.domainId !== null) s.withDomain++;
  if (domainPart.subDomainId !== null) s.withSubDomain++;
  if (entry.owner !== null) s.withOwner++;
  if (entry.typeId !== null) s.withType++;
  const card: EnrichedCard = {
    title: entry.title, normalizedName: entry.normalizedName, codename: entry.codename,
    laneId: ctx.laneId,
    ...domainPart,
    owner: entry.owner, typeId: entry.typeId,
    ...positionOf(ctx, entry, jalon),
    createdAt: entry.createdAt, dateRdr: entry.dateRdr,
    // The four k€ figures come from SP alone (author, 2026-09-10): the
    // Projets « Budget RDLI Total Coût » is plurianual and no longer feeds
    // the card, even as a fallback (Q23 tranchée).
    ...figures,
    effortEstimated: entry.effortEstimated, effortConsumed: entry.effortConsumed,
    charges: [], pdcKey: null, ref: entry.ref,
  };
  const columnName = ctx.columnNames.get(card.columnId) ?? card.columnId;
  const domain = domainPart.domainId === null ? "sans domaine"
    : `${domainPart.domainId}${domainPart.subDomainId === null ? "" : ` / ${domainPart.subDomainId}`}`;
  take(ctx.report, card.ref, card.title, `carte → colonne « ${columnName} » · ${domain}`, card.codename ?? undefined);
  return card;
}

/** Card counts per column id, in board order (for the assembly line). */
export function cardDistribution(cards: EnrichedCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.columnId, (counts.get(card.columnId) ?? 0) + 1);
  return counts;
}
