// The card assembly (étape 3, Q18): the consolidated sheet is the spine —
// its retained rows become the cards — and the raw exports enrich them by
// join: SP_total brings the milestone position and the budgets, `projet`
// brings the chef de projet and the RDOM domain fallback. Join keys, in
// order of trust: full name, PE code, then title; every miss and conflict
// is counted, never silent.

import type { BoardConfig } from "../../core/types.ts";
import { resolveFlowAnchors } from "../../core/flow.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { ConsolideEntry, ConsolideTable } from "./consolide.ts";
import type { ProjetEntry, ProjetsTable } from "./projets.ts";
import type { SpTotalTable, SubjectDraft } from "./sp-total.ts";
import { doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** One retained card, fully enriched — what the real import will load. */
export interface EnrichedCard {
  title: string;
  normalizedName: string;
  codename: string | null;
  domainId: string | null;
  domainSource: "consolide" | "rdom" | null;
  owner: string | null;
  typeId: string | null;
  columnId: string;
  createdAt: string | null;
  dateRdr: string | null;
  budgetRdli: number | null;
  budgetEstimated: number | null;
  budgetConsumed: number | null;
  budgetEngaged: number | null;
  /** True when SP_total milestones positioned the card. */
  positioned: boolean;
  ref: RowRef;
}

/** Join and coverage counters for the assembly read-out. */
export interface CardStats {
  total: number;
  positioned: number;
  joinByName: number;
  joinByCode: number;
  joinByTitle: number;
  withoutSp: number;
  domainFromConsolide: number;
  domainFromRdom: number;
  domainMissing: number;
  withOwner: number;
  spOutsidePerimeter: number;
}

/** The assembled deck, or null when the perimeter master is absent. */
export interface CardAssembly {
  cards: EnrichedCard[];
  stats: CardStats;
}

/**
 * Assembles the cards from the perimeter master and the enrichments.
 * Inputs: the consolidated table (null -> no assembly), the SP_total and
 * projets tables (each nullable), the board config (entry column anchor),
 * and the report.
 * Outputs: the cards + stats; side effects: aggregated signalements for
 * join misses, code mismatches and unresolved domains; a douteux when the
 * code join and the title join disagree.
 * Failure modes: none.
 */
export function assembleCards(
  consolide: ConsolideTable | null, spTotal: SpTotalTable | null,
  projets: ProjetsTable | null, config: BoardConfig, report: ImportReport,
): CardAssembly | null {
  if (consolide === null) return null;
  const ctx = createJoin(spTotal, projets, config, report);
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
  spByName: ReadonlyMap<string, SubjectDraft>;
  spByCode: Map<string, SubjectDraft>;
  spByTitle: Map<string, SubjectDraft | "ambiguous">;
  pjByName: ReadonlyMap<string, ProjetEntry>;
  pjByTitle: Map<string, ProjetEntry | "ambiguous">;
  entryColumnId: string;
  consumedSp: Set<string>;
  stats: CardStats;
  tallies: Map<string, Tally>;
}

function createJoin(
  spTotal: SpTotalTable | null, projets: ProjetsTable | null,
  config: BoardConfig, report: ImportReport,
): JoinContext {
  const spByCode = new Map<string, SubjectDraft>();
  const spByTitle = new Map<string, SubjectDraft | "ambiguous">();
  for (const draft of spTotal?.drafts ?? []) {
    if (draft.codename !== null && !spByCode.has(draft.codename)) spByCode.set(draft.codename, draft);
    spByTitle.set(draft.normalizedTitle, spByTitle.has(draft.normalizedTitle) ? "ambiguous" : draft);
  }
  const pjByTitle = new Map<string, ProjetEntry | "ambiguous">();
  for (const entry of projets?.entries ?? []) {
    pjByTitle.set(entry.normalizedTitle, pjByTitle.has(entry.normalizedTitle) ? "ambiguous" : entry);
  }
  return {
    report,
    spByName: spTotal?.byName ?? new Map(),
    spByCode, spByTitle,
    pjByName: projets?.byName ?? new Map(),
    pjByTitle,
    entryColumnId: resolveFlowAnchors(config)?.entry.id ?? config.columns[0]?.id ?? "",
    consumedSp: new Set(),
    stats: {
      total: 0, positioned: 0, joinByName: 0, joinByCode: 0, joinByTitle: 0,
      withoutSp: 0, domainFromConsolide: 0, domainFromRdom: 0, domainMissing: 0,
      withOwner: 0, spOutsidePerimeter: 0,
    },
    tallies: new Map(),
  };
}

// One consolidated row -> one card, enriched from both joins.
function buildCard(ctx: JoinContext, entry: ConsolideEntry): EnrichedCard {
  const sp = joinSp(ctx, entry);
  const pj = joinPj(ctx, entry);
  if (sp === null) {
    ctx.stats.withoutSp++;
    tallyInto(ctx.tallies, "carte sans correspondance SP_total — position par défaut (Demandes)", entry.ref.line);
  } else {
    ctx.stats.positioned++;
    ctx.consumedSp.add(sp.normalizedName);
    if (entry.codename !== null && sp.codename !== null && entry.codename !== sp.codename) {
      tallyInto(ctx.tallies, "code du consolidé ≠ code SP_total — drapeau", entry.ref.line);
    }
  }
  const domainId = entry.domainId ?? pj?.domainId ?? null;
  if (entry.domainId !== null) ctx.stats.domainFromConsolide++;
  else if (pj?.domainId != null) ctx.stats.domainFromRdom++;
  else ctx.stats.domainMissing++;
  const owner = pj?.owner ?? null;
  if (owner !== null) ctx.stats.withOwner++;
  return {
    title: entry.name,
    normalizedName: entry.normalizedName,
    codename: entry.codename ?? sp?.codename ?? null,
    domainId,
    domainSource: entry.domainId !== null ? "consolide" : pj?.domainId != null ? "rdom" : null,
    owner,
    typeId: entry.typeId ?? sp?.typeId ?? null,
    columnId: sp?.columnId ?? ctx.entryColumnId,
    createdAt: entry.createdAt ?? sp?.createdAt ?? null,
    dateRdr: sp?.dateRdr ?? null,
    budgetRdli: sp?.budgetRdli ?? null,
    budgetEstimated: sp?.budgetEstimated ?? null,
    budgetConsumed: sp?.budgetConsumed ?? null,
    budgetEngaged: sp?.budgetEngaged ?? null,
    positioned: sp !== null,
    ref: entry.ref,
  };
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

function joinPj(ctx: JoinContext, entry: ConsolideEntry): ProjetEntry | null {
  const byName = ctx.pjByName.get(entry.normalizedName);
  if (byName !== undefined) return byName;
  const titled = ctx.pjByTitle.get(entry.normalizedName);
  if (titled === "ambiguous") {
    tallyInto(ctx.tallies, "titre Projets ambigu (plusieurs lignes partagent le titre)", entry.ref.line);
    return null;
  }
  return titled ?? null;
}

/** Card counts per column id, in board order (for the assembly line). */
export function cardDistribution(cards: EnrichedCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.columnId, (counts.get(card.columnId) ?? 0) + 1);
  return counts;
}
