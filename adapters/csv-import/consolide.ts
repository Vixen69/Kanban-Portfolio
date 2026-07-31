// Reader for the author's consolidated sheet — THE single card source
// (Q18): every row IS a retained card, the file itself is the perimeter.
// `isProjetSIS` is INFORMATIONAL only (SIS = Système d'Information du
// Soutien, outside the DSI — corrected 2026-07-31, it must never exclude).
// Domain comes from « Domaine (Ptf) » (board vocabulary) with an RDOM
// surname fallback via « Responsable portefeuilles »; the chef de projet
// is the first of Responsables 1→2→3 that is not an RDOM.

import type { BoardConfig } from "../../core/types.ts";
import { createTolerantLookup, normalizeLabel } from "./normalize.ts";
import type { TolerantHit } from "./normalize.ts";
import { parseFrenchBoolean } from "./values.ts";
import { amountCell, dateCell } from "./cells.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { surnameDomains } from "./rdom.ts";
import type { RdomTable } from "./rdom.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** One retained project from the consolidated sheet (a future card). */
export interface ConsolideEntry {
  name: string;
  normalizedName: string;
  /** From « Id » when PE-shaped, else null (cross-checked at the join). */
  codename: string | null;
  /** Board domain resolved from « Domaine (Ptf) », or null (RDOM fallback). */
  domainId: string | null;
  /** Raw « Domaine (Ptf) » cell, kept for the unknown-vocabulary survey. */
  domainCell: string;
  typeId: string | null;
  createdAt: string | null;
  /** Chef de projet: first non-RDOM of Responsables 1→3, or null. */
  owner: string | null;
  /** Informational only — never excludes (SIS = hors DSI). */
  isProjetSis: boolean | null;
  /** « Fin » — the projected delivery date (mapping decision 2026-07-31). */
  dateRdr: string | null;
  /** Raw « Jalon en cours » label (position rule pending — surveyed). */
  jalonEnCours: string | null;
  /** k€ : « Budget RDLI Total Coût (Res+Trans) ». */
  budgetRdli: number | null;
  /** k€ : « Coût final ME (Res.+Trans) ». */
  budgetEstimated: number | null;
  /** k€ : « Coût réel ME (Res.+Trans) ». */
  budgetConsumed: number | null;
  /** k€ : « Engagé 2026 (Trans) ». */
  budgetEngaged: number | null;
  /** j.h : « Charge finale ME (Res) (J) », fallback « Charge JH ». */
  effortEstimated: number | null;
  /** j.h : « Charge réelle ME (Res) (J) ». */
  effortConsumed: number | null;
  ref: RowRef;
}

/** The parsed perimeter master. */
export interface ConsolideTable {
  entries: ConsolideEntry[];
  byName: ReadonlyMap<string, ConsolideEntry>;
  /** Informational VRAI/FAUX/vide counts of « isProjetSIS ». */
  sisCounts: { yes: number; no: number; blank: number };
  /** Distinct « Complexité du projet » values (canal/nature material). */
  complexites: ReadonlyMap<string, number>;
  /** Distinct « Jalon en cours » values (position rule material). */
  jalons: ReadonlyMap<string, number>;
  /** Distinct « État du processus » values. */
  processStates: ReadonlyMap<string, number>;
  /** Distinct unresolved « Domaine (Ptf) » labels. */
  unknownDomains: ReadonlyMap<string, Tally>;
}

interface ConsolideContext {
  match: HeaderMatch;
  report: ImportReport;
  fileName: string;
  rdom: RdomTable | null;
  domainLookup: (cell: string) => TolerantHit | null;
  typeLookup: (cell: string) => TolerantHit | null;
  entries: ConsolideEntry[];
  byName: Map<string, ConsolideEntry>;
  sisCounts: { yes: number; no: number; blank: number };
  complexites: Map<string, number>;
  jalons: Map<string, number>;
  processStates: Map<string, number>;
  unknownDomains: Map<string, Tally>;
  tallies: Map<string, Tally>;
}

/**
 * Parses the consolidated data rows (header excluded): every kept row is a
 * card — the file IS the perimeter.
 * Inputs: the data rows, the header match, the board config, the RDOM
 * table (surname fallback; null tolerated), the report and the file name.
 * Outputs: the ConsolideTable; side effects: écarté (empty/total rows
 * only), douteux (duplicates), aggregated signalements (unreadable cells,
 * unknown domains, RDOM exclusions, surveys).
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseConsolide(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig, rdom: RdomTable | null,
  report: ImportReport, fileName: string,
): ConsolideTable {
  const ctx: ConsolideContext = {
    match, report, fileName, rdom,
    domainLookup: createTolerantLookup(
      config.domains.flatMap((d): Array<[string, string]> => [[d.id, d.id], [d.name, d.id], [d.short, d.id]]),
    ),
    typeLookup: createTolerantLookup(
      config.types.flatMap((t): Array<[string, string]> => [[t.id, t.id], [t.name, t.id], [t.short, t.id]]),
    ),
    entries: [], byName: new Map(), sisCounts: { yes: 0, no: 0, blank: 0 },
    complexites: new Map(), jalons: new Map(), processStates: new Map(),
    unknownDomains: new Map(), tallies: new Map(),
  };
  for (const row of rows) readConsolideRow(ctx, row);
  finalize(ctx);
  return {
    entries: ctx.entries, byName: ctx.byName, sisCounts: ctx.sisCounts,
    complexites: ctx.complexites, jalons: ctx.jalons,
    processStates: ctx.processStates, unknownDomains: ctx.unknownDomains,
  };
}

// Structural gates, the perimeter flag, then the entry build.
function readConsolideRow(ctx: ConsolideContext, row: CsvRow): void {
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  if (row.cells.every((c) => c.trim() === "")) {
    discard(ctx.report, ctx.fileName, "ligne vide", { ref });
    return;
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
        "en double dans le consolidé — première occurrence conservée",
      { ref });
    return;
  }
  registerEntry(ctx, row, ref, nom, normalizedName);
}

// « Domaine (Ptf) » in the board vocabulary (tolerant), else the RDOM
// surname of « Responsable portefeuilles »; unknown labels are surveyed.
function deriveDomain(
  ctx: ConsolideContext, row: CsvRow,
): { domainId: string | null; domainCell: string } {
  const domainCell = cell(ctx, row, "Domaine (Ptf)").trim();
  let domainId: string | null = null;
  if (domainCell !== "") {
    const hit = ctx.domainLookup(domainCell);
    domainId = hit?.id ?? null;
    if (hit === null) tallyInto(ctx.unknownDomains, domainCell, row.line);
    else if (hit.repaired) {
      tallyInto(ctx.tallies, "« Domaine (Ptf) » aux accents détruits — rapproché", row.line);
    }
  }
  if (domainId === null) {
    const fallback = surnameDomains(ctx.rdom, cell(ctx, row, "Responsable portefeuilles"));
    if (fallback.size === 1) {
      domainId = [...fallback][0] ?? null;
      tallyInto(ctx.tallies, "domaine résolu par RDOM (« Responsable portefeuilles »)", row.line);
    }
  }
  return { domainId, domainCell };
}

// « isProjetSIS » is informational only (SIS = hors DSI) — counted, never
// used to exclude; an unreadable cell is signaled.
function sisFlag(ctx: ConsolideContext, row: CsvRow): boolean | null {
  const parsed = parseFrenchBoolean(cell(ctx, row, "isProjetSIS"));
  if (parsed === true) ctx.sisCounts.yes++;
  else if (parsed === false) ctx.sisCounts.no++;
  else {
    ctx.sisCounts.blank++;
    if (parsed === "invalid") {
      tallyInto(ctx.tallies, "« isProjetSIS » illisible", row.line);
    }
  }
  return parsed === "invalid" ? null : parsed;
}

// Chef de projet: first of Responsables 1→3 that is not an RDOM surname;
// every exclusion is counted (homonyms must stay visible).
function deriveOwner(ctx: ConsolideContext, row: CsvRow): string | null {
  let sawAny = false;
  for (const column of ["Responsable 1", "Responsable 2", "Responsable 3"]) {
    const value = cell(ctx, row, column).trim();
    if (value === "") continue;
    sawAny = true;
    if (surnameDomains(ctx.rdom, value).size > 0) {
      tallyInto(ctx.tallies, `« ${column} » est un RDOM — exclu du chef de projet`, row.line);
      continue;
    }
    return value;
  }
  if (sawAny) tallyInto(ctx.tallies, "aucun chef de projet (responsables tous RDOM)", row.line);
  return null;
}

function registerEntry(
  ctx: ConsolideContext, row: CsvRow, ref: RowRef, nom: string, normalizedName: string,
): void {
  const { domainId, domainCell } = deriveDomain(ctx, row);
  const typeCell = cell(ctx, row, "Type").trim();
  const typeHit = typeCell === "" ? null : ctx.typeLookup(typeCell);
  bump(ctx.complexites, cell(ctx, row, "Complexité du projet").trim());
  bump(ctx.jalons, cell(ctx, row, "Jalon en cours").trim());
  bump(ctx.processStates, cell(ctx, row, "État du processus").trim());
  const idCell = cell(ctx, row, "Id").trim();
  const code = idCell.match(/^PE[\s-]?(\d{4,6})$/i);
  const jalon = cell(ctx, row, "Jalon en cours").trim();
  const entry: ConsolideEntry = {
    name: nom, normalizedName,
    codename: code === null ? null : `PE${code[1]}`,
    domainId, domainCell,
    typeId: typeHit?.id ?? null,
    createdAt: dateCell(cell(ctx, row, "Début"), "Début", row.line, ctx.tallies),
    owner: deriveOwner(ctx, row),
    isProjetSis: sisFlag(ctx, row),
    jalonEnCours: jalon === "" ? null : jalon,
    ...financials(ctx, row),
    ref,
  };
  ctx.entries.push(entry);
  ctx.byName.set(normalizedName, entry);
}

// The money (k€) and effort (j.h) columns — mapping decided 2026-07-31.
function financials(ctx: ConsolideContext, row: CsvRow) {
  const amount = (column: string): number | null =>
    amountCell(cell(ctx, row, column), column, row.line, ctx.tallies);
  return {
    dateRdr: dateCell(cell(ctx, row, "Fin"), "Fin", row.line, ctx.tallies),
    budgetRdli: amount("Budget RDLI Total Coût (Res+Trans)"),
    budgetEstimated: amount("Coût final ME (Res.+Trans)"),
    budgetConsumed: amount("Coût réel ME (Res.+Trans)"),
    budgetEngaged: amount("Engagé 2026 (Trans)"),
    effortEstimated: amount("Charge finale ME (Res) (J)") ?? amount("Charge JH"),
    effortConsumed: amount("Charge réelle ME (Res) (J)"),
  };
}

function bump(map: Map<string, number>, value: string): void {
  if (value !== "") map.set(value, (map.get(value) ?? 0) + 1);
}

function cell(ctx: ConsolideContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  if (index === undefined) return "";
  return row.cells[index] ?? "";
}

// Aggregated signalements + the two vocabulary surveys.
function finalize(ctx: ConsolideContext): void {
  for (const [message, t] of ctx.tallies) {
    warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  }
  for (const [label, t] of ctx.unknownDomains) {
    doubt(ctx.report, ctx.fileName,
      `« Domaine (Ptf) » inconnu du board : « ${label} » (${t.count} ligne(s), ligne(s) ` +
        `${t.lines.join(", ")}${t.count > t.lines.length ? ", …" : ""}) — repli RDOM tenté à la jointure`);
  }
  survey(ctx, ctx.complexites, "« Complexité du projet » — valeurs vues", "candidat canal/nature");
  survey(ctx, ctx.jalons, "« Jalon en cours » — valeurs vues", "règle de position à dicter");
  survey(ctx, ctx.processStates, "« État du processus » — valeurs vues", "information");
}

function survey(ctx: ConsolideContext, map: Map<string, number>, title: string, note: string): void {
  if (map.size === 0) return;
  const seen = [...map.entries()].map(([label, count]) => `« ${label} » (${count})`).join(" ; ");
  warn(ctx.report, `${title} : ${seen} (${note})`, ctx.fileName);
}
