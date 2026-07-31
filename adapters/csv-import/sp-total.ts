// Reader for SP_total (Q2/Q15): RDR validé passé -> last column; RDLI
// validé passé -> activation; else entry column (Q1). Anomalies signaled,
// aggregated (tallies.ts); pris per card unless quiet (consolidé rules).

import type { BoardConfig } from "../../core/types.ts";
import { resolveFlowAnchors } from "../../core/flow.ts";
import { createTolerantLookup, normalizeLabel } from "./normalize.ts";
import type { TolerantHit } from "./normalize.ts";
import { parseFrenchAmount, parseFrenchDate } from "./values.ts";
import { splitSubjectName } from "./subject-name.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { discard, doubt, take, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** One subject read from SP_total, ready for the étape-3 joins. */
export interface SubjectDraft {
  /** The raw « Nom » cell (code included) — shown in report messages. */
  name: string;
  title: string;
  codename: string | null;
  /** Primary join key: the full « Nom » cell, normalized. */
  normalizedName: string;
  /** Fallback join key: the title without the code, normalized. */
  normalizedTitle: string;
  typeId: string | null;
  columnId: string;
  createdAt: string | null;
  dateRdr: string | null;
  budgetRdli: number | null;
  budgetEstimated: number | null;
  budgetConsumed: number | null;
  budgetEngaged: number | null;
  ref: RowRef;
}

/** The parsed SP_total, in the shapes the next steps consume. */
export interface SpTotalTable {
  drafts: SubjectDraft[];
  byName: ReadonlyMap<string, SubjectDraft>;
  /** columnId -> card count (the report's distribution line). */
  distribution: ReadonlyMap<string, number>;
  /** Distinct « État suivant autorisé » values -> count (Q1 material). */
  nextStates: ReadonlyMap<string, number>;
}

interface SpContext {
  match: HeaderMatch;
  report: ImportReport;
  fileName: string;
  /** True when the consolidated file rules: no per-card pris lines. */
  quiet: boolean;
  typeLookup: (cell: string) => TolerantHit | null;
  entryId: string;
  activationId: string;
  exploitationId: string;
  columnNames: Map<string, string>;
  todayIso: string;
  drafts: SubjectDraft[];
  byName: Map<string, SubjectDraft>;
  byCode: Map<string, SubjectDraft>;
  unknownTypes: Map<string, Tally>;
  nextStates: Map<string, number>;
  tallies: Map<string, Tally>;
}

/**
 * Parses SP_total data rows (header excluded) into subject drafts.
 * Inputs: rows, header match, board config, report, file name, `now`
 * (its LOCAL calendar day bounds the Q15 future rule) and quiet (no
 * per-card pris lines when the consolidated file rules). Outputs: the
 * SpTotalTable; side effects: report entries (écarté, douteux, tallies).
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseSpTotal(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig,
  report: ImportReport, fileName: string, now: Date, quiet = false,
): SpTotalTable {
  const ctx = createContext(match, config, report, fileName, now);
  ctx.quiet = quiet;
  for (const row of rows) readSpRow(ctx, row);
  finalize(ctx);
  return {
    drafts: ctx.drafts,
    byName: ctx.byName,
    distribution: distribution(ctx.drafts),
    nextStates: ctx.nextStates,
  };
}

// Column anchors come from the config (never hardcoded): entry = first
// column, activation = the "actifs" anchor, exploitation = last column.
// An unresolvable activation anchor is said out loud, never guessed over.
function createContext(
  match: HeaderMatch, config: BoardConfig, report: ImportReport, fileName: string, now: Date,
): SpContext {
  const anchors = resolveFlowAnchors(config);
  const first = config.columns[0];
  const last = config.columns[config.columns.length - 1];
  const entryId = anchors?.entry.id ?? first?.id ?? "";
  if (anchors?.activation == null) {
    warn(report,
      "ancre d'activation introuvable dans la topologie — les jalons RDLI positionnent en colonne d'entrée",
      fileName);
  }
  const typeLookup = createTolerantLookup(
    config.types.flatMap((t): Array<[string, string]> => [[t.id, t.id], [t.name, t.id], [t.short, t.id]]),
  );
  const pad = (n: number): string => String(n).padStart(2, "0");
  return {
    match, report, fileName, quiet: false, typeLookup,
    entryId, activationId: anchors?.activation?.id ?? entryId,
    exploitationId: last?.id ?? entryId,
    columnNames: new Map(config.columns.map((c) => [c.id, c.name])),
    todayIso: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    drafts: [], byName: new Map(), byCode: new Map(),
    unknownTypes: new Map(), nextStates: new Map(), tallies: new Map(),
  };
}

// Structural checks, the total-row exclusion (mandatory control — double
// count hazard) and the name/duplicate gates, then the draft build.
function readSpRow(ctx: SpContext, row: CsvRow): void {
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  if (row.cells.every((c) => c.trim() === "")) {
    discard(ctx.report, ctx.fileName, "ligne vide", { ref });
    return;
  }
  if (row.cells.length > ctx.match.headerWidth) {
    tally(ctx, "cellules au-delà des colonnes déclarées", row.line);
  } else if (row.cells.length < ctx.match.headerWidth) {
    tally(ctx, "cellules manquantes par rapport aux en-têtes (ligne tronquée ?)", row.line);
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
        "en double — première occurrence conservée, la seconde écartée",
      { ref });
    return;
  }
  registerDraft(ctx, row, ref, nom, normalizedName);
}

// Builds the draft, records it under its keys, cross-checks the code.
function registerDraft(
  ctx: SpContext, row: CsvRow, ref: RowRef, nom: string, normalizedName: string,
): void {
  const draft = buildDraft(ctx, row, ref, nom, normalizedName);
  ctx.drafts.push(draft);
  ctx.byName.set(normalizedName, draft);
  if (draft.codename !== null) {
    const sameCode = ctx.byCode.get(draft.codename);
    if (sameCode !== undefined) {
      doubt(ctx.report, ctx.fileName,
        `code ${draft.codename} porté par deux noms : « ${sameCode.name} » (ligne ` +
          `${sameCode.ref.line}) et « ${nom} » (ligne ${ref.line}) — renommage ? (les deux conservés)`);
    } else {
      ctx.byCode.set(draft.codename, draft);
    }
  }
  if (!ctx.quiet) {
    const columnName = ctx.columnNames.get(draft.columnId) ?? draft.columnId;
    take(ctx.report, ref, nom, `carte → colonne « ${columnName} »`, draft.codename ?? undefined);
  }
}

// Type, dates, milestones -> position, and the four budgets.
function buildDraft(
  ctx: SpContext, row: CsvRow, ref: RowRef, nom: string, normalizedName: string,
): SubjectDraft {
  const split = splitSubjectName(nom);
  for (const anomaly of split.anomalies) tally(ctx, anomaly, row.line);
  const typeCell = cell(ctx, row, "Type").trim();
  let typeId: string | null = null;
  if (typeCell !== "") {
    const hit = ctx.typeLookup(typeCell);
    typeId = hit?.id ?? null;
    if (hit === null) tallyInto(ctx.unknownTypes, typeCell, row.line);
    else if (hit.repaired) tally(ctx, "« Type » aux accents détruits — rapproché d'un type du board", row.line);
  }
  const stateCell = cell(ctx, row, "État suivant autorisé").trim();
  if (stateCell !== "") ctx.nextStates.set(stateCell, (ctx.nextStates.get(stateCell) ?? 0) + 1);
  const rdrPassed = milestonePassed(ctx, row, "Jalon RDR validé (Réf.8)");
  const rdliPassed = milestonePassed(ctx, row, "Jalon RDLI validé");
  if (rdrPassed && !rdliPassed) {
    tally(ctx, "jalons incohérents : RDR validé sans RDLI validé — position selon la règle ordonnée", row.line);
  }
  if (cell(ctx, row, "Début").trim() === "") {
    tally(ctx, "« Début » vide — carte sans date de création", row.line);
  }
  return {
    name: nom, title: split.title, codename: split.codename,
    normalizedName, normalizedTitle: normalizeLabel(split.title),
    typeId,
    columnId: rdrPassed ? ctx.exploitationId : rdliPassed ? ctx.activationId : ctx.entryId,
    createdAt: dateOrNull(ctx, row, "Début"),
    dateRdr: dateOrNull(ctx, row, "Jalon RDR prévisionnel"),
    budgetRdli: amountOrNull(ctx, row, "* Budget validé RDLI"),
    budgetEstimated: amountOrNull(ctx, row, "Coût prév (ME)"),
    budgetConsumed: amountOrNull(ctx, row, "Coût réel"),
    budgetEngaged: amountOrNull(ctx, row, "Engagé Achats"),
    ref,
  };
}

// A milestone counts as passed only when dated on or before the run date;
// "oui"/"x" is trusted but signaled; VRAI/FAUX booleans are explicit;
// future dates, serial reads and unreadable cells are signaled (Q15 rule).
function milestonePassed(ctx: SpContext, row: CsvRow, column: string): boolean {
  const parsed = parseFrenchDate(cell(ctx, row, column));
  if (parsed.kind === "empty" || parsed.kind === "no") return false;
  if (parsed.kind === "flag") {
    tally(ctx, `« ${column} » rempli sans date (« oui »/« x ») — compté passé`, row.line);
    return true;
  }
  if (parsed.kind === "invalid") {
    tally(ctx, `« ${column} » illisible — non compté`, row.line);
    return false;
  }
  if (parsed.via === "serial") {
    tally(ctx, `« ${column} » lu comme numéro de série Excel`, row.line);
  }
  if (parsed.iso > ctx.todayIso) {
    tally(ctx, `« ${column} » daté dans le futur — non compté (Q15)`, row.line);
    return false;
  }
  return true;
}

function dateOrNull(ctx: SpContext, row: CsvRow, column: string): string | null {
  const parsed = parseFrenchDate(cell(ctx, row, column));
  if (parsed.kind === "date") {
    if (parsed.via === "serial") tally(ctx, `« ${column} » lu comme numéro de série Excel`, row.line);
    return parsed.iso;
  }
  if (parsed.kind !== "empty") tally(ctx, `« ${column} » illisible`, row.line);
  return null;
}

// Negative amounts are kept (they exist in the wild) but signaled; a unit
// typed inside the cell is stripped and signaled (the column's unit rules).
function amountOrNull(ctx: SpContext, row: CsvRow, column: string): number | null {
  const parsed = parseFrenchAmount(cell(ctx, row, column));
  if (parsed.kind === "empty") return null;
  if (parsed.kind === "invalid") {
    tally(ctx, `« ${column} » illisible`, row.line);
    return null;
  }
  if (parsed.unit !== undefined) tally(ctx, `« ${column} » : unité écrite dans la cellule`, row.line);
  if (parsed.value < 0) tally(ctx, `« ${column} » négatif`, row.line);
  return parsed.value;
}

function cell(ctx: SpContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  if (index === undefined) return "";
  return row.cells[index] ?? "";
}

function tally(ctx: SpContext, message: string, line: number): void {
  tallyInto(ctx.tallies, message, line);
}

// Aggregated signalements, unknown-type questions and the Q1 material.
function finalize(ctx: SpContext): void {
  for (const [message, t] of ctx.tallies) {
    warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  }
  for (const [label, t] of ctx.unknownTypes) {
    doubt(ctx.report, ctx.fileName,
      `type inconnu « ${label} » (${t.count} sujet(s), ligne(s) ${t.lines.join(", ")}` +
        `${t.count > t.lines.length ? ", …" : ""}) — à rapprocher d'un type du board ?`);
  }
  if (ctx.nextStates.size > 0) {
    const seen = [...ctx.nextStates.entries()]
      .map(([label, count]) => `« ${label} » (${count})`).join(" ; ");
    warn(ctx.report, `« État suivant autorisé » — valeurs vues : ${seen} (matière pour Q1)`, ctx.fileName);
  }
}

function distribution(drafts: SubjectDraft[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const draft of drafts) counts.set(draft.columnId, (counts.get(draft.columnId) ?? 0) + 1);
  return counts;
}
