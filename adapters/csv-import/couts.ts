// Reader for the COUT PREV export (« Coût », ADR 030, author 2026-09-11):
// one row per project × cost centre × year — twelve thousand rows for a
// hundred-odd projects. It is the SOURCE OF THE PERIMETER when present:
// the consolidated onglets proved wrong, this export comes straight from
// Sciforma. A project (unique « Projet. Id ») is in the exercise when it
// has a row on the exercise year, its state is one of the config's
// retained states (`exercise.states`), its type is one of the config's
// types, its name is not an « arbitrage » line (a contrôle de gestion
// artefact — the whole word, ADR 056) and at least one of its four ME
// cells is non-zero (all empty or zero = cancelled in fact, never marked;
// an unreadable cell keeps the project, as a douteux — ADR 056). The
// project's facts come from all its rows, whatever their order
// (couts-facts.ts, ADR 056). The amounts serve that existence test only —
// never read into a card; the chef de projet neither (« Projet.Responsable
// 1 » is not the right one — ProjetsCdP rules). The portfolio gives the
// domain (portfolio.ts). Output: a ProjetsTable, so the assembly (jalons,
// SP, PdC, CdP) runs unchanged.

import type { BoardConfig } from "../../core/types.ts";
import { createTolerantLookup, normalizeLabel } from "./normalize.ts";
import { createTypeLookup, typeBaseLabel } from "./domains.ts";
import type { Lookup } from "./domains.ts";
import { createPortfolioResolver, lastSegment, ruleLabel } from "./portfolio.ts";
import type { PortfolioHit } from "./portfolio.ts";
import { splitSubjectName } from "./subject-name.ts";
import { stripCode } from "./code-prefix.ts";
import { tallyInto } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { doubt } from "./report.ts";
import type { ImportReport } from "./report.ts";
import type { ProjetEntry, ProjetsTable } from "./projets.ts";
import type { PerimeterVerdict } from "./projets-types.ts";
import { coutsVerdict } from "./couts-verdicts.ts";
import type { CoutsCharge, CoutsStats } from "./couts-stats.ts";
import { emitCoutsReport } from "./couts-report.ts";
import type { PortfolioTally } from "./couts-report.ts";
import { readRow } from "./couts-rows.ts";
import type { RowContext, Seen } from "./couts-rows.ts";
import { resolveFacts } from "./couts-facts.ts";
import type { ProjectFacts } from "./couts-facts.ts";
import type { Tally } from "./tallies.ts";

export { checkPerimeters, excludedSummary } from "./couts-stats.ts";
export type { CoutsCharge, CoutsExcluded, CoutsStats, PerimeterCheck } from "./couts-stats.ts";
export { ME_COLUMNS } from "./couts-rows.ts";

/** The perimeter read from COUT PREV: a ProjetsTable plus its counters and
 * the « Charge » rows of the retained projects (ADR 034). */
export interface CoutsTable extends ProjetsTable {
  stats: CoutsStats;
  charges: CoutsCharge[];
}

interface CoutsContext extends RowContext {
  report: ImportReport;
  /** null = no `exercise.states` in the config: every state kept (said). */
  states: Lookup | null;
  typeLookup: Lookup;
  resolve: (portfolio: string) => PortfolioHit | null;
  charges: CoutsCharge[];
  nonPe: string[];
  /** Retained-shaped projects excluded for having no ME figure — named for the domain owners. */
  noMe: string[];
  /** Projects kept on an unreadable ME cell alone (ADR 056) — named, never counted as zero. */
  meUnknown: string[];
  /** Every project read, retained or excluded, with the rule (ADR 055). */
  verdicts: PerimeterVerdict[];
  unknownPortfolios: Map<string, Tally>;
  /** Every « Projet.Portefeuille » path of the retained projects, and where it landed. */
  portfolios: Map<string, PortfolioTally>;
}

/** « arbitrage » as a whole word of the name (« d'arbitrage », « Arbitrages RDLI »), never inside another word. */
const ARBITRAGE = /(?:^|[^a-z0-9])arbitrages?(?:[^a-z0-9]|$)/;

function createContext(match: HeaderMatch, config: BoardConfig, report: ImportReport, fileName: string): CoutsContext {
  const states = config.exercise.states;
  return {
    report, fileName, year: String(config.exercise.year), match,
    states: states === undefined ? null : createTolerantLookup(states.map((s): [string, string] => [s, s])),
    typeLookup: createTypeLookup(config), resolve: createPortfolioResolver(config),
    seen: new Map(),
    stats: {
      rows: 0, otherYearRows: 0, projectsSeen: 0, retained: 0,
      excluded: { noYear: 0, etat: new Map(), type: new Map(), arbitrage: 0, noMe: 0 },
      inactive: 0, nonPe: 0, domainResolved: 0, domainUnknown: 0,
    },
    charges: [], nonPe: [], noMe: [], meUnknown: [], verdicts: [], unknownPortfolios: new Map(), portfolios: new Map(),
    tallies: new Map(), years: new Map(),
  };
}

/**
 * Parses the COUT PREV data rows into the exercise's perimeter.
 * Inputs: the data rows, the header match, the board config (exercise
 * year and retained states, types with aliases, domains with aliases and
 * sub-domains — vocabulary.ts gives the versioned model's), the report and
 * the file name.
 * Outputs: the CoutsTable (a ProjetsTable: one entry per retained project,
 * first-seen order; the same projects, domains and titles whatever the
 * row order); side effects: signalements (rows read, « Année » values
 * seen, other years, exclusions by reason, inactive kept), douteux
 * (rows of one Id that disagree, unknown portfolios kept without domain,
 * non-PE codes retained, projects kept on an unreadable ME cell, projects
 * without ME). Failure modes: none — nothing throws.
 */
export function parseCouts(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig, report: ImportReport, fileName: string,
): CoutsTable {
  const ctx = createContext(match, config, report, fileName);
  for (const row of rows) readRow(ctx, row);
  const entries: ProjetEntry[] = [];
  for (const seen of ctx.seen.values()) {
    const entry = decide(ctx, seen);
    if (entry !== null) entries.push(entry);
  }
  emitCoutsReport({
    report, fileName, year: ctx.year, config, stats: ctx.stats, entries: entries.length, statesListed: ctx.states !== null,
    tallies: ctx.tallies, years: ctx.years, unknownPortfolios: ctx.unknownPortfolios, portfolios: ctx.portfolios,
    nonPe: ctx.nonPe, noMe: ctx.noMe, meUnknown: ctx.meUnknown,
  });
  return {
    fileName, entries, verdicts: ctx.verdicts,
    byId: new Map(entries.map((e) => [e.id, e])),
    byName: new Map(entries.map((e) => [e.normalizedName, e])),
    shape: "portefeuille",
    typeCounts: countTypes(entries),
    counts: {
      domainDirect: 0, domainViaParam: ctx.stats.domainResolved, domainMissing: ctx.stats.domainUnknown,
      subDetailed: entries.filter((e) => e.subDomainId !== null).length, subFolded: 0, withOwner: 0, leadsExcluded: 0,
    },
    stats: ctx.stats,
    charges: ctx.charges,
  };
}

function bump(map: Map<string, number>, label: string): void {
  map.set(label, (map.get(label) ?? 0) + 1);
}

// The perimeter rule (author, 2026-09-11, tightened the same afternoon):
// on the exercise year, state in the retained list, type in the config,
// not an arbitrage line, some ME figure — an unreadable ME cell keeps the
// project (ADR 056). The first failing rule is counted and returned; null
// = the project passes them all.
function exclusion(ctx: CoutsContext, seen: Seen, facts: ProjectFacts, typeId: string | null): Exclude<PerimeterVerdict["motive"], "retained"> | null {
  const x = ctx.stats.excluded;
  if (!seen.onYear) {
    x.noYear++;
    return "noYear";
  }
  if (ctx.states !== null && ctx.states(facts.etat) === null) {
    bump(x.etat, facts.etat || "(vide)");
    return "state";
  }
  if (typeId === null) {
    bump(x.type, typeBaseLabel(facts.type) || "(vide)");
    return "type";
  }
  if (ARBITRAGE.test(normalizeLabel(facts.name))) {
    x.arbitrage++;
    return "arbitrage";
  }
  if (!seen.hasMe && seen.meUnreadable.length === 0) {
    x.noMe++;
    ctx.noMe.push(seen.id);
    return "noMe";
  }
  if (!seen.hasMe) ctx.meUnknown.push(seen.id);
  return null;
}

// One project through the rule: its facts resolved from all its rows (a
// disagreement is a douteux, whatever the verdict), its verdict recorded
// (ADR 055), then the entry built when it is retained.
function decide(ctx: CoutsContext, seen: Seen): ProjetEntry | null {
  ctx.stats.projectsSeen++;
  const facts = resolveFacts(seen.rows);
  if (facts.disagreements.length > 0) {
    doubt(ctx.report, ctx.fileName,
      `Id « ${seen.id} » : ses lignes ne disent pas la même chose — ${facts.disagreements.join(" · ")}` +
        ` (valeur la plus fréquente ${facts.fromExercise ? `sur les lignes ${ctx.year}` : "toutes années"},` +
        " puis la date d'export la plus récente, puis l'ordre alphabétique)",
      { ref: seen.ref });
  }
  const typeHit = ctx.typeLookup(facts.type);
  const typeId = typeHit?.id ?? null;
  if (typeHit?.renamed === true) {
    tallyInto(ctx.tallies, `type « ${typeBaseLabel(facts.type)} » reconnu par un nom renommé dans ⚙ Catégories, absent du modèle versionné — à ajouter aux alias de board.json`, seen.ref.line);
  }
  const motive = exclusion(ctx, seen, facts, typeId);
  ctx.verdicts.push(coutsVerdict({ id: seen.id, name: facts.name, etat: facts.etat, type: facts.type }, motive ?? "retained", ctx.year));
  if (motive !== null || typeId === null) return null;
  ctx.stats.retained++;
  if (["faux", "false", "0", "non", "n"].includes(normalizeLabel(facts.actif))) ctx.stats.inactive++;
  if (!/^pe\d/i.test(seen.id)) {
    ctx.stats.nonPe++;
    ctx.nonPe.push(seen.id);
  }
  return buildEntry(ctx, seen, facts, typeId);
}

function buildEntry(ctx: CoutsContext, seen: Seen, facts: ProjectFacts, typeId: string): ProjetEntry {
  for (const c of seen.charges.values()) ctx.charges.push({ projectId: seen.id, centre: c.centre, jh: c.jh, done: c.done });
  const hit = ctx.resolve(facts.portfolio);
  const portfolio = ctx.portfolios.get(facts.portfolio) ?? { count: 0, hit };
  portfolio.count++;
  ctx.portfolios.set(facts.portfolio, portfolio);
  if (hit === null) {
    ctx.stats.domainUnknown++;
    tallyInto(ctx.unknownPortfolios, lastSegment(facts.portfolio) || "(vide)", seen.ref.line);
  } else ctx.stats.domainResolved++;
  const split = splitSubjectName(facts.name);
  return {
    id: seen.id, name: facts.name, title: stripCode(split.title, seen.id),
    normalizedName: normalizeLabel(facts.name), normalizedTitle: normalizeLabel(split.title),
    codename: seen.id, typeId, createdAt: null, dateRdr: null, state: facts.etat,
    domainId: hit?.domainId ?? null, subDomainId: hit?.subDomainId ?? null, domainSource: hit === null ? null : "param",
    domainRule: hit === null ? null : ruleLabel(hit),
    owner: null, budgetRdli: null, effortEstimated: null, effortConsumed: null, ref: seen.ref,
  };
}

function countTypes(entries: readonly ProjetEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.typeId ?? "?";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
