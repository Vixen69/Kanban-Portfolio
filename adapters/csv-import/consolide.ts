// Reader for the author's consolidated « Projets » sheet — THE perimeter
// master (Q18): its rows are the candidate cards; `isProjetSIS` keeps or
// excludes each one. Domain comes from « Domaine (Ptf) » when it speaks the
// board vocabulary (else étape-3 falls back to the RDOM join). Everything
// uncertain is optional in the contract: the report's verbatim extras are
// the feedback loop that locks the real labels.

import type { BoardConfig } from "../../core/types.ts";
import { createTolerantLookup, normalizeLabel } from "./normalize.ts";
import type { TolerantHit } from "./normalize.ts";
import { parseFrenchBoolean, parseFrenchDate } from "./values.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
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
  ref: RowRef;
}

/** The parsed perimeter master. */
export interface ConsolideTable {
  entries: ConsolideEntry[];
  byName: ReadonlyMap<string, ConsolideEntry>;
  excludedCount: number;
  /** Distinct « Complexité du projet » values (canal/nature material). */
  complexites: ReadonlyMap<string, number>;
  /** Distinct unresolved « Domaine (Ptf) » labels. */
  unknownDomains: ReadonlyMap<string, Tally>;
}

interface ConsolideContext {
  match: HeaderMatch;
  report: ImportReport;
  fileName: string;
  domainLookup: (cell: string) => TolerantHit | null;
  typeLookup: (cell: string) => TolerantHit | null;
  entries: ConsolideEntry[];
  byName: Map<string, ConsolideEntry>;
  excludedCount: number;
  complexites: Map<string, number>;
  unknownDomains: Map<string, Tally>;
  tallies: Map<string, Tally>;
}

/**
 * Parses the consolidated data rows (header excluded) into the perimeter.
 * Inputs: the data rows, the header match, the board config, the report
 * and the file name.
 * Outputs: the ConsolideTable; side effects: écarté (empty/total rows,
 * `isProjetSIS` faux), douteux (duplicates), aggregated signalements
 * (unreadable flags, unknown domains, complexity survey).
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseConsolide(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig,
  report: ImportReport, fileName: string,
): ConsolideTable {
  const ctx: ConsolideContext = {
    match, report, fileName,
    domainLookup: createTolerantLookup(
      config.domains.flatMap((d): Array<[string, string]> => [[d.id, d.id], [d.name, d.id], [d.short, d.id]]),
    ),
    typeLookup: createTolerantLookup(
      config.types.flatMap((t): Array<[string, string]> => [[t.id, t.id], [t.name, t.id], [t.short, t.id]]),
    ),
    entries: [], byName: new Map(), excludedCount: 0,
    complexites: new Map(), unknownDomains: new Map(), tallies: new Map(),
  };
  for (const row of rows) readConsolideRow(ctx, row);
  finalize(ctx);
  return {
    entries: ctx.entries, byName: ctx.byName, excludedCount: ctx.excludedCount,
    complexites: ctx.complexites, unknownDomains: ctx.unknownDomains,
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
  const flag = perimeterFlag(ctx, row);
  if (flag === false) {
    ctx.excludedCount++;
    discard(ctx.report, ctx.fileName, "hors périmètre (isProjetSIS faux)", { ref, value: nom });
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

// The perimeter flag: absent column -> everything retained; unreadable
// cell -> retained but signaled (never a silent exclusion).
function perimeterFlag(ctx: ConsolideContext, row: CsvRow): boolean | null {
  if (!ctx.match.columnIndex.has("isProjetSIS")) return null;
  const parsed = parseFrenchBoolean(cell(ctx, row, "isProjetSIS"));
  if (parsed === "invalid") {
    tallyInto(ctx.tallies, "« isProjetSIS » illisible — ligne conservée", row.line);
    return null;
  }
  return parsed;
}

function registerEntry(
  ctx: ConsolideContext, row: CsvRow, ref: RowRef, nom: string, normalizedName: string,
): void {
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
  const typeCell = cell(ctx, row, "Type").trim();
  const typeHit = typeCell === "" ? null : ctx.typeLookup(typeCell);
  const complexite = cell(ctx, row, "Complexité du projet").trim();
  if (complexite !== "") {
    ctx.complexites.set(complexite, (ctx.complexites.get(complexite) ?? 0) + 1);
  }
  const idCell = cell(ctx, row, "Id").trim();
  const code = idCell.match(/^PE[\s-]?(\d{4,6})$/i);
  const entry: ConsolideEntry = {
    name: nom, normalizedName,
    codename: code === null ? null : `PE${code[1]}`,
    domainId, domainCell,
    typeId: typeHit?.id ?? null,
    createdAt: dateOrNull(ctx, row, "Début"),
    ref,
  };
  ctx.entries.push(entry);
  ctx.byName.set(normalizedName, entry);
}

function dateOrNull(ctx: ConsolideContext, row: CsvRow, column: string): string | null {
  const parsed = parseFrenchDate(cell(ctx, row, column));
  if (parsed.kind === "date") return parsed.iso;
  if (parsed.kind !== "empty") {
    tallyInto(ctx.tallies, `« ${column} » illisible`, row.line);
  }
  return null;
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
  if (ctx.complexites.size > 0) {
    const seen = [...ctx.complexites.entries()]
      .map(([label, count]) => `« ${label} » (${count})`).join(" ; ");
    warn(ctx.report, `« Complexité du projet » — valeurs vues : ${seen} (candidat canal/nature)`, ctx.fileName);
  }
}
