// Reader for the ProjetsCdP sheet (2026-09-08): the perimeter's rows with
// their Responsable 1→3, exported separately because the August Projets
// onglet carries none. Same rule as Projets (R6, owner-rule.ts): the chef
// de projet is the first Responsable that is not a PARAM domain lead, else
// the domain lead when he is the only name. Rows are keyed by Id
// (the card's codename) with the name as fallback; owners.ts attaches them
// to the assembled cards that still lack an owner. Rows sharing an Id (or
// a name) keep the same one whatever their order (duplicate-rows.ts, ADR
// 056): the row order of the export never decides the chef de projet.
// ADR 062: rows of one Id naming different chefs de projet are a « Doute
// à trancher » — the names are shown to the PMO, never written in the log.

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
import { KEPT_ROW_RULE, keptRow } from "./duplicate-rows.ts";
import type { DuplicateRow } from "./duplicate-rows.ts";
import { fnv1a } from "./hash.ts";
import { askOrPropose } from "./doubt-book.ts";
import type { DoubtBook } from "./doubt-book.ts";

const RESPONSABLE_COLUMNS = ["Responsable 1", "Responsable 2", "Responsable 3"];

/** The parsed ProjetsCdP sheet: owner per Id, owner per normalized name. */
export interface CdpTable {
  /** normalized Id -> chef de projet (null when every Responsable is a lead or empty). */
  byId: Map<string, string | null>;
  /** normalized name -> chef de projet, for rows whose Id is missing. */
  byName: Map<string, string | null>;
  /**
   * normalized name -> the distinct normalized Ids its rows carry (sorted;
   * empty when none): the name fallback never joins a row carrying another
   * Id than the card's (ADR 058 §2, owners.ts).
   */
  idsByName: Map<string, string[]>;
  counts: { rows: number; withOwner: number; leadsExcluded: number };
}

/** A read row and the chef de projet it names. */
interface OwnerRow extends DuplicateRow {
  owner: string | null;
  /** The row's normalized Id, "" when it has none. */
  id: string;
  /** The Id and the name as written (the doubt shows them). */
  rawId: string;
  nom: string;
}

interface CdpContext {
  match: HeaderMatch;
  param: ParamTable | null;
  report: ImportReport;
  fileName: string;
  table: CdpTable;
  tallies: Map<string, Tally>;
  /** The rows by normalized Id, then by normalized name, until every row was read. */
  rowsById: Map<string, OwnerRow[]>;
  rowsByName: Map<string, OwnerRow[]>;
  book: DoubtBook | undefined;
}

function group(groups: Map<string, OwnerRow[]>, key: string, row: OwnerRow): void {
  groups.set(key, [...(groups.get(key) ?? []), row]);
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
  const read: OwnerRow = { line: row.line, cells: row.cells, owner, id, rawId: cell(ctx, row, "Id"), nom: cell(ctx, row, "Nom") };
  if (id !== "") group(ctx.rowsById, id, read);
  if (name !== "") group(ctx.rowsByName, name, read);
}

const ownerOption = (owner: string | null): string => `o:${fnv1a(owner ?? "")}`;

// The chef de projet of one Id: the kept row's, unless its rows name
// different ones — then the PMO's choice (ADR 062). The log keeps « ligne N »,
// never the name.
function chosenOwner(ctx: CdpContext, id: string, rows: readonly OwnerRow[], kept: OwnerRow): string | null {
  const byOption = new Map<string, OwnerRow>();
  for (const row of [...rows].sort((a, b) => a.line - b.line)) if (!byOption.has(ownerOption(row.owner))) byOption.set(ownerOption(row.owner), row);
  if (byOption.size < 2) return kept.owner;
  const applied = askOrPropose(ctx.book, {
    kind: "duplicate-row", detail: "cdp", code: kept.rawId || id, name: normalizeLabel(kept.nom), title: kept.nom || kept.rawId,
    why: `${rows.length} lignes de ProjetsCdP portent l'Id « ${kept.rawId || id} » et ne nomment pas le même chef de projet. ` +
      `L'outil garde ${KEPT_ROW_RULE}.`,
    options: [...byOption].map(([option, row]) => ({
      id: option, label: `« ${row.owner ?? "aucun chef de projet"} » (ligne ${row.line})`, trace: `ligne ${row.line}`,
      consequence: row.owner === null ? "carte sans chef de projet" : null,
    })),
    proposed: ownerOption(kept.owner), joinKeys: [id, normalizeLabel(kept.nom)].filter((k) => k !== ""),
  });
  return byOption.get(applied)?.owner ?? kept.owner;
}

// Every row read: one owner per Id and per name, from the row kept. A
// name whose rows carry one single Id, when the PMO chose another chef de
// projet on that Id's doubt, takes that choice: a card joined by the name
// (a code-less card, or the namesake taken, owners.ts) gets the owner
// chosen, never the kept row's (ADR 062). The proposal changes nothing.
function settleOwners(ctx: CdpContext): void {
  const chosen = new Set<string>();
  for (const [id, rows] of ctx.rowsById) {
    const kept = keptRow(rows);
    const owner = chosenOwner(ctx, id, rows, kept);
    if (owner !== kept.owner) chosen.add(id);
    ctx.table.byId.set(id, owner);
    for (const row of [...rows].sort((a, b) => a.line - b.line)) {
      if (row !== kept) tallyInto(ctx.tallies, `Id en double — ligne gardée : ${KEPT_ROW_RULE}`, row.line, id);
    }
  }
  for (const [name, rows] of ctx.rowsByName) {
    const ids = [...new Set(rows.map((row) => row.id).filter((id) => id !== ""))].sort();
    const settled = ids.length === 1 && chosen.has(ids[0] ?? "");
    ctx.table.byName.set(name, settled ? ctx.table.byId.get(ids[0] ?? "") ?? null : keptRow(rows).owner);
    ctx.table.idsByName.set(name, ids);
  }
}

/**
 * Parses the ProjetsCdP data rows (header excluded).
 * Inputs: the data rows, the header match, the PARAM table (null tolerated:
 * no lead exclusion, said in the report), the report, the file name, the
 * book of the « Doutes à trancher » (ADR 062; absent = the kept row's owner).
 * Outputs: the CdpTable; side effects: écarté (empty rows), aggregated
 * signalements (rows without owner, duplicate ids, missing PARAM).
 * Failure modes: none.
 */
export function parseCdp(
  rows: CsvRow[], match: HeaderMatch, param: ParamTable | null, report: ImportReport, fileName: string, book?: DoubtBook,
): CdpTable {
  const ctx: CdpContext = {
    match, param, report, fileName,
    table: { byId: new Map(), byName: new Map(), idsByName: new Map(), counts: { rows: 0, withOwner: 0, leadsExcluded: 0 } },
    tallies: new Map(), rowsById: new Map(), rowsByName: new Map(), book,
  };
  if (param === null) warn(report, "table PARAM absente — les responsables de domaine ne sont pas exclus du chef de projet", fileName);
  for (const row of rows) readRow(ctx, row);
  settleOwners(ctx);
  for (const [message, t] of ctx.tallies) warn(report, `${message} : ${tallyLabel(t)}`, fileName);
  return ctx.table;
}
