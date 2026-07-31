// Reader for the RDOM table (domaine <-> nom de responsable de domaine),
// the author-provided CSV that étape 3 uses twice: domain resolution via
// the portfolio-responsible name, and RDOM exclusion when deriving the
// project owner (docs/IMPORT-MAPPING.md, Q4+Q5 settled 2026-07-29).
// Every rejected or ambiguous row lands in the report, never dropped.

import type { Domain } from "../../core/types.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { normalizeLabel } from "./normalize.ts";
import { discard, doubt, take, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** One accepted (domain, name) association with its source row. */
export interface RdomEntry {
  domainId: string;
  name: string;
  normalizedName: string;
  ref: RowRef;
}

/** The parsed table, in the shapes étape 3 will consume. */
export interface RdomTable {
  entries: RdomEntry[];
  /** domainId -> original-cased names, insertion order. */
  namesByDomain: ReadonlyMap<string, string[]>;
  /** normalizedName -> domainIds; length > 1 marks an ambiguity. */
  domainsByName: ReadonlyMap<string, string[]>;
}

/**
 * Builds a tolerant domain lookup accepting id, name or short code.
 * Inputs: the board's domains (runtime config order).
 * Outputs: a function mapping a raw cell to its matching domains (empty =
 * unknown, more than one = cross-domain label collision).
 * Failure modes: none.
 */
export function createDomainResolver(domains: Domain[]): (cell: string) => Domain[] {
  const byLabel = new Map<string, Domain[]>();
  const register = (label: string, domain: Domain): void => {
    const key = normalizeLabel(label);
    const existing = byLabel.get(key) ?? [];
    if (!existing.some((d) => d.id === domain.id)) existing.push(domain);
    byLabel.set(key, existing);
  };
  for (const domain of domains) {
    register(domain.id, domain);
    register(domain.name, domain);
    register(domain.short, domain);
  }
  return (cell) => byLabel.get(normalizeLabel(cell)) ?? [];
}

// How the cell matched, for the pris note — the human-facing forms win when
// several coincide once normalized ("erp" is both the id and the name).
function resolutionNote(cell: string, domain: Domain): string {
  const key = normalizeLabel(cell);
  if (key === normalizeLabel(domain.name)) return "par nom";
  if (key === normalizeLabel(domain.short)) return `par code « ${domain.short} »`;
  return "par id";
}

interface RowContext {
  resolve: (cell: string) => Domain[];
  report: ImportReport;
  fileName: string;
  domainIdx: number;
  nameIdx: number;
  headerWidth: number;
  entries: RdomEntry[];
  seenPairs: Map<string, RowRef>;
}

/**
 * Parses RDOM data rows (header excluded) into the table.
 * Inputs: the data rows, the header match (column positions), the board
 * domains, the report to feed, and the source file name.
 * Outputs: the RdomTable; side effect: pris / écarté / douteux /
 * signalements entries pushed to the report, including a coverage warning
 * for every config domain left without any RDOM name.
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseRdom(
  rows: CsvRow[],
  match: HeaderMatch,
  domains: Domain[],
  report: ImportReport,
  fileName: string,
): RdomTable {
  const ctx: RowContext = {
    resolve: createDomainResolver(domains),
    report,
    fileName,
    domainIdx: match.columnIndex.get("Domaine") ?? 0,
    nameIdx: match.columnIndex.get("Nom") ?? 1,
    headerWidth: match.headerWidth,
    entries: [],
    seenPairs: new Map(),
  };
  for (const row of rows) readRdomRow(ctx, row);
  finalizeAmbiguities(ctx.entries, report, fileName);
  checkCoverage(domains, ctx.entries, report);
  return buildTable(ctx.entries);
}

// Structural checks first (empty row, empty cells, width), then semantics.
function readRdomRow(ctx: RowContext, row: CsvRow): void {
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  if (row.cells.every((c) => c.trim() === "")) {
    discard(ctx.report, ctx.fileName, "ligne vide", { ref });
    return;
  }
  if (row.cells.length > ctx.headerWidth) {
    warn(
      ctx.report,
      `ligne ${row.line} : ${row.cells.length - ctx.headerWidth} cellule(s) au-delà des colonnes déclarées`,
      ctx.fileName,
    );
  }
  const domainCell = (row.cells[ctx.domainIdx] ?? "").trim();
  const nameCell = (row.cells[ctx.nameIdx] ?? "").trim();
  if (domainCell === "") {
    discard(ctx.report, ctx.fileName, "domaine vide", { ref, value: nameCell });
    return;
  }
  if (nameCell === "") {
    discard(ctx.report, ctx.fileName, "nom vide", { ref, value: domainCell });
    return;
  }
  registerEntry(ctx, ref, domainCell, nameCell);
}

// Domain resolution, duplicate merge, then the pris entry.
function registerEntry(ctx: RowContext, ref: RowRef, domainCell: string, nameCell: string): void {
  const matches = ctx.resolve(domainCell);
  const first = matches[0];
  if (first === undefined) {
    discard(ctx.report, ctx.fileName, `domaine inconnu « ${domainCell} »`, { ref, value: nameCell });
    return;
  }
  if (matches.length > 1) {
    const list = matches.map((m) => `« ${m.name} »`).join(", ");
    doubt(ctx.report, ctx.fileName, `« ${domainCell} » correspond à plusieurs domaines : ${list}`, {
      ref, value: nameCell,
    });
    return;
  }
  const normalizedName = normalizeLabel(nameCell);
  const pairKey = `${first.id}\n${normalizedName}`;
  const already = ctx.seenPairs.get(pairKey);
  if (already !== undefined) {
    warn(
      ctx.report,
      `ligne ${ref.line} : « ${nameCell} » déjà associé au domaine « ${first.name} » (ligne ${already.line}) — fusionné`,
      ctx.fileName,
    );
    return;
  }
  ctx.seenPairs.set(pairKey, ref);
  ctx.entries.push({ domainId: first.id, name: nameCell, normalizedName, ref });
  take(ctx.report, ref, nameCell, `domaine « ${first.name} »`, resolutionNote(domainCell, first));
}

// A name appearing under two domains is a question, never a silent pick.
function finalizeAmbiguities(entries: RdomEntry[], report: ImportReport, fileName: string): void {
  const byName = new Map<string, RdomEntry[]>();
  for (const entry of entries) {
    const list = byName.get(entry.normalizedName) ?? [];
    list.push(entry);
    byName.set(entry.normalizedName, list);
  }
  for (const list of byName.values()) {
    const domainIds = new Set(list.map((e) => e.domainId));
    if (domainIds.size < 2) continue;
    const detail = list.map((e) => `« ${e.domainId} » (ligne ${e.ref.line})`).join(", ");
    const sample = list[0];
    if (sample === undefined) continue;
    doubt(report, fileName, `« ${sample.name} » apparaît sous plusieurs domaines : ${detail} — même personne ?`);
  }
}

// A domain without any RDOM name can never be assigned at étape 3.
function checkCoverage(domains: Domain[], entries: RdomEntry[], report: ImportReport): void {
  const covered = new Set(entries.map((e) => e.domainId));
  for (const domain of domains) {
    if (!covered.has(domain.id)) {
      warn(report, `domaine sans RDOM : « ${domain.name} » — aucune affectation possible à l'étape projet`);
    }
  }
}

/**
 * The domains of every RDOM surname present in a cell, matched on whole
 * words (never substrings — MARTIN must not fire inside MARTINEZ).
 * Inputs: the RDOM table (null -> empty set) and the raw cell.
 * Outputs: the distinct domain ids found. Failure modes: none.
 */
export function surnameDomains(rdom: RdomTable | null, cell: string): Set<string> {
  const domains = new Set<string>();
  if (rdom === null) return domains;
  const words = new Set(normalizeLabel(cell).split(/[^a-z0-9']+/));
  for (const entry of rdom.entries) {
    if (words.has(entry.normalizedName)) domains.add(entry.domainId);
  }
  return domains;
}

function buildTable(entries: RdomEntry[]): RdomTable {
  const namesByDomain = new Map<string, string[]>();
  const domainsByName = new Map<string, string[]>();
  for (const entry of entries) {
    const names = namesByDomain.get(entry.domainId) ?? [];
    names.push(entry.name);
    namesByDomain.set(entry.domainId, names);
    const domains = domainsByName.get(entry.normalizedName) ?? [];
    if (!domains.includes(entry.domainId)) domains.push(entry.domainId);
    domainsByName.set(entry.normalizedName, domains);
  }
  return { entries, namesByDomain, domainsByName };
}
