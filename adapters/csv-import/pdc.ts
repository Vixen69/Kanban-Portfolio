// Reader for the plan de charge (Ressources_PdC / PdC.2026): one row per
// resource × line, years as two-level headers (« 2026 » over a Prév./Réel
// pair — reconstructed here). Only the exercise year of the config is
// read. Three natures of lines share the « Id Projet » column (author,
// 2026-09-10, ADR 029): the project assignments (one per resource ×
// project, keyed by the project CODE — names repeat), the resource's
// « Disponible ressource (en jour) » line (its capacity) and its
// « Planifiée projet (en jour) » line (the export's own total of its
// assignments). Only NOMINATIVE resources feed the persons; generic
// assignments, « zz… » codes and « PE22… » roles are counted and kept on
// the project as demand without a person (pdc-lines.ts). IMPORT-MAPPING.md.

import type { BoardConfig } from "../../core/types.ts";
import { createTolerantLookup, normalizeLabel } from "./normalize.ts";
import type { TolerantHit } from "./normalize.ts";
import { splitSubjectName } from "./subject-name.ts";
import { amountCell } from "./cells.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";
import { excludedLabel, lineKind, personFor, resourceKind, setPersonLine } from "./pdc-lines.ts";
import type { PdcExcluded, PdcPerson, ResourceKind } from "./pdc-lines.ts";

export type { PdcExcluded, PdcPerson } from "./pdc-lines.ts";

/** Aggregated exercise-year charge of one project (by profile; "" = unassigned). */
export interface PdcProject {
  /** Key in PdcTable.projects: `code:` + normalized code, else the normalized name. */
  key: string;
  name: string;
  normalizedName: string;
  normalizedTitle: string;
  /** The « Id Projet » code as exported (any shape), null when absent. */
  codename: string | null;
  /** Project-level plan by profile — nominative AND generic rows. */
  charges: Map<string, { jh: number; done: number }>;
  /** Nominative rows only (matricule -> load) — the capacity assignments. */
  persons: Map<string, { name: string; jh: number; done: number }>;
  /** Load of the non-nominative rows: demand without a named person. */
  genericJh: number;
  genericDone: number;
  ref: RowRef;
}

/** The parsed plan de charge. */
export interface PdcTable {
  projects: Map<string, PdcProject>;
  /** Nominative resources, planned load descending. */
  persons: PdcPerson[];
  /** Exercise-year totals of the project rows (nominative + generic). */
  totals: { jh: number; done: number };
  excluded: PdcExcluded;
}

interface PdcContext {
  report: ImportReport;
  fileName: string;
  year: string;
  prevIdx: number;
  reelIdx: number;
  nameIdx: number;
  idIdx: number;
  matriculeIdx: number;
  resourceIdx: number;
  profileLookup: (cell: string) => TolerantHit | null;
  projects: Map<string, PdcProject>;
  persons: Map<string, PdcPerson>;
  totals: { jh: number; done: number };
  excluded: PdcExcluded;
  unknownMetiers: Map<string, Tally>;
  prefixes: Map<string, number>;
  tallies: Map<string, Tally>;
}

/**
 * Parses the plan de charge data rows (header excluded).
 * Inputs: the data rows (the Prév./Réel sub-header row is detected and
 * consumed), the header match, the board config (profiles, exercise
 * year), the report and the file name.
 * Outputs: the PdcTable; side effects: écarté (empty names, total rows),
 * douteux (unknown métiers), aggregated signalements (excluded resources
 * with their load, totals that disagree with the « Planifiée » line,
 * persons without a capacity line, réel > prévisionnel, unreadable cells).
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parsePdc(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig,
  report: ImportReport, fileName: string,
): PdcTable {
  const year = String(config.exercise.year);
  const prevIdx = match.columnIndex.get(year) ?? -1;
  const idx = (column: string): number => match.columnIndex.get(column) ?? -1;
  const ctx: PdcContext = {
    report, fileName, year, prevIdx, reelIdx: prevIdx + 1,
    nameIdx: idx("Nom Projet"), idIdx: idx("Id Projet"), matriculeIdx: idx("Matricule"), resourceIdx: idx("Ressource"),
    profileLookup: createTolerantLookup(
      config.profiles.flatMap((p): Array<[string, string]> => [[p.id, p.id], [p.name, p.id]]),
    ),
    projects: new Map(), persons: new Map(),
    totals: { jh: 0, done: 0 }, excluded: { generic: 0, zz: 0, roles: 0, jh: 0, done: 0 },
    unknownMetiers: new Map(), prefixes: new Map(), tallies: new Map(),
  };
  const dataRows = consumeSubHeader(ctx, rows);
  for (const row of dataRows) readPdcRow(ctx, match, row);
  finalize(ctx);
  return {
    projects: ctx.projects,
    persons: [...ctx.persons.values()]
      .sort((a, b) => (b.plannedJh ?? b.jh) - (a.plannedJh ?? a.jh) || a.name.localeCompare(b.name, "fr")),
    totals: ctx.totals,
    excluded: ctx.excluded,
  };
}

// The first non-empty row should be the Prév./Réel sub-header; when it is
// not, pairing stays positional and the deviation is said.
function consumeSubHeader(ctx: PdcContext, rows: CsvRow[]): CsvRow[] {
  const first = rows.find((row) => row.cells.some((c) => c.trim() !== ""));
  if (first === undefined) return rows;
  const prev = normalizeLabel(first.cells[ctx.prevIdx] ?? "");
  const reel = normalizeLabel(first.cells[ctx.reelIdx] ?? "");
  if (prev.startsWith("prev") && reel.startsWith("reel")) return rows.filter((row) => row !== first);
  warn(ctx.report,
    `sous-en-têtes Prév./Réel non trouvés sous « ${ctx.year} » — appariement par position (Prév. = colonne de l'année, Réel = suivante)`,
    ctx.fileName);
  return rows;
}

function cellAt(row: CsvRow, index: number): string {
  return index < 0 ? "" : (row.cells[index] ?? "").trim();
}

// One row: gates (empty, nameless, total), the exercise-year pair, then
// routed by the natures of its line and of its resource.
function readPdcRow(ctx: PdcContext, match: HeaderMatch, row: CsvRow): void {
  if (row.cells.every((c) => c.trim() === "")) return;
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  const idCell = cellAt(row, ctx.idIdx);
  const nameCell = cellAt(row, ctx.nameIdx);
  const line = lineKind(idCell);
  if (line === "project" && nameCell === "" && idCell === "") {
    discard(ctx.report, ctx.fileName, "nom de projet vide", { ref });
    return;
  }
  if (/^(sous[\s-])?total\b/.test(normalizeLabel(nameCell))) {
    discard(ctx.report, ctx.fileName, "ligne de total/sous-total — exclue (risque de double compte)", { ref, value: nameCell });
    return;
  }
  const jh = amountCell(row.cells[ctx.prevIdx] ?? "", `${ctx.year} Prév.`, row.line, ctx.tallies) ?? 0;
  const done = amountCell(row.cells[ctx.reelIdx] ?? "", `${ctx.year} Réel`, row.line, ctx.tallies) ?? 0;
  const matricule = cellAt(row, ctx.matriculeIdx);
  const resource = cellAt(row, ctx.resourceIdx) || matricule;
  const kind = resourceKind(resource, matricule);
  if (line !== "project") {
    if (kind === "nominative") setPersonLine(ctx.persons, matricule, resource, line, jh, done);
    return;
  }
  if (done > jh) tallyInto(ctx.tallies, `réel ${ctx.year} > prévisionnel ${ctx.year} (cas réel, conservé)`, row.line);
  const project = projectFor(ctx, ref, idCell, nameCell || idCell);
  addCharge(project, resolveMetier(ctx, match, row), jh, done);
  ctx.totals.jh = round2(ctx.totals.jh + jh);
  ctx.totals.done = round2(ctx.totals.done + done);
  if (kind === "nominative") addNominative(ctx, project, matricule, resource, jh, done);
  else addExcluded(ctx, project, kind, jh, done, row.line);
}

// Métier -> profile: direct tolerant match, else with successive dotted
// prefixes stripped until a profile matches (« Externe. », company names,
// « NEXTER.ZZ_A NE PAS UTILISER. » seen in August) — prefixes surveyed.
function resolveMetier(ctx: PdcContext, match: HeaderMatch, row: CsvRow): string | null {
  const raw = cellAt(row, match.columnIndex.get("Métier") ?? -1);
  if (raw === "") {
    tallyInto(ctx.tallies, "« Métier » vide — charge comptée « non attribué »", row.line);
    return null;
  }
  const direct = ctx.profileLookup(raw);
  if (direct !== null) return direct.id;
  for (let dot = raw.indexOf("."); dot > 0; dot = raw.indexOf(".", dot + 1)) {
    const hit = ctx.profileLookup(raw.slice(dot + 1).trim());
    if (hit !== null) {
      const prefix = raw.slice(0, dot).trim();
      ctx.prefixes.set(prefix, (ctx.prefixes.get(prefix) ?? 0) + 1);
      return hit.id;
    }
  }
  tallyInto(ctx.unknownMetiers, raw, row.line);
  return null;
}

// Day counts, two decimals: repeated float additions otherwise produce
// « 36.099999999994 » — noise that would reach the board and its editors.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// The project of a row, keyed by its code — names repeat across projects
// (author, 2026-09-10); a row without code falls back on the name.
function projectFor(ctx: PdcContext, ref: RowRef, idCell: string, nameCell: string): PdcProject {
  const key = idCell !== "" ? `code:${normalizeLabel(idCell)}` : normalizeLabel(nameCell);
  let project = ctx.projects.get(key);
  if (project === undefined) {
    project = {
      key, name: nameCell, normalizedName: normalizeLabel(nameCell),
      normalizedTitle: normalizeLabel(splitSubjectName(nameCell).title),
      codename: idCell === "" ? null : idCell,
      charges: new Map(), persons: new Map(), genericJh: 0, genericDone: 0, ref,
    };
    ctx.projects.set(key, project);
  }
  return project;
}

function addCharge(project: PdcProject, profileId: string | null, jh: number, done: number): void {
  const key = profileId ?? "";
  const bucket = project.charges.get(key) ?? { jh: 0, done: 0 };
  bucket.jh = round2(bucket.jh + jh);
  bucket.done = round2(bucket.done + done);
  project.charges.set(key, bucket);
}

// A nominative assignment: the project's person and the person's own sum.
function addNominative(ctx: PdcContext, project: PdcProject, matricule: string, name: string, jh: number, done: number): void {
  const load = project.persons.get(matricule) ?? { name, jh: 0, done: 0 };
  load.jh = round2(load.jh + jh);
  load.done = round2(load.done + done);
  project.persons.set(matricule, load);
  const person = personFor(ctx.persons, matricule, name);
  person.jh = round2(person.jh + jh);
  person.done = round2(person.done + done);
}

// A non-nominative row: the project keeps the load as demand without a
// named person; the kind is counted for the report.
function addExcluded(ctx: PdcContext, project: PdcProject, kind: ResourceKind, jh: number, done: number, line: number): void {
  project.genericJh = round2(project.genericJh + jh);
  project.genericDone = round2(project.genericDone + done);
  ctx.excluded.jh = round2(ctx.excluded.jh + jh);
  ctx.excluded.done = round2(ctx.excluded.done + done);
  if (kind === "zz") ctx.excluded.zz++;
  else if (kind === "role") ctx.excluded.roles++;
  else ctx.excluded.generic++;
  tallyInto(ctx.tallies, `${excludedLabel(kind)} — charge gardée sur le projet, hors personnes`, line);
}

// Aggregated signalements, unknown-métier questions, prefix survey, the
// zero-charge projects, and the cross-checks of the persons' own lines.
function finalize(ctx: PdcContext): void {
  for (const [message, t] of ctx.tallies) warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  for (const [label, t] of ctx.unknownMetiers) {
    doubt(ctx.report, ctx.fileName,
      `métier inconnu « ${label} » (${t.count} ligne(s), ligne(s) ${t.lines.join(", ")}` +
        `${t.count > t.lines.length ? ", …" : ""}) — à rapprocher d'un profil DSI ? (charge comptée « non attribué »)`);
  }
  if (ctx.prefixes.size > 0) {
    const seen = [...ctx.prefixes.entries()].map(([p, n]) => `« ${p} » (${n})`).join(" ; ");
    warn(ctx.report, `préfixes métier décollés avant rapprochement : ${seen} (signification à confirmer — Q9)`, ctx.fileName);
  }
  const zero = [...ctx.projects.values()]
    .filter((p) => [...p.charges.values()].every((c) => c.jh === 0 && c.done === 0)).length;
  if (zero > 0) warn(ctx.report, `${zero} projet(s) du plan de charge sans aucune charge ${ctx.year}`, ctx.fileName);
  crossCheckPersons(ctx);
}

// The persons' own lines against their rows: missing lines are said, a
// « Planifiée » total that disagrees with the sum is signaled (the line rules).
function crossCheckPersons(ctx: PdcContext): void {
  const persons = [...ctx.persons.values()];
  const noCapacity = persons.filter((p) => p.capacityJh === null).length;
  const noPlanned = persons.filter((p) => p.plannedJh === null).length;
  const disagree = persons.filter((p) => p.plannedJh !== null && Math.abs(p.plannedJh - p.jh) > 0.5).length;
  if (noCapacity > 0) {
    warn(ctx.report, `${noCapacity} personne(s) sans ligne « Disponible ressource » — capacité lue dans Ress.Profils à défaut`, ctx.fileName);
  }
  if (noPlanned > 0) {
    warn(ctx.report, `${noPlanned} personne(s) sans ligne « Planifiée projet » — total pris sur la somme des affectations`, ctx.fileName);
  }
  if (disagree > 0) {
    warn(ctx.report,
      `${disagree} personne(s) dont la somme des affectations diffère de la ligne « Planifiée projet » de plus de 0,5 j.h — la ligne fait foi`,
      ctx.fileName);
  }
}
