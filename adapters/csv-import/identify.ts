// One received file -> decoded, parsed, identified, inventoried. The header
// row is SEARCHED among the first non-empty rows (real exports carry filter
// preambles above their headers — SP_total does); the first full contract
// match wins, else the best near-miss, else unknown with the first row's
// labels listed verbatim (the report doubles as the on-site structure
// survey, docs/IMPORT-MAPPING.md « Relevé »).

import { decodeCsvBytes } from "./decode.ts";
import { parseCsv } from "./csv.ts";
import type { CsvRow } from "./csv.ts";
import { identifyHeader } from "./contract.ts";
import type { HeaderDeviation, HeaderIdentification, HeaderMatch } from "./contract.ts";
import { warn } from "./report.ts";
import type { FileInventoryEntry, ImportReport } from "./report.ts";

/** One received file: name (no path) and raw bytes. */
export interface InputFile {
  name: string;
  bytes: Uint8Array;
}

/** A recognized file, ready for its contract reader. */
export interface ParsedCsvFile {
  match: HeaderMatch;
  dataRows: CsvRow[];
}

/** How many leading non-empty rows are tried as header candidates. */
const HEADER_SEARCH_ROWS = 20;

/**
 * Classifies one received file and feeds the inventory.
 * Inputs: the file and the report. Non-.csv files are inventoried and
 * skipped; .csv files are decoded (encoding signaled), parsed, and their
 * header searched among the first rows.
 * Outputs: the header match and data rows for recognized files, else null.
 * Failure modes: none — every rejection lands in the inventory.
 */
export function processFile(file: InputFile, report: ImportReport): ParsedCsvFile | null {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    addInventory(report, file, "not-csv", {});
    return null;
  }
  const decoded = decodeCsvBytes(file.bytes);
  for (const message of decoded.warnings) warn(report, message, file.name);
  if (decoded.unsupported !== undefined) {
    addInventory(report, file, "unsupported", { detail: decoded.unsupported });
    return null;
  }
  const encoding = encodingLabel(decoded.encoding);
  const parsed = parseCsv(decoded.text);
  for (const message of parsed.warnings) warn(report, message, file.name);
  const pick = pickHeader(parsed.rows);
  if (pick === null) {
    addInventory(report, file, "unknown", { encoding, detail: "fichier vide" });
    return null;
  }
  if (pick.capped) {
    warn(report,
      `recherche d'en-têtes limitée aux ${HEADER_SEARCH_ROWS} premières lignes non vides — aucun contrat reconnu avant cette borne`,
      file.name);
  }
  return classify(file, report, encoding, parsed.rows, pick);
}

interface HeaderPick {
  rowIndex: number;
  identification: HeaderIdentification;
  /** True when the search cap was reached without any full match. */
  capped: boolean;
}

// First full match among the candidates wins; else the near-miss with the
// most required columns found (first on ties); else the first non-empty
// row, kept so its labels can be listed.
function pickHeader(rows: CsvRow[]): HeaderPick | null {
  const candidates: number[] = [];
  for (let i = 0; i < rows.length && candidates.length < HEADER_SEARCH_ROWS; i++) {
    if ((rows[i]?.cells ?? []).some((c) => c.trim() !== "")) candidates.push(i);
  }
  const capped = candidates.length === HEADER_SEARCH_ROWS;
  let best: HeaderPick | null = null;
  for (const rowIndex of candidates) {
    const identification = identifyHeader(rows[rowIndex]?.cells ?? []);
    if (identification.status === "match") return { rowIndex, identification, capped: false };
    if (best === null || nearMissScore(identification) > nearMissScore(best.identification)) {
      best = { rowIndex, identification, capped };
    }
  }
  return best;
}

function nearMissScore(identification: HeaderIdentification): number {
  if (identification.status !== "near-miss") return 0;
  return identification.contract.columns.length - identification.missing.length;
}

// Identification outcome -> inventory entry; only a full match is parsed.
function classify(
  file: InputFile, report: ImportReport, encoding: string, rows: CsvRow[], pick: HeaderPick,
): ParsedCsvFile | null {
  const headerRow = rows[pick.rowIndex];
  const identification = pick.identification;
  if (headerRow === undefined) return null;
  if (identification.status === "unknown") {
    addInventory(report, file, "unknown", {
      encoding,
      detail: `aucune colonne connue — en-têtes vus : ${headersSample(headerRow.cells)}`,
    });
    return null;
  }
  if (identification.status === "near-miss") {
    addInventory(report, file, "near-miss", {
      encoding,
      contractId: identification.contract.id,
      detail: `ligne ${headerRow.line} ; colonnes manquantes : ${identification.missing.join(", ")}` +
        ` ; en-têtes vus : ${headersSample(headerRow.cells)}`,
    });
    return null;
  }
  if (pick.rowIndex > 0) {
    warn(report,
      `en-têtes reconnus ligne ${headerRow.line} — ${pick.rowIndex} ligne(s) ignorée(s) au-dessus (préambule)`,
      file.name);
  }
  if (identification.ignoredPresent.length > 0) {
    warn(report,
      `colonnes ignorées (prévues au contrat) : ${identification.ignoredPresent.join(" ; ")}`,
      file.name);
  }
  if (identification.repaired.length > 0) {
    warn(report,
      `en-têtes aux accents détruits, rapprochés du contrat : ${identification.repaired.join(" ; ")}`,
      file.name);
  }
  const status = identification.deviations.length > 0 ? "recognized-with-deviations" : "recognized";
  addInventory(report, file, status, {
    encoding,
    contractId: identification.contract.id,
    detail: deviationsLabel(identification.deviations),
  });
  return { match: identification, dataRows: rows.slice(pick.rowIndex + 1) };
}

// The exact header labels of an unrecognized file, verbatim — the report
// doubles as the on-site structure survey (docs/IMPORT-MAPPING.md « Relevé
// de structure ») without any file ever leaving the client machine.
function headersSample(cells: string[]): string {
  const MAX = 30;
  const quoted = cells.slice(0, MAX).map((c) => (c.trim() === "" ? "« (vide) »" : `« ${c.trim()} »`));
  const rest = cells.length - MAX;
  return quoted.join(" ; ") + (rest > 0 ? ` ; … (+${rest})` : "");
}

function deviationsLabel(deviations: HeaderDeviation[]): string | undefined {
  if (deviations.length === 0) return undefined;
  return deviations
    .map((d) => (d.kind === "extra" ? `colonne en trop « ${d.column} »` : `colonne dupliquée « ${d.column} »`))
    .join(" ; ");
}

function encodingLabel(encoding: "utf-8" | "utf-8-bom" | "windows-1252" | "unknown"): string {
  if (encoding === "utf-8-bom") return "utf-8 (BOM)";
  if (encoding === "unknown") return "indéterminé";
  return encoding;
}

// exactOptionalPropertyTypes: optional fields only assigned when present.
function addInventory(
  report: ImportReport,
  file: InputFile,
  status: FileInventoryEntry["status"],
  opts: { encoding?: string; contractId?: string; detail?: string | undefined },
): void {
  const entry: FileInventoryEntry = { name: file.name, sizeBytes: file.bytes.length, status };
  if (opts.encoding !== undefined) entry.encoding = opts.encoding;
  if (opts.contractId !== undefined) entry.contractId = opts.contractId;
  if (opts.detail !== undefined) entry.detail = opts.detail;
  report.inventory.push(entry);
}
