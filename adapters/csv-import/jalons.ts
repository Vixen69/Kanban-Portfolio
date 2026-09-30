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
// ADR 058 (idempotence, 2026-09-30): « the audit day » is the EXPORT's day
// (reference-day.ts) — the same files give the same columns whatever the
// load day or the server's time zone; a duplicated Id takes the most
// advanced stage its rows read, whatever their order; a name carried by
// two Ids joins nothing by name.

import type { BoardConfig } from "../../core/types.ts";
import { resolveFlowAnchors } from "../../core/flow.ts";
import { normalizeLabel } from "./normalize.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import { cell, passed } from "./jalons-cells.ts";
import type { CellContext, JalonsReading } from "./jalons-cells.ts";
import { parisDay } from "./reference-day.ts";
import type { ReferenceDay } from "./reference-day.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** The stage a project reached, in the flow's own words. */
export type Stage = "done" | "actifs" | "etudes" | "entree";

export type { JalonsReading } from "./jalons-cells.ts";

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
  /** Names carried by one entry only — a name two Ids carry joins nothing (ADR 058). */
  byName: ReadonlyMap<string, JalonEntry>;
  /** Raw « franchi » cell values (normalized) -> count — the Q21 survey. */
  franchiValues: ReadonlyMap<string, number>;
  /** Raw « (Statut) » cell values (normalized) -> count. */
  statutValues: ReadonlyMap<string, number>;
  reading: JalonsReading;
  stageCounts: ReadonlyMap<Stage, number>;
}

interface JalonsContext extends CellContext {
  report: ImportReport;
  fileName: string;
  stageColumns: Record<Stage, string>;
  entries: JalonEntry[];
  byId: Map<string, JalonEntry>;
  byName: Map<string, JalonEntry>;
  /** Names seen on two different Ids: removed from byName. */
  ambiguousNames: Set<string>;
}

/**
 * Parses the ProjetsJalons data rows (header excluded).
 * Inputs: the data rows, the header match, the board config (stage
 * anchors), the report, the file name, `now` and the reference day the
 * date fallback compares against (ADR 058: the export's date; absent =
 * the day of `now` in Europe/Paris).
 * Outputs: the JalonsTable; side effects: écarté (empty rows, rows without
 * id nor name), douteux (duplicate ids — merged — and names carried by
 * two Ids), aggregated signalements
 * (statut/date/franchi disagreements, unreadable or future cells,
 * incoherent milestone combinations), the « franchi » and statut surveys.
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseJalons(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig,
  report: ImportReport, fileName: string, now: Date, reference?: ReferenceDay,
): JalonsTable {
  const ctx: JalonsContext = {
    match, report, fileName,
    stageColumns: stageColumns(config, report, fileName),
    todayIso: reference?.iso ?? parisDay(now),
    entries: [], byId: new Map(), byName: new Map(), ambiguousNames: new Set(), franchiValues: new Map(), statutValues: new Map(),
    reading: { statut: 0, date: 0, franchi: 0 }, tallies: new Map(),
  };
  for (const row of rows) readRow(ctx, row);
  finalize(ctx);
  if (ctx.reading.date > 0) {
    const source = reference?.source ?? "jour du chargement (Europe/Paris)";
    warn(report, `${ctx.reading.date} jalon(s) sans statut comparé(s) à leur date au ${ctx.todayIso} — ${source} (ADR 058)`, fileName);
  }
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
  const milestones = readMilestones(ctx, row);
  const seen = id === "" ? undefined : ctx.byId.get(id);
  if (seen !== undefined) {
    mergeDuplicate(ctx, seen, milestones, row.line);
    return;
  }
  const stage = stageOf(milestones);
  const entry: JalonEntry = {
    id, name, normalizedName: normalizeLabel(name), ...milestones, stage,
    columnId: ctx.stageColumns[stage], ref,
  };
  ctx.entries.push(entry);
  if (id !== "") ctx.byId.set(id, entry);
  if (name !== "") indexName(ctx, entry);
}

type Milestones = Pick<JalonEntry, "rdo" | "rdli" | "rdr">;

function readMilestones(ctx: JalonsContext, row: CsvRow): Milestones {
  const rdo = passed(ctx, row, "RDO");
  const rdli = passed(ctx, row, "RDLI");
  const rdr = passed(ctx, row, "RDR");
  if (rdr && !rdli) tallyInto(ctx.tallies, "RDR franchi sans RDLI franchi — règle ordonnée appliquée", row.line);
  if (rdli && !rdo) tallyInto(ctx.tallies, "RDLI franchi sans RDO franchi — règle ordonnée appliquée", row.line);
  return { rdo, rdli, rdr };
}

// The last milestone passed decides the stage (ordered rule).
function stageOf(m: Milestones): Stage {
  return m.rdr ? "done" : m.rdli ? "actifs" : m.rdo ? "etudes" : "entree";
}

const STAGE_ORDER: readonly Stage[] = ["entree", "etudes", "actifs", "done"];
const STAGE_LABEL: Record<Stage, string> = { entree: "entrée", etudes: "Études", actifs: "Actifs", done: "Terminé" };

// A duplicated Id (ADR 058): a milestone passed on ANY of its rows is
// passed — the most advanced stage wins, whatever the rows' order.
function mergeDuplicate(ctx: JalonsContext, seen: JalonEntry, row: Milestones, line: number): void {
  const read = [seen.stage, stageOf(row)].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));
  seen.rdo ||= row.rdo;
  seen.rdli ||= row.rdli;
  seen.rdr ||= row.rdr;
  seen.stage = stageOf(seen);
  seen.columnId = ctx.stageColumns[seen.stage];
  doubt(ctx.report, ctx.fileName,
    `Id « ${seen.id} » en double (lignes ${seen.ref.line} et ${line}) — étapes lues : ${[...new Set(read)].map((s) => STAGE_LABEL[s]).join(", ")} — la plus avancée retenue`,
    { ref: { file: ctx.fileName, line } });
}

// A name joins by name only while one Id carries it (ADR 058); a second Id
// under the same name makes it ambiguous — said once.
function indexName(ctx: JalonsContext, entry: JalonEntry): void {
  const key = entry.normalizedName;
  if (ctx.ambiguousNames.has(key)) return;
  const first = ctx.byName.get(key);
  if (first === undefined) {
    ctx.byName.set(key, entry);
    return;
  }
  if (first.id === entry.id) return;
  ctx.byName.delete(key);
  ctx.ambiguousNames.add(key);
  doubt(ctx.report, ctx.fileName, `nom « ${entry.name} » porté par plusieurs Id (${first.id || "sans Id"}, ${entry.id || "sans Id"}) — pas de jointure par nom pour ce nom`);
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
