// Reader for the ProjetsJalons sheet — the initial position (R7). The
// milestone's « (Statut) » cell decides when the file carries it (author,
// 2026-09-11): « Approuvé » = passed, anything else (« Planifié »…) = not
// passed; the date column and the « … franchi » cell only confirm — a
// disagreement is signaled and the statut wins. Without a statut (column
// absent or cell empty) the earlier rule applies: the date at or before
// the audit day, else the « franchi » cell. The last milestone passed maps
// onto the config's stage anchors: RDR -> Done, else RDLI -> Actifs, else
// RDO -> Études, else the entry column (« RDR approuvé = Done », author).
// « Prêts » and « Exploitation » are never derived. The raw « franchi »
// and statut values are surveyed; which path decided each cell is counted.

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
export type Stage = "done" | "actifs" | "etudes" | "entree";

type Milestone = "RDO" | "RDLI" | "RDR";

/** How many milestone cells each path decided — the report's self-diagnosis. */
export interface JalonsReading {
  statut: number;
  date: number;
  franchi: number;
}

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
  /** Raw « (Statut) » cell values (normalized) -> count. */
  statutValues: ReadonlyMap<string, number>;
  reading: JalonsReading;
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
  statutValues: Map<string, number>;
  reading: JalonsReading;
  tallies: Map<string, Tally>;
}

/**
 * Parses the ProjetsJalons data rows (header excluded).
 * Inputs: the data rows, the header match, the board config (stage
 * anchors), the report, the file name and `now` (the audit day the date
 * fallback compares against).
 * Outputs: the JalonsTable; side effects: écarté (empty rows, rows without
 * id nor name), douteux (duplicate ids), aggregated signalements
 * (statut/date/franchi disagreements, unreadable or future cells,
 * incoherent milestone combinations), the « franchi » and statut surveys.
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
    entries: [], byId: new Map(), byName: new Map(), franchiValues: new Map(), statutValues: new Map(),
    reading: { statut: 0, date: 0, franchi: 0 }, tallies: new Map(),
  };
  for (const row of rows) readRow(ctx, row);
  finalize(ctx);
  const stageCounts = new Map<Stage, number>();
  for (const entry of ctx.entries) stageCounts.set(entry.stage, (stageCounts.get(entry.stage) ?? 0) + 1);
  return {
    entries: ctx.entries, byId: ctx.byId, byName: ctx.byName,
    franchiValues: ctx.franchiValues, statutValues: ctx.statutValues, reading: ctx.reading, stageCounts,
  };
}

/**
 * The column id each stage maps to, from the config anchors: entry = first
 * column; études = column « etudes », else the qualification anchor; actifs
 * = the activation anchor; done = the terminal anchor (column « done »,
 * else the DoD-gated one). A missing anchor degrades to the entry column
 * and is said in the report.
 * Inputs: the board config, the report, the file name. Failure: none.
 */
export function stageColumns(config: BoardConfig, report: ImportReport, fileName: string): Record<Stage, string> {
  const anchors = resolveFlowAnchors(config);
  const entree = anchors?.entry.id ?? config.columns[0]?.id ?? "";
  const etudes = config.columns.find((c) => c.id === "etudes")?.id ?? anchors?.qualification?.id ?? entree;
  if (anchors?.activation == null) {
    warn(report, "ancre d'activation introuvable dans la topologie — RDLI franchi positionne en colonne d'entrée", fileName);
  }
  if (anchors?.terminal == null) {
    warn(report, "ancre terminale (Done) introuvable dans la topologie — RDR franchi positionne en colonne d'entrée", fileName);
  }
  return {
    entree, etudes,
    actifs: anchors?.activation?.id ?? entree,
    done: anchors?.terminal?.id ?? entree,
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
  const rdo = passed(ctx, row, "RDO");
  const rdli = passed(ctx, row, "RDLI");
  const rdr = passed(ctx, row, "RDR");
  if (rdr && !rdli) tallyInto(ctx.tallies, "RDR franchi sans RDLI franchi — règle ordonnée appliquée", row.line);
  if (rdli && !rdo) tallyInto(ctx.tallies, "RDLI franchi sans RDO franchi — règle ordonnée appliquée", row.line);
  const stage: Stage = rdr ? "done" : rdli ? "actifs" : rdo ? "etudes" : "entree";
  const entry: JalonEntry = {
    id, name, normalizedName: normalizeLabel(name), rdo, rdli, rdr, stage,
    columnId: ctx.stageColumns[stage], ref,
  };
  ctx.entries.push(entry);
  if (id !== "") ctx.byId.set(id, entry);
  if (name !== "" && !ctx.byName.has(entry.normalizedName)) ctx.byName.set(entry.normalizedName, entry);
}

function surveyFranchi(ctx: JalonsContext, raw: string): void {
  const key = raw === "" ? "(vide)" : normalizeLabel(raw);
  ctx.franchiValues.set(key, (ctx.franchiValues.get(key) ?? 0) + 1);
}

// What a « franchi » cell says, without any signalement: true / false, or
// null when empty or unreadable.
function quietFlag(raw: string): boolean | null {
  const bool = parseFrenchBoolean(raw);
  if (bool !== "invalid") return bool;
  const date = parseFrenchDate(raw);
  if (date.kind === "date" || date.kind === "flag") return true;
  return date.kind === "no" ? false : null;
}

// The statut cell decides when filled (author, 2026-09-11); otherwise the
// date, then the « franchi » cell (the earlier rule).
function passed(ctx: JalonsContext, row: CsvRow, milestone: Milestone): boolean {
  const statut = cell(ctx, row, `${milestone} (Statut)`);
  if (statut !== "") return byStatut(ctx, row, milestone, statut);
  return byDate(ctx, row, milestone);
}

// « Approuvé » = passed, any other statut = not passed (surveyed). The date
// and the « franchi » cell only confirm: a disagreement is signaled, the
// statut wins.
function byStatut(ctx: JalonsContext, row: CsvRow, milestone: Milestone, statut: string): boolean {
  const key = normalizeLabel(statut);
  ctx.statutValues.set(key, (ctx.statutValues.get(key) ?? 0) + 1);
  ctx.reading.statut++;
  const approved = key === "approuve";
  const dated = parseFrenchDate(cell(ctx, row, milestone));
  if (dated.kind === "date" && (dated.iso <= ctx.todayIso) !== approved) {
    tallyInto(ctx.tallies,
      `« ${milestone} » ${dated.iso <= ctx.todayIso ? "passé" : "à venir"} mais statut « ${statut} » — le statut fait foi`, row.line);
  }
  const flagRaw = cell(ctx, row, `${milestone} franchi`);
  surveyFranchi(ctx, flagRaw);
  const flag = quietFlag(flagRaw);
  if (flag !== null && flag !== approved) {
    tallyInto(ctx.tallies, `« ${milestone} franchi » dit ${flag ? "oui" : "non"} mais statut « ${statut} » — le statut fait foi`, row.line);
  }
  return approved;
}

// No statut: the milestone's date column decides (passed = at or before
// the audit day); the « franchi » cell is the fallback when that date is
// missing or unreadable, and a disagreement is signaled — the date wins.
function byDate(ctx: JalonsContext, row: CsvRow, milestone: Milestone): boolean {
  const dated = parseFrenchDate(cell(ctx, row, milestone));
  if (dated.kind !== "date") {
    if (dated.kind === "invalid") {
      tallyInto(ctx.tallies, `« ${milestone} » illisible — « ${milestone} franchi » fait foi`, row.line, dated.raw.slice(0, 40));
    }
    return franchi(ctx, row, `${milestone} franchi`);
  }
  ctx.reading.date++;
  const flagRaw = cell(ctx, row, `${milestone} franchi`);
  surveyFranchi(ctx, flagRaw);
  const passedByDate = dated.iso <= ctx.todayIso;
  const flag = quietFlag(flagRaw);
  if (flag !== null && flag !== passedByDate) {
    tallyInto(ctx.tallies,
      `« ${milestone} » ${passedByDate ? "passé" : "à venir"} mais « ${milestone} franchi » dit ${flag ? "oui" : "non"} — la date fait foi`,
      row.line);
  }
  return passedByDate;
}

// A « franchi » cell (last fallback): booleans (VRAI/FAUX, oui/non, o/n,
// 1/0) as they are; a date counts as passed (a future one is signaled);
// « x » counts as passed; empty = not passed; anything else is unreadable
// = not passed.
function franchi(ctx: JalonsContext, row: CsvRow, column: string): boolean {
  const raw = cell(ctx, row, column);
  surveyFranchi(ctx, raw);
  ctx.reading.franchi++;
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
  const survey = (values: Map<string, number>): string =>
    [...values.entries()].map(([label, count]) => `« ${label} » (${count})`).join(" ; ");
  const statuts = survey(ctx.statutValues);
  if (statuts !== "") warn(ctx.report, `cellules « (Statut) » — valeurs vues : ${statuts} (« approuve » = franchi)`, ctx.fileName);
  const seen = survey(ctx.franchiValues);
  if (seen !== "") warn(ctx.report, `cellules « franchi » — valeurs vues : ${seen} (relevé Q21)`, ctx.fileName);
}
