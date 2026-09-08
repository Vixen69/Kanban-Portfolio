// Reader for the ProjetsCdP sheet (2026-09-08): the perimeter's rows with
// their Responsable 1→3, exported separately because the August Projets
// onglet carries none. Same rule as Projets (R6): the chef de projet is the
// first Responsable that is not a PARAM domain lead. Rows are keyed by Id
// (the card's codename) with the name as fallback; owners.ts attaches them
// to the assembled cards that still lack an owner.

import { normalizeLabel } from "./normalize.ts";
import { isDomainLead } from "./domains.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import type { ParamTable } from "./param.ts";
import { discard, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

const RESPONSABLE_COLUMNS = ["Responsable 1", "Responsable 2", "Responsable 3"];

/** The parsed ProjetsCdP sheet: owner per Id, owner per normalized name. */
export interface CdpTable {
  /** normalized Id -> chef de projet (null when every Responsable is a lead or empty). */
  byId: Map<string, string | null>;
  /** normalized name -> chef de projet, for rows whose Id is missing. */
  byName: Map<string, string | null>;
  counts: { rows: number; withOwner: number; leadsExcluded: number };
}

interface CdpContext {
  match: HeaderMatch;
  param: ParamTable | null;
  report: ImportReport;
  fileName: string;
  table: CdpTable;
  tallies: Map<string, Tally>;
}

function cell(ctx: CdpContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

// First of Responsables 1→3 that is not a PARAM domain lead (R6).
function deriveOwner(ctx: CdpContext, row: CsvRow): string | null {
  for (const column of RESPONSABLE_COLUMNS) {
    const value = cell(ctx, row, column);
    if (value === "") continue;
    if (ctx.param !== null && isDomainLead(ctx.param.leadWords, value)) {
      ctx.table.counts.leadsExcluded++;
      continue;
    }
    return value;
  }
  return null;
}

function readRow(ctx: CdpContext, row: CsvRow): void {
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  if (row.cells.every((c) => c.trim() === "")) {
    discard(ctx.report, ctx.fileName, "ligne vide", { ref });
    return;
  }
  const id = normalizeLabel(cell(ctx, row, "Id"));
  const name = normalizeLabel(cell(ctx, row, "Nom"));
  if (id === "" && name === "") {
    discard(ctx.report, ctx.fileName, "ligne sans Id ni nom", { ref });
    return;
  }
  const owner = deriveOwner(ctx, row);
  ctx.table.counts.rows++;
  if (owner === null) tallyInto(ctx.tallies, "ligne sans chef de projet (responsables vides ou tous responsables de domaine)", row.line);
  else ctx.table.counts.withOwner++;
  if (id !== "") {
    if (ctx.table.byId.has(id)) tallyInto(ctx.tallies, "Id en double — première ligne conservée", row.line, id);
    else ctx.table.byId.set(id, owner);
  }
  if (name !== "" && !ctx.table.byName.has(name)) ctx.table.byName.set(name, owner);
}

/**
 * Parses the ProjetsCdP data rows (header excluded).
 * Inputs: the data rows, the header match, the PARAM table (null tolerated:
 * no lead exclusion, said in the report), the report, the file name.
 * Outputs: the CdpTable; side effects: écarté (empty rows), aggregated
 * signalements (rows without owner, duplicate ids, missing PARAM).
 * Failure modes: none.
 */
export function parseCdp(
  rows: CsvRow[], match: HeaderMatch, param: ParamTable | null, report: ImportReport, fileName: string,
): CdpTable {
  const ctx: CdpContext = {
    match, param, report, fileName,
    table: { byId: new Map(), byName: new Map(), counts: { rows: 0, withOwner: 0, leadsExcluded: 0 } },
    tallies: new Map(),
  };
  if (param === null) warn(report, "table PARAM absente — les responsables de domaine ne sont pas exclus du chef de projet", fileName);
  for (const row of rows) readRow(ctx, row);
  for (const [message, t] of ctx.tallies) warn(report, `${message} : ${tallyLabel(t)}`, fileName);
  return ctx.table;
}
