// Reader for the COUT PREV export (« Coût », ADR 030, author 2026-09-11):
// one row per project × cost centre × year — twelve thousand rows for a
// hundred-odd projects. It is the SOURCE OF THE PERIMETER when present:
// the consolidated onglets proved wrong, this export comes straight from
// Sciforma. A project is in the exercise when it has at least one row on
// the exercise year, its type is not a purchase nor a TMA, and its state
// is neither « Annulé » nor « Reporté ». Amounts and days of this file are
// NOT read (unreliable, author's call); the chef de projet neither
// (« Projet.Responsable 1 » is not the right one — ProjetsCdP rules). The
// portfolio gives the domain (portfolio.ts). Output: a ProjetsTable, so
// the assembly (jalons, SP, PdC, CdP) runs unchanged.

import type { BoardConfig } from "../../core/types.ts";
import { normalizeLabel } from "./normalize.ts";
import { createTypeLookup, typeBaseLabel } from "./domains.ts";
import type { Lookup } from "./domains.ts";
import { createPortfolioResolver, lastSegment } from "./portfolio.ts";
import type { PortfolioHit } from "./portfolio.ts";
import { splitSubjectName } from "./subject-name.ts";
import { stripCode } from "./code-prefix.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";
import type { ProjetEntry, ProjetsTable } from "./projets.ts";

/** Counters of the COUT PREV reading, for the report. */
export interface CoutsStats {
  rows: number;
  otherYearRows: number;
  projectsSeen: number;
  retained: number;
  excluded: { achat: number; tma: number; annule: number; reporte: number; noYear: number };
  /** Retained projects whose « Projet.Actif » says false (kept, informational). */
  inactive: number;
  domainResolved: number;
  domainUnknown: number;
}

/** The perimeter read from COUT PREV: a ProjetsTable plus its counters. */
export interface CoutsTable extends ProjetsTable {
  stats: CoutsStats;
}

/** Codes present on one side only, when both COUT PREV and Projets came. */
export interface PerimeterCheck {
  coutsFile: string;
  projetsFile: string;
  couts: number;
  projets: number;
  common: number;
  onlyCouts: string[];
  onlyProjets: string[];
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
  ref: RowRef;
}

interface CoutsContext {
  report: ImportReport;
  fileName: string;
  year: string;
  match: HeaderMatch;
  typeLookup: Lookup;
  resolve: (portfolio: string) => PortfolioHit | null;
  seen: Map<string, Seen>;
  stats: CoutsStats;
  unknownTypes: Map<string, Tally>;
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
 * year, types with aliases, domains with aliases and sub-domains), the
 * report and the file name.
 * Outputs: the CoutsTable (a ProjetsTable: one entry per retained project,
 * first-seen order); side effects: signalements (rows read, other years,
 * exclusions by type and state, inactive kept), douteux (unknown types
 * kept without type, unknown portfolios kept without domain, one Id under
 * several names). Failure modes: none — nothing throws.
 */
export function parseCouts(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig, report: ImportReport, fileName: string,
): CoutsTable {
  const ctx: CoutsContext = {
    report, fileName, year: String(config.exercise.year), match,
    typeLookup: createTypeLookup(config), resolve: createPortfolioResolver(config),
    seen: new Map(),
    stats: {
      rows: 0, otherYearRows: 0, projectsSeen: 0, retained: 0,
      excluded: { achat: 0, tma: 0, annule: 0, reporte: 0, noYear: 0 }, inactive: 0, domainResolved: 0, domainUnknown: 0,
    },
    unknownTypes: new Map(), unknownPortfolios: new Map(), tallies: new Map(),
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
  };
}

// One row: counted, then folded into its project (first row's facts win,
// later names are only checked for divergence).
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
  const name = cell(ctx, row, "Projet. Nom");
  const existing = ctx.seen.get(id);
  if (existing !== undefined) {
    existing.onYear = existing.onYear || onYear;
    if (name !== "") existing.names.add(name);
    return;
  }
  ctx.seen.set(id, {
    id, name, names: new Set(name === "" ? [] : [name]),
    type: cell(ctx, row, "Projet.Type"), etat: cell(ctx, row, "Projet.Etat du processus"),
    portfolio: cell(ctx, row, "Projet.Portefeuille"), actif: cell(ctx, row, "Projet.Actif"),
    onYear, ref: { file: ctx.fileName, line: row.line },
  });
}

/** True for the export's purchase and TMA types (« Achat », « Evolution - TMA », « TMA Corrective »). */
function excludedType(type: string): "achat" | "tma" | null {
  const base = normalizeLabel(typeBaseLabel(type));
  if (base.startsWith("achat")) return "achat";
  if (/(^|[^a-z0-9])tma([^a-z0-9]|$)/.test(base)) return "tma";
  return null;
}

// The perimeter rule (author, 2026-09-11): on the exercise year, not a
// purchase nor a TMA, neither cancelled nor postponed.
function decide(ctx: CoutsContext, seen: Seen): ProjetEntry | null {
  ctx.stats.projectsSeen++;
  const s = ctx.stats;
  if (!seen.onYear) {
    s.excluded.noYear++;
    return null;
  }
  const badType = excludedType(seen.type);
  if (badType !== null) {
    s.excluded[badType]++;
    return null;
  }
  const etat = normalizeLabel(seen.etat);
  if (etat.startsWith("annule")) {
    s.excluded.annule++;
    return null;
  }
  if (etat.startsWith("reporte")) {
    s.excluded.reporte++;
    return null;
  }
  s.retained++;
  if (["faux", "false", "0", "non", "n"].includes(normalizeLabel(seen.actif))) s.inactive++;
  if (seen.names.size > 1) {
    doubt(ctx.report, ctx.fileName, `Id « ${seen.id} » porté par ${seen.names.size} noms différents — premier conservé`, { ref: seen.ref });
  }
  return buildEntry(ctx, seen);
}

function buildEntry(ctx: CoutsContext, seen: Seen): ProjetEntry {
  const typeId = ctx.typeLookup(seen.type)?.id ?? null;
  if (typeId === null) tallyInto(ctx.unknownTypes, typeBaseLabel(seen.type) || "(vide)", seen.ref.line);
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

// The reading in figures, then the questions: types kept without type,
// portfolios kept without domain.
function finalize(ctx: CoutsContext, entries: readonly ProjetEntry[]): void {
  const s = ctx.stats;
  warn(ctx.report,
    `${s.rows} ligne(s) lue(s) · ${s.projectsSeen} projet(s) distinct(s) · ${s.otherYearRows} ligne(s) hors ${ctx.year}` +
      ` · périmètre ${entries.length} : écartés Achat ${s.excluded.achat} · TMA ${s.excluded.tma} · Annulé ${s.excluded.annule}` +
      ` · Reporté ${s.excluded.reporte} · sans ligne ${ctx.year} ${s.excluded.noYear}` +
      (s.inactive > 0 ? ` · ${s.inactive} retenu(s) avec « Projet.Actif » faux (gardés, information)` : ""),
    ctx.fileName);
  for (const [message, t] of ctx.tallies) warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  for (const [label, t] of ctx.unknownTypes) {
    doubt(ctx.report, ctx.fileName,
      `type hors des types de la config : « ${label} » (${t.count} projet(s)) — gardé(s) sans type ; à déclarer dans \`types\` (nom ou alias) ?`);
  }
  for (const [label, t] of ctx.unknownPortfolios) {
    doubt(ctx.report, ctx.fileName,
      `portefeuille sans domaine : « ${label} » (${t.count} projet(s)) — à déclarer dans \`domains[].aliases\` ou en sous-domaine ?`);
  }
}

/**
 * Compares the COUT PREV perimeter with the Projets onglet, code by code.
 * Inputs: both tables. Output: the counts and the codes present on one
 * side only (sorted). Failure modes: none.
 */
export function checkPerimeters(couts: ProjetsTable, projets: ProjetsTable): PerimeterCheck {
  const key = (id: string): string => normalizeLabel(id);
  const inCouts = new Map(couts.entries.map((e) => [key(e.id), e.id]));
  const inProjets = new Map(projets.entries.filter((e) => e.id !== "").map((e) => [key(e.id), e.id]));
  const onlyCouts = [...inCouts].filter(([k]) => !inProjets.has(k)).map(([, id]) => id).sort();
  const onlyProjets = [...inProjets].filter(([k]) => !inCouts.has(k)).map(([, id]) => id).sort();
  return {
    coutsFile: couts.fileName, projetsFile: projets.fileName,
    couts: inCouts.size, projets: inProjets.size, common: inCouts.size - onlyCouts.length, onlyCouts, onlyProjets,
  };
}
