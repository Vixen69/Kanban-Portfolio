// The rows of one Id in the Projets onglet (split from projets.ts, 300-line
// cap): which one becomes the card — the tool's row (duplicate-rows.ts,
// ADR 056) or the one the PMO chose in the « Doutes à trancher » (ADR
// 062) — and how the others are said: a verdict each, one douteux. Pure.

import type { CsvRow } from "./csv.ts";
import { splitSubjectName } from "./subject-name.ts";
import { stripCode } from "./code-prefix.ts";
import { KEPT_ROW_RULE } from "./duplicate-rows.ts";
import { chooseRow } from "./row-choice.ts";
import type { DoubtBook } from "./doubt-book.ts";
import { projetsVerdict } from "./couts-verdicts.ts";
import { doubt } from "./report.ts";
import type { ImportReport } from "./report.ts";
import type { PerimeterVerdict } from "./projets-types.ts";

/** A row past the structural gates, waiting for the other rows of its Id. */
export interface Candidate {
  row: CsvRow;
  line: number;
  cells: string[];
  id: string;
  nom: string;
  normalizedName: string;
}

/** What the duplicate handling reads and writes of the reader. */
export interface DuplicateContext {
  columnIndex: ReadonlyMap<string, number>;
  report: ImportReport;
  fileName: string;
  verdicts: PerimeterVerdict[];
  book: DoubtBook | undefined;
}

/** The columns a duplicate-row doubt may show; Responsables are names, never logged (ADR 062). */
const CHOICE_COLUMNS = [
  "Nom", "Type", "État du processus", "Domaine (Orga)", "Ss-Daine (Orga)", "Domaine", "Début", "Fin", "Responsable 1", "Responsable 2", "Responsable 3",
];
const PERSONAL: ReadonlySet<string> = new Set(["Responsable 1", "Responsable 2", "Responsable 3"]);

function cellOf(ctx: DuplicateContext, row: CsvRow, column: string): string {
  const index = ctx.columnIndex.get(column);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

/**
 * The row of one Id that becomes the card: the PMO's choice, else the
 * tool's (order-free). A group of one row is its own answer.
 * Inputs: the reader's context, the group (at least one row).
 * Output: the kept row. Failure modes: throws on an empty group (a caller bug).
 */
export function keptCandidate(ctx: DuplicateContext, group: readonly Candidate[]): Candidate {
  const first = group[0];
  if (first === undefined) throw new Error("keptCandidate: empty group");
  const columns = CHOICE_COLUMNS.flatMap((c): Array<[string, number]> => {
    const index = ctx.columnIndex.get(c);
    return index === undefined ? [] : [[c, index]];
  });
  return chooseRow({
    rows: group, source: "l'onglet Projets", detail: "projets", columns, personal: PERSONAL,
    code: first.id, name: first.normalizedName, title: stripCode(splitSubjectName(first.nom).title, first.id),
  }, ctx.book);
}

/**
 * The rows of one Id beside the kept one: a verdict each, one douteux.
 * Inputs: the context, the group, the kept row. Output: none (mutates
 * the verdicts and the report). Failure modes: none.
 */
export function sayDuplicates(ctx: DuplicateContext, group: readonly Candidate[], kept: Candidate): void {
  const others = group.filter((c) => c !== kept).sort((a, b) => a.line - b.line);
  for (const c of others) {
    ctx.verdicts.push(projetsVerdict(c.id, c.nom, cellOf(ctx, c.row, "Type"), cellOf(ctx, c.row, "État du processus"), kept.line));
  }
  const lines = [...group].sort((a, b) => a.line - b.line).map((c) => `« ${c.nom} » (ligne ${c.line})`).join(", ");
  doubt(ctx.report, ctx.fileName,
    `Id « ${kept.id} » porté par ${group.length} lignes : ${lines} — ligne ${kept.line} gardée (${KEPT_ROW_RULE}, sauf choix à l'import)`,
    { ref: { file: ctx.fileName, line: kept.line } });
}
