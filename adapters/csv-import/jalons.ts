// Reader for the ProjetsJalons sheet — the initial position (R7): the
// « RDO / RDLI / RDR franchi » cells give the last milestone passed,
// mapped onto the config's stage anchors: RDR -> Exploitation, else
// RDLI -> Actifs, else RDO -> Études, else the entry column. « Prêts »
// is never derived. The raw « franchi » values are surveyed (Q21) so the
// first real pass locks their format.

import type { BoardConfig } from "../../core/types.ts";
import { resolveFlowAnchors } from "../../core/flow.ts";
import { normalizeLabel } from "./normalize.ts";
import { parseFrenchBoolean, parseFrenchDate } from "./values.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** The stage a project reached, in the flow's own words. */
export type Stage = "exploitation" | "actifs" | "etudes" | "entree";

/** One project's milestones and the stage they imply. */
export interface JalonEntry {
  id: string;
  name: string;
  normalizedName: string;
  rdo: boolean;
  rdli: boolean;
  rdr: boolean;
  stage: Stage;
  columnId: string;
  ref: RowRef;
}

/** The parsed milestone sheet. */
export interface JalonsTable {
  entries: JalonEntry[];
  byId: ReadonlyMap<string, JalonEntry>;
  byName: ReadonlyMap<string, JalonEntry>;
  /** Raw « franchi » cell values (normalized) -> count — the Q21 survey. */
  franchiValues: ReadonlyMap<string, number>;
  stageCounts: ReadonlyMap<Stage, number>;
}

interface JalonsContext {
  match: HeaderMatch;
  report: ImportReport;
  fileName: string;
  stageColumns: Record<Stage, string>;
  todayIso: string;
  entries: JalonEntry[];
  byId: Map<string, JalonEntry>;
  byName: Map<string, JalonEntry>;
  franchiValues: Map<string, number>;
  tallies: Map<string, Tally>;
}

/**
 * Parses the ProjetsJalons data rows (header excluded).
 * Inputs: the data rows, the header match, the board config (stage
 * anchors), the report, the file name and `now` (a milestone dated in the
 * future is counted passed but signaled).
 * Outputs: the JalonsTable; side effects: écarté (empty rows, rows without
 * id nor name), douteux (duplicate ids), aggregated signalements
 * (unreadable or future cells, incoherent milestone combinations), the
 * « franchi » value survey.
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseJalons(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig,
  report: ImportReport, fileName: string, now: Date,
): JalonsTable {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const ctx: JalonsContext = {
    match, report, fileName,
    stageColumns: stageColumns(config, report, fileName),
    todayIso: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    entries: [], byId: new Map(), byName: new Map(), franchiValues: new Map(), tallies: new Map(),
  };
  for (const row of rows) readRow(ctx, row);
  finalize(ctx);
  const stageCounts = new Map<Stage, number>();
  for (const entry of ctx.entries) stageCounts.set(entry.stage, (stageCounts.get(entry.stage) ?? 0) + 1);
  return { entries: ctx.entries, byId: ctx.byId, byName: ctx.byName, franchiValues: ctx.franchiValues, stageCounts };
}

/**
 * The column id each stage maps to, from the config anchors: entry = first
 * column; études = column « etudes », else the qualification anchor; actifs
 * = the activation anchor; exploitation = the last column. A missing anchor
 * degrades to the entry column and is said in the report.
 * Inputs: the board config, the report, the file name. Failure: none.
 */
export function stageColumns(config: BoardConfig, report: ImportReport, fileName: string): Record<Stage, string> {
  const anchors = resolveFlowAnchors(config);
  const entree = anchors?.entry.id ?? config.columns[0]?.id ?? "";
  const etudes = config.columns.find((c) => c.id === "etudes")?.id ?? anchors?.qualification?.id ?? entree;
  if (anchors?.activation == null) {
    warn(report, "ancre d'activation introuvable dans la topologie — RDLI franchi positionne en colonne d'entrée", fileName);
  }
  return {
    entree, etudes,
    actifs: anchors?.activation?.id ?? entree,
    exploitation: config.columns[config.columns.length - 1]?.id ?? entree,
  };
}

function cell(ctx: JalonsContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

function readRow(ctx: JalonsContext, row: CsvRow): void {
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  if (row.cells.every((c) => c.trim() === "")) {
    discard(ctx.report, ctx.fileName, "ligne vide", { ref });
    return;
  }
  const id = cell(ctx, row, "Id");
  const name = cell(ctx, row, "Nom du projet");
  if (id === "" && name === "") {
    discard(ctx.report, ctx.fileName, "ligne sans Id ni nom", { ref });
    return;
  }
  const seen = id === "" ? undefined : ctx.byId.get(id);
  if (seen !== undefined) {
    doubt(ctx.report, ctx.fileName, `Id « ${id} » en double (lignes ${seen.ref.line} et ${row.line}) — première conservée`, { ref });
    return;
  }
  const rdo = franchi(ctx, row, "RDO franchi");
  const rdli = franchi(ctx, row, "RDLI franchi");
  const rdr = franchi(ctx, row, "RDR franchi");
  if (rdr && !rdli) tallyInto(ctx.tallies, "RDR franchi sans RDLI franchi — règle ordonnée appliquée", row.line);
  if (rdli && !rdo) tallyInto(ctx.tallies, "RDLI franchi sans RDO franchi — règle ordonnée appliquée", row.line);
  const stage: Stage = rdr ? "exploitation" : rdli ? "actifs" : rdo ? "etudes" : "entree";
  const entry: JalonEntry = {
    id, name, normalizedName: normalizeLabel(name), rdo, rdli, rdr, stage,
    columnId: ctx.stageColumns[stage], ref,
  };
  ctx.entries.push(entry);
  if (id !== "") ctx.byId.set(id, entry);
  if (name !== "" && !ctx.byName.has(entry.normalizedName)) ctx.byName.set(entry.normalizedName, entry);
}

// A « franchi » cell: booleans (VRAI/FAUX, oui/non, 1/0) as they are; a
// date counts as passed (a future one is signaled); « x » counts as
// passed; empty = not passed; anything else is unreadable = not passed.
function franchi(ctx: JalonsContext, row: CsvRow, column: string): boolean {
  const raw = cell(ctx, row, column);
  const key = raw === "" ? "(vide)" : normalizeLabel(raw);
  ctx.franchiValues.set(key, (ctx.franchiValues.get(key) ?? 0) + 1);
  const bool = parseFrenchBoolean(raw);
  if (bool === null) return false;
  if (bool !== "invalid") return bool;
  const date = parseFrenchDate(raw);
  if (date.kind === "date") {
    if (date.iso > ctx.todayIso) tallyInto(ctx.tallies, `« ${column} » daté dans le futur — compté franchi`, row.line);
    return true;
  }
  if (date.kind === "flag") return true;
  if (date.kind === "no") return false;
  tallyInto(ctx.tallies, `« ${column} » illisible — compté non franchi`, row.line);
  return false;
}

function finalize(ctx: JalonsContext): void {
  for (const [message, t] of ctx.tallies) warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  const seen = [...ctx.franchiValues.entries()].map(([label, count]) => `« ${label} » (${count})`).join(" ; ");
  if (seen !== "") warn(ctx.report, `cellules « franchi » — valeurs vues : ${seen} (relevé Q21)`, ctx.fileName);
}
