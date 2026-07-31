// The card assembly: the consolidated file IS the deck — every entry is a
// card (title, code, domain, owner, budgets, efforts come from it) — and
// SP_total, when present, only fills the gaps (position by dated
// milestones, missing budgets). Join keys, in order of trust: full name,
// PE code, then title; every miss and conflict is counted, never silent.
// The report's « pris » lines ARE the cards.

import type { BoardConfig } from "../../core/types.ts";
import { resolveFlowAnchors } from "../../core/flow.ts";
import { normalizeLabel } from "./normalize.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { ConsolideEntry, ConsolideTable } from "./consolide.ts";
import type { SpTotalTable, SubjectDraft } from "./sp-total.ts";
import type { CardCharge } from "./charges.ts";
import { doubt, take, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** One card, fully enriched — what the real import will load. */
export interface EnrichedCard {
  title: string;
  normalizedName: string;
  codename: string | null;
  /** Canal: every imported card lands in the « complicated » lane (Q3,
   * author 2026-07-31 — « Complexité » has nothing to do with it). */
  laneId: string;
  domainId: string | null;
  owner: string | null;
  typeId: string | null;
  columnId: string;
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
  /** True when SP_total milestones positioned the card. */
  positioned: boolean;
  ref: RowRef;
}

/** Join and coverage counters for the assembly read-out. */
export interface CardStats {
  total: number;
  positioned: number;
  /** Cards positioned by the « Jalon en cours » rule (Q19). */
  byJalon: number;
  joinByName: number;
  joinByCode: number;
  joinByTitle: number;
  withoutSp: number;
  withDomain: number;
  withOwner: number;
  spOutsidePerimeter: number;
}

/** The assembled deck, or null when the consolidated file is absent. */
export interface CardAssembly {
  cards: EnrichedCard[];
  stats: CardStats;
}

/**
 * Assembles the cards from the consolidated file and the optional SP_total
 * gap-filler.
 * Inputs: the consolidated table (null -> no assembly), the SP_total table
 * (nullable), the board config (entry column anchor, column names), and
 * the report.
 * Outputs: the cards + stats; side effects: one « pris » line per card,
 * aggregated signalements for join misses and code mismatches, a douteux
 * when the code join and the title join disagree.
 * Failure modes: none.
 */
export function assembleCards(
  consolide: ConsolideTable | null, spTotal: SpTotalTable | null,
  config: BoardConfig, report: ImportReport,
): CardAssembly | null {
  if (consolide === null) return null;
  const ctx = createJoin(spTotal, config, report);
  const cards = consolide.entries.map((entry) => buildCard(ctx, entry));
  ctx.stats.total = cards.length;
  ctx.stats.spOutsidePerimeter = (spTotal?.drafts.length ?? 0) - ctx.consumedSp.size;
  for (const [message, t] of ctx.tallies) {
    warn(report, `${message} : ${tallyLabel(t)}`, "assemblage");
  }
  return { cards, stats: ctx.stats };
}

interface JoinContext {
  report: ImportReport;
  hasSp: boolean;
  spByName: ReadonlyMap<string, SubjectDraft>;
  spByCode: Map<string, SubjectDraft>;
  spByTitle: Map<string, SubjectDraft | "ambiguous">;
  entryColumnId: string;
  laneId: string;
  /** « Jalon en cours » value (normalized) -> target column id (Q19). */
  jalonColumns: Map<string, string>;
  columnNames: Map<string, string>;
  consumedSp: Set<string>;
  stats: CardStats;
  tallies: Map<string, Tally>;
}

// Q19 (author, 2026-07-31): « Jalon en cours » is the NEXT milestone, so
// it tells where the project stands — RDO -> Qualification, RDLI ->
// Études, RDR -> Actifs (RDLI passed), RVSR -> Exploitation. Column ids
// come from the config anchors, never hardcoded blindly: missing targets
// degrade to the entry column.
function jalonColumnMap(config: BoardConfig, entryId: string): Map<string, string> {
  const anchors = resolveFlowAnchors(config);
  const byId = (id: string): string | undefined => config.columns.find((c) => c.id === id)?.id;
  const qualification = anchors?.qualification?.id ?? entryId;
  const etudes = byId("etudes") ?? qualification;
  const actifs = anchors?.activation?.id ?? entryId;
  const exploitation = config.columns[config.columns.length - 1]?.id ?? entryId;
  return new Map([
    ["rdo", qualification], ["rdli", etudes], ["rdr", actifs], ["rvsr", exploitation],
  ]);
}

function createJoin(
  spTotal: SpTotalTable | null, config: BoardConfig, report: ImportReport,
): JoinContext {
  const spByCode = new Map<string, SubjectDraft>();
  const spByTitle = new Map<string, SubjectDraft | "ambiguous">();
  for (const draft of spTotal?.drafts ?? []) {
    if (draft.codename !== null && !spByCode.has(draft.codename)) spByCode.set(draft.codename, draft);
    spByTitle.set(draft.normalizedTitle, spByTitle.has(draft.normalizedTitle) ? "ambiguous" : draft);
  }
  const entryColumnId = resolveFlowAnchors(config)?.entry.id ?? config.columns[0]?.id ?? "";
  return {
    report,
    hasSp: spTotal !== null,
    spByName: spTotal?.byName ?? new Map(),
    spByCode, spByTitle,
    entryColumnId,
    laneId: config.lanes.find((l) => l.natureKey === "complicated")?.id ?? config.lanes[0]?.id ?? "",
    jalonColumns: jalonColumnMap(config, entryColumnId),
    columnNames: new Map(config.columns.map((c) => [c.id, c.name])),
    consumedSp: new Set(),
    stats: {
      total: 0, positioned: 0, byJalon: 0, joinByName: 0, joinByCode: 0, joinByTitle: 0,
      withoutSp: 0, withDomain: 0, withOwner: 0, spOutsidePerimeter: 0,
    },
    tallies: new Map(),
  };
}

// One consolidated row -> one card; the consolidated sheet is the primary
// value source, SP_total fills the gaps. The pris line is the card.
function buildCard(ctx: JoinContext, entry: ConsolideEntry): EnrichedCard {
  const sp = ctx.hasSp ? joinSp(ctx, entry) : null;
  if (sp === null) {
    ctx.stats.withoutSp++;
    if (ctx.hasSp) {
      tallyInto(ctx.tallies, "carte sans correspondance SP_total — position par défaut (Demandes)", entry.ref.line);
    }
  } else {
    ctx.stats.positioned++;
    ctx.consumedSp.add(sp.normalizedName);
    if (entry.codename !== null && sp.codename !== null && entry.codename !== sp.codename) {
      tallyInto(ctx.tallies, "code du consolidé ≠ code SP_total — drapeau", entry.ref.line);
    }
  }
  if (entry.domainId !== null) ctx.stats.withDomain++;
  if (entry.owner !== null) ctx.stats.withOwner++;
  const card: EnrichedCard = {
    title: entry.name,
    normalizedName: entry.normalizedName,
    codename: entry.codename ?? sp?.codename ?? null,
    laneId: ctx.laneId,
    domainId: entry.domainId,
    owner: entry.owner,
    typeId: entry.typeId ?? sp?.typeId ?? null,
    columnId: sp?.columnId ?? jalonColumn(ctx, entry),
    createdAt: entry.createdAt ?? sp?.createdAt ?? null,
    dateRdr: entry.dateRdr ?? sp?.dateRdr ?? null,
    budgetRdli: entry.budgetRdli ?? sp?.budgetRdli ?? null,
    budgetEstimated: entry.budgetEstimated ?? sp?.budgetEstimated ?? null,
    budgetConsumed: entry.budgetConsumed ?? sp?.budgetConsumed ?? null,
    budgetEngaged: entry.budgetEngaged ?? sp?.budgetEngaged ?? null,
    effortEstimated: entry.effortEstimated, effortConsumed: entry.effortConsumed,
    charges: [], positioned: sp !== null, ref: entry.ref,
  };
  const columnName = ctx.columnNames.get(card.columnId) ?? card.columnId;
  take(ctx.report, card.ref, card.title, `carte → colonne « ${columnName} »`, card.codename ?? undefined);
  return card;
}

// The Q19 fallback: map « Jalon en cours » to its column; unknown labels
// are tallied and land in the entry column.
function jalonColumn(ctx: JoinContext, entry: ConsolideEntry): string {
  if (entry.jalonEnCours === null) return ctx.entryColumnId;
  const target = ctx.jalonColumns.get(normalizeLabel(entry.jalonEnCours));
  if (target === undefined) {
    tallyInto(ctx.tallies, `« Jalon en cours » non reconnu (« ${entry.jalonEnCours} ») — Demandes`, entry.ref.line);
    return ctx.entryColumnId;
  }
  ctx.stats.byJalon++;
  return target;
}

// Name first, then PE code, then title; a code/title disagreement is a
// question, and the code wins (it is the stronger identity).
function joinSp(ctx: JoinContext, entry: ConsolideEntry): SubjectDraft | null {
  const byName = ctx.spByName.get(entry.normalizedName);
  if (byName !== undefined) {
    ctx.stats.joinByName++;
    return byName;
  }
  const byCode = entry.codename === null ? undefined : ctx.spByCode.get(entry.codename);
  const titled = ctx.spByTitle.get(entry.normalizedName);
  const byTitle = titled === "ambiguous" ? undefined : titled;
  if (byCode !== undefined && byTitle !== undefined && byCode !== byTitle) {
    doubt(ctx.report, "assemblage",
      `« ${entry.name} » : la jointure par code (${entry.codename}) et par titre désignent deux ` +
        `sujets SP_total différents (lignes ${byCode.ref.line} et ${byTitle.ref.line}) — code retenu`,
      { ref: entry.ref });
  }
  if (byCode !== undefined) {
    ctx.stats.joinByCode++;
    return byCode;
  }
  if (titled === "ambiguous") {
    tallyInto(ctx.tallies, "titre SP_total ambigu (plusieurs sujets partagent le titre)", entry.ref.line);
    return null;
  }
  if (byTitle !== undefined) {
    ctx.stats.joinByTitle++;
    return byTitle;
  }
  return null;
}

/** Card counts per column id, in board order (for the assembly line). */
export function cardDistribution(cards: EnrichedCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.columnId, (counts.get(card.columnId) ?? 0) + 1);
  return counts;
}
