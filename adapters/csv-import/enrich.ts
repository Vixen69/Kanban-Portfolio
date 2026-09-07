// The card assembly (R2/R7/R8): the `projets` sheet IS the deck — every
// entry is a card (identity, type, domain, sub-domain, owner, dates come
// from it); ProjetsJalons gives the position, SP the 2026 costs. Join
// keys, in order of trust: Id, then full name, then the PE code embedded
// in the name (SP only). Every miss is counted, never silent. The report's
// « pris » lines ARE the cards.

import type { BoardConfig } from "../../core/types.ts";
import { resolveFlowAnchors } from "../../core/flow.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { ProjetEntry, ProjetsTable } from "./projets.ts";
import type { JalonEntry, JalonsTable, Stage } from "./jalons.ts";
import type { SpEntry, SpTable } from "./sp.ts";
import type { CardCharge } from "./charges.ts";
import { take, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

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
  domainSource: "orga" | "param" | null;
  owner: string | null;
  typeId: string | null;
  columnId: string;
  /** True when ProjetsJalons positioned the card (else entry column). */
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
}

/** Join and coverage counters for the assembly read-out. */
export interface CardStats {
  total: number;
  positioned: number;
  stageCounts: Map<Stage, number>;
  withoutJalons: number;
  jalonsOutside: number;
  spById: number;
  spByName: number;
  spByCode: number;
  withoutSp: number;
  spOutside: number;
  withDomain: number;
  withSubDomain: number;
  withOwner: number;
  withType: number;
}

/** The assembled deck, or null when the `projets` sheet is absent. */
export interface CardAssembly {
  cards: EnrichedCard[];
  stats: CardStats;
}

interface JoinContext {
  report: ImportReport;
  jalons: JalonsTable | null;
  sp: SpTable | null;
  laneId: string;
  entryColumnId: string;
  columnNames: Map<string, string>;
  consumedJalons: Set<JalonEntry>;
  consumedSp: Set<SpEntry>;
  stats: CardStats;
  tallies: Map<string, Tally>;
}

/**
 * Assembles the cards from the perimeter and its two enrichments.
 * Inputs: the `projets` table (null -> no assembly), the ProjetsJalons and
 * SP tables (nullable), the board config (lane, entry column, names), the
 * report.
 * Outputs: the cards + stats; side effects: one « pris » line per card and
 * aggregated signalements for every join miss.
 * Failure modes: none.
 */
export function assembleCards(
  projets: ProjetsTable | null, jalons: JalonsTable | null, sp: SpTable | null,
  config: BoardConfig, report: ImportReport,
): CardAssembly | null {
  if (projets === null) return null;
  const ctx = createContext(jalons, sp, config, report);
  const cards = projets.entries.map((entry) => buildCard(ctx, entry));
  ctx.stats.total = cards.length;
  ctx.stats.jalonsOutside = (jalons?.entries.length ?? 0) - ctx.consumedJalons.size;
  ctx.stats.spOutside = (sp?.entries.length ?? 0) - ctx.consumedSp.size;
  for (const [message, t] of ctx.tallies) warn(report, `${message} : ${tallyLabel(t)}`, "assemblage");
  return { cards, stats: ctx.stats };
}

function createContext(
  jalons: JalonsTable | null, sp: SpTable | null, config: BoardConfig, report: ImportReport,
): JoinContext {
  return {
    report, jalons, sp,
    laneId: config.lanes.find((l) => l.natureKey === "complicated")?.id ?? config.lanes[0]?.id ?? "",
    entryColumnId: resolveFlowAnchors(config)?.entry.id ?? config.columns[0]?.id ?? "",
    columnNames: new Map(config.columns.map((c) => [c.id, c.name])),
    consumedJalons: new Set(), consumedSp: new Set(),
    stats: {
      total: 0, positioned: 0, stageCounts: new Map(), withoutJalons: 0, jalonsOutside: 0,
      spById: 0, spByName: 0, spByCode: 0, withoutSp: 0, spOutside: 0,
      withDomain: 0, withSubDomain: 0, withOwner: 0, withType: 0,
    },
    tallies: new Map(),
  };
}

// One perimeter row -> one card. The pris line names the column and the
// domain read-out so the ~20-project manual check reads in one glance.
function buildCard(ctx: JoinContext, entry: ProjetEntry): EnrichedCard {
  const jalon = joinJalons(ctx, entry);
  const spEntry = joinSp(ctx, entry);
  const s = ctx.stats;
  if (entry.domainId !== null) s.withDomain++;
  if (entry.subDomainId !== null) s.withSubDomain++;
  if (entry.owner !== null) s.withOwner++;
  if (entry.typeId !== null) s.withType++;
  const card: EnrichedCard = {
    title: entry.name, normalizedName: entry.normalizedName, codename: entry.codename,
    laneId: ctx.laneId,
    domainId: entry.domainId, subDomainId: entry.subDomainId, domainSource: entry.domainSource,
    owner: entry.owner, typeId: entry.typeId,
    columnId: jalon?.columnId ?? ctx.entryColumnId, positioned: jalon !== null,
    createdAt: entry.createdAt, dateRdr: entry.dateRdr,
    budgetRdli: entry.budgetRdli ?? spEntry?.budgetRdli ?? null,
    budgetEstimated: spEntry?.budgetEstimated ?? null,
    budgetConsumed: spEntry?.budgetConsumed ?? null,
    budgetEngaged: spEntry?.budgetEngaged ?? null,
    effortEstimated: entry.effortEstimated, effortConsumed: entry.effortConsumed,
    charges: [], pdcKey: null, ref: entry.ref,
  };
  const columnName = ctx.columnNames.get(card.columnId) ?? card.columnId;
  const domain = entry.domainId === null ? "sans domaine"
    : `${entry.domainId}${entry.subDomainId === null ? "" : ` / ${entry.subDomainId}`}`;
  take(ctx.report, card.ref, card.title, `carte → colonne « ${columnName} » · ${domain}`, card.codename ?? undefined);
  return card;
}

// ProjetsJalons by Id, then by name; a hit counts the stage it implies.
function joinJalons(ctx: JoinContext, entry: ProjetEntry): JalonEntry | null {
  if (ctx.jalons === null) return null;
  const hit = (entry.id === "" ? undefined : ctx.jalons.byId.get(entry.id))
    ?? ctx.jalons.byName.get(entry.normalizedName);
  if (hit === undefined) {
    ctx.stats.withoutJalons++;
    tallyInto(ctx.tallies, "carte sans ligne dans ProjetsJalons — colonne d'entrée", entry.ref.line);
    return null;
  }
  ctx.consumedJalons.add(hit);
  ctx.stats.positioned++;
  ctx.stats.stageCounts.set(hit.stage, (ctx.stats.stageCounts.get(hit.stage) ?? 0) + 1);
  return hit;
}

// SP by Id, then by name, then by PE code; the key used is counted, and a
// name/Id disagreement inside SP is left to the SP reader's own doubts.
function joinSp(ctx: JoinContext, entry: ProjetEntry): SpEntry | null {
  if (ctx.sp === null) return null;
  const byId = entry.id === "" ? undefined : ctx.sp.byId.get(entry.id);
  const byName = ctx.sp.byName.get(entry.normalizedName);
  const byCode = entry.codename === null ? undefined : ctx.sp.byCode.get(entry.codename);
  const hit = byId ?? byName ?? byCode;
  if (hit === undefined) {
    ctx.stats.withoutSp++;
    tallyInto(ctx.tallies, "carte sans correspondance SP — coûts de l'exercice inconnus", entry.ref.line);
    return null;
  }
  if (byId !== undefined) ctx.stats.spById++;
  else if (byName !== undefined) ctx.stats.spByName++;
  else ctx.stats.spByCode++;
  if (byId !== undefined && byName !== undefined && byId !== byName) {
    tallyInto(ctx.tallies, "SP : l'Id et le nom désignent deux sujets différents — Id retenu", entry.ref.line);
  }
  ctx.consumedSp.add(hit);
  return hit;
}

/** Card counts per column id, in board order (for the assembly line). */
export function cardDistribution(cards: EnrichedCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.columnId, (counts.get(card.columnId) ?? 0) + 1);
  return counts;
}
