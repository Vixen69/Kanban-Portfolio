// Reader for the COUT PREV export (« Coût », ADR 030, author 2026-09-11):
// one row per project × cost centre × year — twelve thousand rows for a
// hundred-odd projects. It is the SOURCE OF THE PERIMETER when present:
// the consolidated onglets proved wrong, this export comes straight from
// Sciforma. A project (unique « Projet. Id ») is in the exercise when it
// has a row on the exercise year, its state is one of the config's
// retained states (`exercise.states`), its type is one of the config's
// types, its name is not an « arbitrage » line (a contrôle de gestion
// artefact) and at least one of its four ME cells is non-zero (all empty
// or zero = cancelled in fact, never marked). The amounts serve that
// existence test only — never read into a card; the chef de projet
// neither (« Projet.Responsable 1 » is not the right one — ProjetsCdP
// rules). The portfolio gives the domain (portfolio.ts). Output: a
// ProjetsTable, so the assembly (jalons, SP, PdC, CdP) runs unchanged.

import type { BoardConfig } from "../../core/types.ts";
import { createTolerantLookup, normalizeLabel } from "./normalize.ts";
import { createTypeLookup, typeBaseLabel } from "./domains.ts";
import type { Lookup } from "./domains.ts";
import { createPortfolioResolver, lastSegment } from "./portfolio.ts";
import type { PortfolioHit } from "./portfolio.ts";
import { parseFrenchAmount } from "./values.ts";
import { splitSubjectName } from "./subject-name.ts";
import { stripCode } from "./code-prefix.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";
import type { ProjetEntry, ProjetsTable } from "./projets.ts";
import { excludedSummary } from "./couts-stats.ts";
import type { CoutsCharge, CoutsStats } from "./couts-stats.ts";

export { checkPerimeters, excludedSummary } from "./couts-stats.ts";
export type { CoutsCharge, CoutsExcluded, CoutsStats, PerimeterCheck } from "./couts-stats.ts";

/** The four ME cells whose non-zero presence keeps a project alive. */
export const ME_COLUMNS = [
  "Charge finale ME (Res) (J)", "Charge réelle ME (Res) (J)", "Coût final ME (Res ouTrans)", "Coût réel ME (Res ouTrans)",
] as const;

/** The perimeter read from COUT PREV: a ProjetsTable plus its counters and
 * the « Charge » rows of the retained projects (ADR 034). */
export interface CoutsTable extends ProjetsTable {
  stats: CoutsStats;
  charges: CoutsCharge[];
}

interface Seen {
  id: string;
  name: string;
  names: Set<string>;
  type: string;
  etat: string;
  portfolio: string;
  actif: string;
  onYear: boolean;
  hasMe: boolean;
  /** « Charge » rows of the exercise year by cost centre (normalized key). */
  charges: Map<string, { centre: string; jh: number; done: number }>;
  ref: RowRef;
}

interface CoutsContext {
  report: ImportReport;
  fileName: string;
  year: string;
  match: HeaderMatch;
  /** null = no `exercise.states` in the config: every state kept (said). */
  states: Lookup | null;
  typeLookup: Lookup;
  resolve: (portfolio: string) => PortfolioHit | null;
  seen: Map<string, Seen>;
  stats: CoutsStats;
  charges: CoutsCharge[];
  nonPe: string[];
  unknownPortfolios: Map<string, Tally>;
  tallies: Map<string, Tally>;
}

function cell(ctx: CoutsContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

/**
 * Parses the COUT PREV data rows into the exercise's perimeter.
 * Inputs: the data rows, the header match, the board config (exercise
 * year and retained states, types with aliases, domains with aliases and
 * sub-domains), the report and the file name.
 * Outputs: the CoutsTable (a ProjetsTable: one entry per retained project,
 * first-seen order); side effects: signalements (rows read, other years,
 * exclusions by reason, inactive kept, unreadable ME cells), douteux
 * (unknown portfolios kept without domain, non-PE codes retained, one Id
 * under several names). Failure modes: none — nothing throws.
 */
export function parseCouts(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig, report: ImportReport, fileName: string,
): CoutsTable {
  const states = config.exercise.states;
  const ctx: CoutsContext = {
    report, fileName, year: String(config.exercise.year), match,
    states: states === undefined ? null : createTolerantLookup(states.map((s): [string, string] => [s, s])),
    typeLookup: createTypeLookup(config), resolve: createPortfolioResolver(config),
    seen: new Map(),
    stats: {
      rows: 0, otherYearRows: 0, projectsSeen: 0, retained: 0,
      excluded: { noYear: 0, etat: new Map(), type: new Map(), arbitrage: 0, noMe: 0 },
      inactive: 0, nonPe: 0, domainResolved: 0, domainUnknown: 0,
    },
    charges: [], nonPe: [], unknownPortfolios: new Map(), tallies: new Map(),
  };
  for (const row of rows) readRow(ctx, row);
  const entries: ProjetEntry[] = [];
  for (const seen of ctx.seen.values()) {
    const entry = decide(ctx, seen);
    if (entry !== null) entries.push(entry);
  }
  finalize(ctx, entries);
  return {
    fileName, entries,
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

// One row: counted, then folded into its project (first row's facts win;
// the year, ME presence and « Charge » days accumulate; later names are
// checked for divergence).
function readRow(ctx: CoutsContext, row: CsvRow): void {
  if (row.cells.every((c) => c.trim() === "")) return;
  ctx.stats.rows++;
  const id = cell(ctx, row, "Projet. Id");
  if (id === "") {
    tallyInto(ctx.tallies, "ligne sans « Projet. Id » — ignorée", row.line);
    return;
  }
  const yearCell = cell(ctx, row, "Année");
  const onYear = normalizeLabel(yearCell) === ctx.year || Number(yearCell.replace(",", ".")) === Number(ctx.year);
  if (!onYear) ctx.stats.otherYearRows++;
  const hasMe = onYear && rowHasMe(ctx, row);
  const name = cell(ctx, row, "Projet. Nom");
  const existing = ctx.seen.get(id);
  if (existing !== undefined) {
    existing.onYear = existing.onYear || onYear;
    existing.hasMe = existing.hasMe || hasMe;
    if (name !== "") existing.names.add(name);
    if (onYear) foldCharge(ctx, row, existing);
    return;
  }
  const seen: Seen = {
    id, name, names: new Set(name === "" ? [] : [name]),
    type: cell(ctx, row, "Projet.Type"), etat: cell(ctx, row, "Projet.Etat du processus"),
    portfolio: cell(ctx, row, "Projet.Portefeuille"), actif: cell(ctx, row, "Projet.Actif"),
    onYear, hasMe, charges: new Map(), ref: { file: ctx.fileName, line: row.line },
  };
  ctx.seen.set(id, seen);
  if (onYear) foldCharge(ctx, row, seen);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// A « Charge » row (« Type de centre de coût ») adds its days to the
// project's cost centre — the macro's « appel de charges » (ADR 034): days
// = « Charge finale ME (Res) (J) », done = « Charge réelle ME (Res) (J) ».
function foldCharge(ctx: CoutsContext, row: CsvRow, seen: Seen): void {
  if (!normalizeLabel(cell(ctx, row, "Type de centre de coût")).startsWith("charge")) return;
  const centre = cell(ctx, row, "Centre de coût") || "(Sans centre de coût)";
  const jh = parseFrenchAmount(cell(ctx, row, "Charge finale ME (Res) (J)"));
  const done = parseFrenchAmount(cell(ctx, row, "Charge réelle ME (Res) (J)"));
  const key = normalizeLabel(centre);
  const bucket = seen.charges.get(key) ?? { centre, jh: 0, done: 0 };
  bucket.jh = round2(bucket.jh + (jh.kind === "value" ? jh.value : 0));
  bucket.done = round2(bucket.done + (done.kind === "value" ? done.value : 0));
  seen.charges.set(key, bucket);
}

// At least one of the four ME cells carries a non-zero figure; an
// unreadable cell counts as empty (tallied).
function rowHasMe(ctx: CoutsContext, row: CsvRow): boolean {
  let found = false;
  for (const column of ME_COLUMNS) {
    const parsed = parseFrenchAmount(cell(ctx, row, column));
    if (parsed.kind === "invalid") tallyInto(ctx.tallies, `« ${column} » illisible — comptée vide`, row.line);
    else if (parsed.kind === "value" && parsed.value !== 0) found = true;
  }
  return found;
}

function bump(map: Map<string, number>, label: string): void {
  map.set(label, (map.get(label) ?? 0) + 1);
}

// The perimeter rule (author, 2026-09-11, tightened the same afternoon):
// on the exercise year, state in the retained list, type in the config,
// not an arbitrage line, some ME figure. First failing reason is counted.
function decide(ctx: CoutsContext, seen: Seen): ProjetEntry | null {
  ctx.stats.projectsSeen++;
  const x = ctx.stats.excluded;
  if (!seen.onYear) {
    x.noYear++;
    return null;
  }
  if (ctx.states !== null && ctx.states(seen.etat) === null) {
    bump(x.etat, seen.etat || "(vide)");
    return null;
  }
  const typeId = ctx.typeLookup(seen.type)?.id ?? null;
  if (typeId === null) {
    bump(x.type, typeBaseLabel(seen.type) || "(vide)");
    return null;
  }
  if (normalizeLabel(seen.name).includes("arbitrage")) {
    x.arbitrage++;
    return null;
  }
  if (!seen.hasMe) {
    x.noMe++;
    return null;
  }
  ctx.stats.retained++;
  if (["faux", "false", "0", "non", "n"].includes(normalizeLabel(seen.actif))) ctx.stats.inactive++;
  if (!/^pe\d/i.test(seen.id)) {
    ctx.stats.nonPe++;
    ctx.nonPe.push(seen.id);
  }
  if (seen.names.size > 1) {
    doubt(ctx.report, ctx.fileName, `Id « ${seen.id} » porté par ${seen.names.size} noms différents — premier conservé`, { ref: seen.ref });
  }
  return buildEntry(ctx, seen, typeId);
}

function buildEntry(ctx: CoutsContext, seen: Seen, typeId: string): ProjetEntry {
  for (const c of seen.charges.values()) ctx.charges.push({ projectId: seen.id, centre: c.centre, jh: c.jh, done: c.done });
  const hit = ctx.resolve(seen.portfolio);
  if (hit === null) {
    ctx.stats.domainUnknown++;
    tallyInto(ctx.unknownPortfolios, lastSegment(seen.portfolio) || "(vide)", seen.ref.line);
  } else ctx.stats.domainResolved++;
  const split = splitSubjectName(seen.name);
  return {
    id: seen.id, name: seen.name, title: stripCode(split.title, seen.id),
    normalizedName: normalizeLabel(seen.name), normalizedTitle: normalizeLabel(split.title),
    codename: seen.id, typeId, createdAt: null, dateRdr: null,
    domainId: hit?.domainId ?? null, subDomainId: hit?.subDomainId ?? null, domainSource: hit === null ? null : "param",
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

const CODES_SHOWN = 20;

function codes(list: readonly string[]): string {
  const rest = list.length - CODES_SHOWN;
  return `${list.slice(0, CODES_SHOWN).join(", ")}${rest > 0 ? `, … +${rest}` : ""}`;
}

// The reading in figures, then the questions: portfolios kept without
// domain, non-PE codes retained.
function finalize(ctx: CoutsContext, entries: readonly ProjetEntry[]): void {
  const s = ctx.stats;
  if (ctx.states === null) warn(ctx.report, "aucune liste d'états dans la config (`exercise.states`) — tous les états gardés", ctx.fileName);
  warn(ctx.report,
    `${s.rows} ligne(s) lue(s) · ${s.projectsSeen} projet(s) distinct(s) · ${s.otherYearRows} ligne(s) hors ${ctx.year}` +
      ` · périmètre ${entries.length} : écartés ${excludedSummary(s.excluded, ctx.year)}` +
      (s.inactive > 0 ? ` · ${s.inactive} retenu(s) avec « Projet.Actif » faux (gardés, information)` : ""),
    ctx.fileName);
  for (const [message, t] of ctx.tallies) warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  for (const [label, t] of ctx.unknownPortfolios) {
    doubt(ctx.report, ctx.fileName,
      `portefeuille sans domaine : « ${label} » (${t.count} projet(s)) — à déclarer dans \`domains[].aliases\` ou en sous-domaine ?`);
  }
  if (ctx.nonPe.length > 0) {
    doubt(ctx.report, ctx.fileName,
      `codes retenus hors PE : ${ctx.nonPe.length} (${codes(ctx.nonPe)}) — l'auteur en attend 4 ou 5 ; davantage = une règle manque`);
  }
}
