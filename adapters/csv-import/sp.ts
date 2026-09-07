// Reader for the SP sheet — the 2026 costs (R8): « Coût prév (ME) » ->
// meilleur estimé, « Coût réel » -> réel, « Engagé Achats » -> engagé,
// « * Budget validé RDLI » kept as the RDLI fallback (Q23). Amounts land
// in k€ (euros are converted and said). Accepts the SP_2026 onglet (with
// an « Id », the join key) and the raw SP_total export (no Id: join by
// name, then by the PE code embedded in the name). Its rows never become
// cards — they only enrich the `projets` perimeter.

import { normalizeLabel } from "./normalize.ts";
import { splitSubjectName } from "./subject-name.ts";
import { moneyCell } from "./cells.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** One subject's costs, ready for the join. */
export interface SpEntry {
  /** « Id » when the file has the column and the cell is filled. */
  id: string | null;
  name: string;
  normalizedName: string;
  normalizedTitle: string;
  /** PE code embedded in the name (cross-check and fallback key). */
  codename: string | null;
  /** k€ */
  budgetEstimated: number | null;
  budgetConsumed: number | null;
  budgetEngaged: number | null;
  budgetRdli: number | null;
  ref: RowRef;
}

/** The parsed SP sheet, keyed for the joins. */
export interface SpTable {
  entries: SpEntry[];
  byId: ReadonlyMap<string, SpEntry>;
  byName: ReadonlyMap<string, SpEntry>;
  byCode: ReadonlyMap<string, SpEntry>;
  /** True when the file carries an « Id » column (SP_2026 shape). */
  hasIds: boolean;
}

interface SpContext {
  match: HeaderMatch;
  report: ImportReport;
  fileName: string;
  entries: SpEntry[];
  byId: Map<string, SpEntry>;
  byName: Map<string, SpEntry>;
  byCode: Map<string, SpEntry>;
  tallies: Map<string, Tally>;
}

/**
 * Parses the SP data rows (header excluded; a totals preamble above the
 * header is skipped by the identification).
 * Inputs: the data rows, the header match, the report and the file name.
 * Outputs: the SpTable; side effects: écarté (empty / nameless / total
 * rows), douteux (duplicate ids or names), aggregated signalements
 * (unreadable amounts, euros converted, negatives, code anomalies).
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseSp(rows: CsvRow[], match: HeaderMatch, report: ImportReport, fileName: string): SpTable {
  const ctx: SpContext = {
    match, report, fileName,
    entries: [], byId: new Map(), byName: new Map(), byCode: new Map(), tallies: new Map(),
  };
  for (const row of rows) readRow(ctx, row);
  for (const [message, t] of ctx.tallies) warn(report, `${message} : ${tallyLabel(t)}`, fileName);
  return {
    entries: ctx.entries, byId: ctx.byId, byName: ctx.byName, byCode: ctx.byCode,
    hasIds: match.columnIndex.has("Id"),
  };
}

function cell(ctx: SpContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

// Structural gates (empty, nameless, total rows), duplicates, then the
// entry build under its keys.
function readRow(ctx: SpContext, row: CsvRow): void {
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  if (row.cells.every((c) => c.trim() === "")) {
    discard(ctx.report, ctx.fileName, "ligne vide", { ref });
    return;
  }
  const nom = cell(ctx, row, "Nom");
  if (nom === "") {
    discard(ctx.report, ctx.fileName, "nom vide", { ref });
    return;
  }
  const normalizedName = normalizeLabel(nom);
  if (/^(sous[\s-])?total\b/.test(normalizedName)) {
    discard(ctx.report, ctx.fileName, "ligne de total/sous-total — exclue (risque de double compte)", { ref, value: nom });
    return;
  }
  const rawId = cell(ctx, row, "Id");
  const id = rawId === "" ? null : rawId;
  const sameId = id === null ? undefined : ctx.byId.get(id);
  const sameName = ctx.byName.get(normalizedName);
  if (sameId !== undefined || sameName !== undefined) {
    const first = sameId ?? sameName;
    doubt(ctx.report, ctx.fileName,
      `« ${nom} » (ligne ${row.line}) en double avec « ${first?.name ?? ""} » (ligne ${first?.ref.line ?? 0}) — première conservée`, { ref });
    return;
  }
  const entry = buildEntry(ctx, row, ref, id, nom, normalizedName);
  ctx.entries.push(entry);
  if (id !== null) ctx.byId.set(id, entry);
  ctx.byName.set(normalizedName, entry);
  if (entry.codename !== null && !ctx.byCode.has(entry.codename)) ctx.byCode.set(entry.codename, entry);
}

function buildEntry(
  ctx: SpContext, row: CsvRow, ref: RowRef, id: string | null, nom: string, normalizedName: string,
): SpEntry {
  const split = splitSubjectName(nom);
  for (const anomaly of split.anomalies) tallyInto(ctx.tallies, anomaly, row.line);
  const money = (column: string): number | null => moneyCell(cell(ctx, row, column), column, row.line, ctx.tallies);
  return {
    id, name: nom, normalizedName, normalizedTitle: normalizeLabel(split.title),
    codename: split.codename,
    budgetEstimated: money("Coût prév (ME)"),
    budgetConsumed: money("Coût réel"),
    budgetEngaged: money("Engagé Achats"),
    budgetRdli: money("* Budget validé RDLI"),
    ref,
  };
}
