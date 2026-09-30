// Reader for the SP sheet — the 2026 costs (R8): « Coût prév (ME) » ->
// meilleur estimé, « Coût réel » -> réel, « Engagé Achats » -> engagé,
// « * Budget validé RDLI » kept as the RDLI fallback (Q23). Amounts land
// in k€ (euros are converted and said). Accepts the SP_2026 onglet (with
// an « Id », the join key) and the raw SP_total export (no Id: join by
// name, then by the PE code embedded in the name). Its rows never become
// cards — they only enrich the `projets` perimeter. ADR 058: two rows with
// different Ids are two projects even under one name — the name (or the
// embedded code) they share then joins nothing, so no card borrows the
// other's k€, whatever the rows' order. ADR 062: rows of one project (the
// same Id, or the same name where one has no Id) are grouped once every
// row is read and ONE is kept — the tool's order-free row (duplicate-
// rows.ts; it used to be the first row read), or the PMO's choice; an
// ambiguous figure (« 1,035 ») keeps both readings for the card's doubt.

import { normalizeLabel } from "./normalize.ts";
import { splitSubjectName } from "./subject-name.ts";
import { moneyReading } from "./cells.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";
import { KEPT_ROW_RULE } from "./duplicate-rows.ts";
import { chooseRow } from "./row-choice.ts";
import type { DoubtBook } from "./doubt-book.ts";
import { groupRows } from "./sp-groups.ts";
import type { SpRow } from "./sp-groups.ts";

/** The four SP figures of a card. */
export type SpFigure = "budgetEstimated" | "budgetConsumed" | "budgetEngaged" | "budgetRdli";

/** A k€ cell read as « 1,035 »: the French reading is the value, the English one the alternative (ADR 056/062). */
export interface AmbiguousFigure {
  field: SpFigure;
  column: string;
  raw: string;
  french: number;
  english: number;
}

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
  /** The ambiguous cells of the row (empty when none). */
  ambiguousFigures: AmbiguousFigure[];
  ref: RowRef;
}

/** The parsed SP sheet, keyed for the joins. */
export interface SpTable {
  entries: SpEntry[];
  byId: ReadonlyMap<string, SpEntry>;
  /** Names and codes carried by one entry only: a key two Ids share joins nothing (ADR 058). */
  byName: ReadonlyMap<string, SpEntry>;
  byCode: ReadonlyMap<string, SpEntry>;
  /** The names (normalized) and codes two Ids share — refused as join keys. */
  ambiguous: ReadonlySet<string>;
  /** The entries behind each ambiguous key (ADR 062: the PMO may attach a card to one of them). */
  ambiguousEntries: ReadonlyMap<string, readonly SpEntry[]>;
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
  ambiguous: Set<string>;
  ambiguousEntries: Map<string, SpEntry[]>;
  tallies: Map<string, Tally>;
  book: DoubtBook | undefined;
}

const FIGURES: ReadonlyArray<[SpFigure, string]> = [
  ["budgetEstimated", "Coût prév (ME)"], ["budgetConsumed", "Coût réel"], ["budgetEngaged", "Engagé Achats"], ["budgetRdli", "* Budget validé RDLI"],
];

/**
 * Parses the SP data rows (header excluded; a totals preamble above the
 * header is skipped by the identification).
 * Inputs: the data rows, the header match, the report, the file name and
 * the book of the « Doutes à trancher » (ADR 062; absent = the tool's row).
 * Outputs: the SpTable; side effects: écarté (empty / nameless / total
 * rows), douteux (duplicate ids or names), aggregated signalements
 * (unreadable amounts, euros converted, negatives, code anomalies).
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseSp(rows: CsvRow[], match: HeaderMatch, report: ImportReport, fileName: string, book?: DoubtBook): SpTable {
  const ctx: SpContext = {
    match, report, fileName, book,
    entries: [], byId: new Map(), byName: new Map(), byCode: new Map(), ambiguous: new Set(), ambiguousEntries: new Map(), tallies: new Map(),
  };
  const read = rows.flatMap((row) => readRow(ctx, row));
  for (const group of groupRows(read)) takeGroup(ctx, group);
  for (const [message, t] of ctx.tallies) warn(report, `${message} : ${tallyLabel(t)}`, fileName);
  return {
    entries: ctx.entries, byId: ctx.byId, byName: ctx.byName, byCode: ctx.byCode, ambiguous: ctx.ambiguous,
    ambiguousEntries: ctx.ambiguousEntries, hasIds: match.columnIndex.has("Id"),
  };
}

function cell(ctx: SpContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

// Structural gates (empty, nameless, total rows); the rows past them wait
// for their group.
function readRow(ctx: SpContext, row: CsvRow): SpRow[] {
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  if (row.cells.every((c) => c.trim() === "")) {
    discard(ctx.report, ctx.fileName, "ligne vide", { ref });
    return [];
  }
  const nom = cell(ctx, row, "Nom");
  if (nom === "") {
    discard(ctx.report, ctx.fileName, "nom vide", { ref });
    return [];
  }
  const normalizedName = normalizeLabel(nom);
  if (/^(sous[\s-])?total\b/.test(normalizedName)) {
    discard(ctx.report, ctx.fileName, "ligne de total/sous-total — exclue (risque de double compte)", { ref, value: nom });
    return [];
  }
  const id = cell(ctx, row, "Id");
  return [{ row, line: row.line, cells: row.cells, id: id === "" ? null : id, nom, normalizedName }];
}

// One project's rows: the kept one (ADR 056/062), the others said, then
// the entry under its keys.
function takeGroup(ctx: SpContext, group: readonly SpRow[]): void {
  const first = group[0];
  if (first === undefined) return;
  const split = splitSubjectName(first.nom);
  const columns = ["Id", "Nom", ...FIGURES.map(([, column]) => column)].flatMap((c): Array<[string, number]> => {
    const index = ctx.match.columnIndex.get(c);
    return index === undefined ? [] : [[c, index]];
  });
  const code = first.id ?? split.codename;
  const kept = chooseRow({
    rows: group, source: "SP", detail: "sp", columns, code, name: first.normalizedName, title: split.title,
    joinKeys: [first.id ?? "", split.codename ?? "", first.normalizedName].filter((k) => k !== ""),
  }, ctx.book);
  for (const other of group.filter((r) => r !== kept).sort((a, b) => a.line - b.line)) {
    doubt(ctx.report, ctx.fileName,
      `« ${other.nom} » (ligne ${other.line}) en double avec « ${kept.nom} » (ligne ${kept.line}) — ligne ${kept.line} gardée (${KEPT_ROW_RULE}, sauf choix à l'import)`,
      { ref: { file: ctx.fileName, line: other.line } });
  }
  const entry = buildEntry(ctx, kept);
  ctx.entries.push(entry);
  if (entry.id !== null) ctx.byId.set(entry.id, entry);
  indexUnique(ctx, ctx.byName, entry.normalizedName, entry, `nom « ${entry.name} »`);
  if (entry.codename !== null) indexUnique(ctx, ctx.byCode, entry.codename, entry, `code « ${entry.codename} »`);
}

// A join key (name, embedded code) stays usable while ONE Id carries it;
// a second Id makes it ambiguous: removed, said once (ADR 058).
function indexUnique(ctx: SpContext, index: Map<string, SpEntry>, key: string, entry: SpEntry, label: string): void {
  if (ctx.ambiguous.has(key)) {
    ctx.ambiguousEntries.get(key)?.push(entry);
    return;
  }
  const first = index.get(key);
  if (first === undefined) {
    index.set(key, entry);
    return;
  }
  index.delete(key);
  ctx.ambiguous.add(key);
  ctx.ambiguousEntries.set(key, [first, entry]);
  doubt(ctx.report, ctx.fileName,
    `${label} porté par plusieurs Id (${first.id ?? "sans Id"}, ${entry.id ?? "sans Id"}) — pas de jointure par ce nom ni ce code, aucun coût emprunté`,
    { ref: entry.ref });
}

function buildEntry(ctx: SpContext, kept: SpRow): SpEntry {
  const split = splitSubjectName(kept.nom);
  for (const anomaly of split.anomalies) tallyInto(ctx.tallies, anomaly, kept.line);
  const entry: SpEntry = {
    id: kept.id, name: kept.nom, normalizedName: kept.normalizedName, normalizedTitle: normalizeLabel(split.title),
    codename: split.codename, budgetEstimated: null, budgetConsumed: null, budgetEngaged: null, budgetRdli: null,
    ambiguousFigures: [], ref: { file: ctx.fileName, line: kept.line },
  };
  for (const [field, column] of FIGURES) {
    const raw = cell(ctx, kept.row, column);
    const read = moneyReading(raw, column, kept.line, ctx.tallies);
    entry[field] = read.value;
    if (read.value !== null && read.english !== null) {
      entry.ambiguousFigures.push({ field, column, raw, french: read.value, english: read.english });
    }
  }
  return entry;
}
