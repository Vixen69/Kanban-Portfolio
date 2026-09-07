// Reader for the PMO's PARAM sheet (R5): four tables side by side on one
// onglet. The reader locates DOMAINES (Domaine, Responsable) and
// ORGANISATION (organisation path, Domaine (Orga), Sous-domaine (Orga))
// by their headers and reads each downwards. Outputs: the domain leads
// (excluded from the chef de projet, R6), the organisation path ->
// domain / sub-domain translation (R4, raw-export shape) and the
// sub-domain vocabulary PARAM declares, checked against the config.
// Names stay on the executing machine — never stored (same rule as the
// retired RDOM table).

import type { BoardConfig } from "../../core/types.ts";
import { normalizeLabel } from "./normalize.ts";
import { createDomainLookup, createSubDomainLookups, leadWordSets } from "./domains.ts";
import type { Lookup } from "./domains.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** One responsable de domaine of the DOMAINES table. */
export interface DomainLead {
  name: string;
  domainLabel: string;
  /** Resolved board domain, or null — PARAM's DOMAINES vocabulary differs
   * from the Orga one (INFRA OPE, ING & PLM…), informational only. */
  domainId: string | null;
  ref: RowRef;
}

/** One organisation row: path -> Orga domain / sub-domain. */
export interface OrgaEntry {
  path: string | null;
  domainLabel: string;
  subDomainLabel: string;
  domainId: string | null;
  /** Resolved only when the domain is detailed in the config (ADR 022). */
  subDomainId: string | null;
  ref: RowRef;
}

/** The parsed PARAM sheet. */
export interface ParamTable {
  leads: DomainLead[];
  /** Compiled lead names for isDomainLead (domains.ts). */
  leadWords: string[][];
  orga: OrgaEntry[];
  /** Normalized organisation path -> its Orga entry (translation, R4). */
  byPath: ReadonlyMap<string, OrgaEntry>;
  counts: { leads: number; orgaRows: number; withPath: number };
}

interface Columns {
  domaine: number;
  responsable: number;
  path: number | null;
  orgaDomaine: number;
  orgaSub: number;
}

interface ParamContext {
  report: ImportReport;
  fileName: string;
  columns: Columns;
  domainLookup: Lookup;
  subLookups: Map<string, Lookup>;
  leads: DomainLead[];
  orga: OrgaEntry[];
  byPath: Map<string, OrgaEntry>;
  unknownDomains: Map<string, Tally>;
  unknownSubDomains: Map<string, Tally>;
  tallies: Map<string, Tally>;
}

/**
 * Parses the PARAM data rows (header excluded).
 * Inputs: the data rows, the header match, the raw header row (the tables
 * are located in it), the board config, the report and the file name.
 * Outputs: the ParamTable; side effects: douteux (domains / sub-domains
 * unknown to the board, a path mapped to two targets), aggregated
 * signalements (empty responsables, DOMAINES labels outside the Orga
 * vocabulary, config sub-domains PARAM does not declare).
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseParam(
  rows: CsvRow[], match: HeaderMatch, headerCells: string[], config: BoardConfig,
  report: ImportReport, fileName: string,
): ParamTable {
  const ctx: ParamContext = {
    report, fileName,
    columns: locateColumns(match, headerCells, report, fileName),
    domainLookup: createDomainLookup(config),
    subLookups: createSubDomainLookups(config),
    leads: [], orga: [], byPath: new Map(),
    unknownDomains: new Map(), unknownSubDomains: new Map(), tallies: new Map(),
  };
  for (const row of rows) {
    readLead(ctx, row);
    readOrga(ctx, row);
  }
  finalize(ctx, config);
  return {
    leads: ctx.leads,
    leadWords: leadWordSets(ctx.leads.map((lead) => lead.name)),
    orga: ctx.orga, byPath: ctx.byPath,
    counts: {
      leads: ctx.leads.length, orgaRows: ctx.orga.length,
      withPath: ctx.orga.filter((entry) => entry.path !== null).length,
    },
  };
}

// The DOMAINES « Responsable » is the first one after « Domaine »; the
// organisation path is the « Organisation » column when labeled, else the
// unlabeled column right before « Domaine (Orga) » (the PMO's layout).
function locateColumns(
  match: HeaderMatch, headerCells: string[], report: ImportReport, fileName: string,
): Columns {
  const index = (label: string): number => match.columnIndex.get(label) ?? -1;
  const domaine = index("Domaine");
  const orgaDomaine = index("Domaine (Orga)");
  const normalized = headerCells.map(normalizeLabel);
  let responsable = index("Responsable");
  if (responsable < domaine) {
    responsable = normalized.findIndex((cell, i) => i > domaine && cell === "responsable");
  }
  let path: number | null = match.columnIndex.get("Organisation") ?? null;
  if (path === null && orgaDomaine > 0 && normalized[orgaDomaine - 1] === "") {
    path = orgaDomaine - 1;
    warn(report,
      `chemin d'organisation lu dans la colonne sans en-tête n° ${path + 1} (à gauche de « Domaine (Orga) »)`,
      fileName);
  }
  if (path === null) {
    warn(report,
      "aucune colonne de chemin d'organisation — un export brut `projets` ne pourra pas être traduit",
      fileName);
  }
  return { domaine, responsable, path, orgaDomaine, orgaSub: index("Sous-domaine (Orga)") };
}

function cellAt(row: CsvRow, index: number | null): string {
  if (index === null || index < 0) return "";
  return (row.cells[index] ?? "").trim();
}

// One DOMAINES row: a domain label with its responsable.
function readLead(ctx: ParamContext, row: CsvRow): void {
  const label = cellAt(row, ctx.columns.domaine);
  if (label === "") return;
  const name = cellAt(row, ctx.columns.responsable);
  if (name === "") tallyInto(ctx.tallies, "DOMAINES : responsable vide", row.line);
  const domainId = ctx.domainLookup(label)?.id ?? null;
  if (domainId === null) {
    tallyInto(ctx.tallies, "DOMAINES : libellé hors vocabulaire Orga du board (informatif)", row.line);
  }
  ctx.leads.push({ name, domainLabel: label, domainId, ref: { file: ctx.fileName, line: row.line } });
}

// One ORGANISATION row: Orga domain + sub-domain, optional path.
function readOrga(ctx: ParamContext, row: CsvRow): void {
  const domainLabel = cellAt(row, ctx.columns.orgaDomaine);
  if (domainLabel === "") return;
  const subDomainLabel = cellAt(row, ctx.columns.orgaSub);
  const rawPath = cellAt(row, ctx.columns.path);
  const domainId = ctx.domainLookup(domainLabel)?.id ?? null;
  if (domainId === null) tallyInto(ctx.unknownDomains, domainLabel, row.line);
  const entry: OrgaEntry = {
    path: rawPath === "" ? null : rawPath,
    domainLabel, subDomainLabel, domainId,
    subDomainId: resolveSub(ctx, domainId, domainLabel, subDomainLabel, row.line),
    ref: { file: ctx.fileName, line: row.line },
  };
  ctx.orga.push(entry);
  if (entry.path === null) return;
  const key = normalizeLabel(entry.path);
  const seen = ctx.byPath.get(key);
  if (seen === undefined) ctx.byPath.set(key, entry);
  else if (seen.domainId !== entry.domainId || seen.subDomainId !== entry.subDomainId) {
    doubt(ctx.report, ctx.fileName,
      `chemin d'organisation « ${entry.path} » associé à deux cibles (lignes ${seen.ref.line} et ${row.line}) — première conservée`);
  }
}

// A sub-domain resolves only inside a detailed domain; elsewhere it is
// folded (null). Unknown labels inside a detailed domain are questions.
function resolveSub(
  ctx: ParamContext, domainId: string | null, domainLabel: string, subLabel: string, line: number,
): string | null {
  if (domainId === null || subLabel === "") return null;
  const lookup = ctx.subLookups.get(domainId);
  if (lookup === undefined) return null;
  const hit = lookup(subLabel);
  if (hit === null) tallyInto(ctx.unknownSubDomains, `${domainLabel} / ${subLabel}`, line);
  return hit?.id ?? null;
}

// Aggregated signalements, the vocabulary questions and the reverse check
// (config sub-domains PARAM never mentions).
function finalize(ctx: ParamContext, config: BoardConfig): void {
  if (ctx.leads.length === 0) warn(ctx.report, "DOMAINES : aucun responsable de domaine lu", ctx.fileName);
  for (const [message, t] of ctx.tallies) warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  for (const [label, t] of ctx.unknownDomains) {
    doubt(ctx.report, ctx.fileName,
      `ORGANISATION : « Domaine (Orga) » inconnu du board : « ${label} » (${tallyLabel(t)})`);
  }
  for (const [label, t] of ctx.unknownSubDomains) {
    doubt(ctx.report, ctx.fileName,
      `ORGANISATION : sous-domaine inconnu de la config : « ${label} » (${tallyLabel(t)}) — à déclarer ?`);
  }
  for (const domain of config.domains) {
    if (domain.subDomains === undefined) continue;
    const declared = new Set(ctx.orga.filter((e) => e.domainId === domain.id).map((e) => e.subDomainId));
    const missing = domain.subDomains.filter((sub) => !declared.has(sub.id)).map((sub) => sub.name);
    if (missing.length > 0) {
      warn(ctx.report, `sous-domaines de la config absents de PARAM pour ${domain.name} : ${missing.join(" ; ")}`, ctx.fileName);
    }
  }
}
