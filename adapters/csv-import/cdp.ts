// Reader for the ProjetsCdP sheet (2026-09-08): the perimeter's rows with
// their Responsable 1→3, exported separately because the August Projets
// onglet carries none. Same rule as Projets (R6, owner-rule.ts): the chef
// de projet is the first Responsable that is not a PARAM domain lead, else
// the domain lead when he is the only name. Rows are keyed by Id
// (the card's codename) with the name as fallback; owners.ts attaches them
// to the assembled cards that still lack an owner.

import { normalizeLabel } from "./normalize.ts";
import { isDomainLead } from "./domains.ts";
import { pickOwner } from "./owner-rule.ts";
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

// The chef de projet among Responsables 1→3 (R6, owner-rule.ts): the first
// that is not a PARAM domain lead, else the lead when he is the only name.
function deriveOwner(ctx: CdpContext, row: CsvRow): string | null {
  const leads = ctx.param?.leadWords;
  const pick = pickOwner(
    RESPONSABLE_COLUMNS.map((column) => cell(ctx, row, column)),
    leads === undefined ? null : (value) => isDomainLead(leads, value),
  );
  ctx.table.counts.leadsExcluded += pick.leadsSkipped;
  if (pick.leadTaken) tallyInto(ctx.tallies, "seul nom : un responsable de domaine, pris comme chef de projet", row.line);
  return pick.owner;
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
  if (owner === null) tallyInto(ctx.tallies, "ligne sans chef de projet (responsables vides)", row.line);
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
