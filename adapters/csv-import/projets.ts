// Reader for the raw `projet` export — the ONLY source of the chef de
// projet (the consolidated sheet has no Responsable columns, confirmed on
// the real files 2026-08-01): first of Responsables 1→2→3 that is not an
// RDOM, plus the domain FALLBACK via « Responsable portefeuilles ».
// The consolidated sheet stays the perimeter master; this file enriches
// its cards by name join only — its own rows never become cards.

import { normalizeLabel } from "./normalize.ts";
import { splitSubjectName } from "./subject-name.ts";
import { surnameDomains } from "./rdom.ts";
import { parseFrenchBoolean } from "./values.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import type { RdomTable } from "./rdom.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** One project row, reduced to what the enrichment needs. */
export interface ProjetEntry {
  name: string;
  normalizedName: string;
  /** Fallback join key: the name without an embedded PE code, normalized. */
  normalizedTitle: string;
  owner: string | null;
  /** Domain via « Responsable portefeuilles » -> RDOM surname, or null. */
  domainId: string | null;
  active: boolean | null;
  ref: RowRef;
}

/** The parsed enrichment table. */
export interface ProjetsTable {
  entries: ProjetEntry[];
  byName: ReadonlyMap<string, ProjetEntry>;
  activeCounts: { yes: number; no: number; unknown: number };
}

interface ProjetsContext {
  match: HeaderMatch;
  report: ImportReport;
  fileName: string;
  rdom: RdomTable | null;
  entries: ProjetEntry[];
  byName: Map<string, ProjetEntry>;
  activeCounts: { yes: number; no: number; unknown: number };
  tallies: Map<string, Tally>;
}

/**
 * Parses the `projet` data rows (header excluded).
 * Inputs: the data rows, the header match, the RDOM table (null = no
 * domain resolution, said in the report), the report and the file name.
 * Outputs: the ProjetsTable; side effects: écarté (empty/total rows),
 * douteux (duplicates), aggregated signalements (RDOM exclusions, cells
 * without a known RDOM, several RDOM in one cell).
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseProjets(
  rows: CsvRow[], match: HeaderMatch, rdom: RdomTable | null,
  report: ImportReport, fileName: string,
): ProjetsTable {
  if (rdom === null) {
    warn(report, "table RDOM absente — RDOM non exclus du chef de projet, domaine non résolu", fileName);
  }
  const ctx: ProjetsContext = {
    match, report, fileName, rdom,
    entries: [], byName: new Map(),
    activeCounts: { yes: 0, no: 0, unknown: 0 },
    tallies: new Map(),
  };
  for (const row of rows) readProjetRow(ctx, row);
  for (const [message, t] of ctx.tallies) {
    warn(report, `${message} : ${tallyLabel(t)}`, fileName);
  }
  return { entries: ctx.entries, byName: ctx.byName, activeCounts: ctx.activeCounts };
}

// Structural gates, then the owner/domain derivation.
function readProjetRow(ctx: ProjetsContext, row: CsvRow): void {
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  if (row.cells.every((c) => c.trim() === "")) {
    discard(ctx.report, ctx.fileName, "ligne vide", { ref });
    return;
  }
  const nom = cell(ctx, row, "Nom").trim();
  if (nom === "") {
    discard(ctx.report, ctx.fileName, "nom vide", { ref });
    return;
  }
  const normalizedName = normalizeLabel(nom);
  if (/^(sous[\s-])?total\b/.test(normalizedName)) {
    discard(ctx.report, ctx.fileName,
      "ligne de total/sous-total — exclue (risque de double compte)", { ref, value: nom });
    return;
  }
  const already = ctx.byName.get(normalizedName);
  if (already !== undefined) {
    doubt(ctx.report, ctx.fileName,
      `« ${already.name} » (ligne ${already.ref.line}) et « ${nom} » (ligne ${row.line}) ` +
        "en double — première occurrence conservée",
      { ref });
    return;
  }
  const entry: ProjetEntry = {
    name: nom, normalizedName,
    normalizedTitle: normalizeLabel(splitSubjectName(nom).title),
    owner: deriveOwner(ctx, row),
    domainId: deriveDomain(ctx, row),
    active: deriveActive(ctx, row),
    ref,
  };
  ctx.entries.push(entry);
  ctx.byName.set(normalizedName, entry);
}

// First of Responsables 1→2→3 that is not an RDOM; every exclusion is
// counted (an homonym would silently cost a chef de projet otherwise).
function deriveOwner(ctx: ProjetsContext, row: CsvRow): string | null {
  for (const column of ["Responsable 1", "Responsable 2", "Responsable 3"]) {
    const value = cell(ctx, row, column).trim();
    if (value === "") continue;
    if (rdomDomains(ctx, value).size > 0) {
      tally(ctx, `« ${column} » est un RDOM — exclu du chef de projet`, row.line);
      continue;
    }
    return value;
  }
  tally(ctx, "aucun chef de projet (responsables vides ou tous RDOM)", row.line);
  return null;
}

// « Responsable portefeuilles » -> the RDOM surnames it contains -> the
// domain, only when exactly one domain results.
function deriveDomain(ctx: ProjetsContext, row: CsvRow): string | null {
  const value = cell(ctx, row, "Responsable portefeuilles").trim();
  if (value === "") {
    tally(ctx, "« Responsable portefeuilles » vide", row.line);
    return null;
  }
  const domains = rdomDomains(ctx, value);
  if (domains.size === 1) return [...domains][0] ?? null;
  if (domains.size === 0) {
    tally(ctx, "« Responsable portefeuilles » sans RDOM reconnu", row.line);
  } else {
    tally(ctx, "« Responsable portefeuilles » avec plusieurs RDOM de domaines différents", row.line);
  }
  return null;
}

function deriveActive(ctx: ProjetsContext, row: CsvRow): boolean | null {
  const parsed = parseFrenchBoolean(cell(ctx, row, "Projet.Actif"));
  if (parsed === true) ctx.activeCounts.yes++;
  else if (parsed === false) ctx.activeCounts.no++;
  else {
    ctx.activeCounts.unknown++;
    if (parsed === "invalid") tally(ctx, "« Projet.Actif » illisible", row.line);
  }
  return parsed === "invalid" ? null : parsed;
}

function rdomDomains(ctx: ProjetsContext, value: string): Set<string> {
  return surnameDomains(ctx.rdom, value);
}

function cell(ctx: ProjetsContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  if (index === undefined) return "";
  return row.cells[index] ?? "";
}

function tally(ctx: ProjetsContext, message: string, line: number): void {
  tallyInto(ctx.tallies, message, line);
}
