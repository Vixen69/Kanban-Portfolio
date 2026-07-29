// The audit pass the CLI calls: decode / parse / identify every received
// file, read the recognized ones, list what is still expected, describe the
// assembly state. Pure and filesystem-free ({ name, bytes } in, report out);
// stateless by design — each run redoes the whole assembly
// (docs/IMPORT-MAPPING.md « Construction par étapes »).

import type { BoardConfig } from "../../core/types.ts";
import { decodeCsvBytes } from "./decode.ts";
import { parseCsv } from "./csv.ts";
import type { CsvRow } from "./csv.ts";
import { identifyHeader, RDOM_CONTRACT } from "./contract.ts";
import type { HeaderDeviation, HeaderMatch } from "./contract.ts";
import { createReport, doubt, warn } from "./report.ts";
import type { FileInventoryEntry, ImportReport } from "./report.ts";
import { parseRdom } from "./rdom.ts";
import type { RdomTable } from "./rdom.ts";

/** One received file: name (no path) and raw bytes. */
export interface InputFile {
  name: string;
  bytes: Uint8Array;
}

/** The audit outcome: the report, plus the parsed tables for later steps. */
export interface AuditResult {
  report: ImportReport;
  rdom: RdomTable | null;
}

/**
 * Runs the full audit pass over the received files.
 * Inputs: the files (any set — recognition is by header contract, never by
 * filename) and the board config actually served (runtime override).
 * Outputs: the report and the RDOM table when one file matched its
 * contract; a second RDOM match is flagged douteux, first name in
 * codepoint order wins. Deterministic for identical inputs.
 * Failure modes: none — unreadable or alien files land in the inventory
 * with a reason, nothing throws.
 */
export function runImportAudit(files: InputFile[], config: BoardConfig): AuditResult {
  const report = createReport();
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  let rdom: RdomTable | null = null;
  let rdomFile = "";
  for (const file of sorted) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      addInventory(report, file, "not-csv", {});
      continue;
    }
    const parsed = processCsvFile(file, report);
    if (parsed === null || parsed.match.contract.id !== RDOM_CONTRACT.id) continue;
    if (rdom === null) {
      rdom = parseRdom(parsed.dataRows, parsed.match, config.domains, report, file.name);
      rdomFile = file.name;
    } else {
      doubt(
        report, file.name,
        `deux fichiers correspondent au contrat RDOM (« ${rdomFile} » et « ${file.name} ») — premier retenu`,
      );
    }
  }
  emitMissing(report, rdom !== null);
  emitAssembly(report, rdom);
  return { report, rdom };
}

// Decode + parse + identify one .csv; feeds the inventory and returns the
// rows only when the file matched a contract completely.
function processCsvFile(
  file: InputFile, report: ImportReport,
): { match: HeaderMatch; dataRows: CsvRow[] } | null {
  const decoded = decodeCsvBytes(file.bytes);
  for (const message of decoded.warnings) warn(report, message, file.name);
  if (decoded.unsupported !== undefined) {
    addInventory(report, file, "unsupported", { detail: decoded.unsupported });
    return null;
  }
  const encoding = encodingLabel(decoded.encoding);
  const parsed = parseCsv(decoded.text);
  for (const message of parsed.warnings) warn(report, message, file.name);
  // Real exports may carry empty lines above the header: skip them, say so.
  const headerIndex = parsed.rows.findIndex((row) => row.cells.some((c) => c.trim() !== ""));
  const headerRow = headerIndex === -1 ? undefined : parsed.rows[headerIndex];
  if (headerRow === undefined) {
    addInventory(report, file, "unknown", { encoding, detail: "fichier vide" });
    return null;
  }
  if (headerIndex > 0) {
    warn(report, `${headerIndex} ligne(s) vide(s) avant l'en-tête — ignorée(s)`, file.name);
  }
  const match = identifyAndInventory(file, report, encoding, headerRow.cells);
  if (match === null) return null;
  return { match, dataRows: parsed.rows.slice(headerIndex + 1) };
}

// Identification outcome -> inventory entry; only a full match is parsed.
function identifyAndInventory(
  file: InputFile, report: ImportReport, encoding: string, headerCells: string[],
): HeaderMatch | null {
  const identified = identifyHeader(headerCells);
  if (identified.status === "unknown") {
    addInventory(report, file, "unknown", {
      encoding,
      detail: `aucune colonne connue — en-têtes vus : ${headersSample(headerCells)}`,
    });
    return null;
  }
  if (identified.status === "near-miss") {
    addInventory(report, file, "near-miss", {
      encoding,
      contractId: identified.contract.id,
      detail: `colonnes manquantes : ${identified.missing.join(", ")}`,
    });
    return null;
  }
  const status = identified.deviations.length > 0 ? "recognized-with-deviations" : "recognized";
  addInventory(report, file, status, {
    encoding,
    contractId: identified.contract.id,
    detail: deviationsLabel(identified.deviations),
  });
  return identified;
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

// The inventory already shows the roadmap: sources whose contract arrives
// at a later step are listed as expected, with the step that defines them.
function emitMissing(report: ImportReport, hasRdom: boolean): void {
  if (!hasRdom) {
    report.missingExpected.push({ name: "RDOM", note: "table domaine ↔ nom (fournie par l'auteur)" });
  }
  report.missingExpected.push(
    { name: "SP_total", note: "sujets, jalons, budgets — contrat défini à l'étape 2" },
    { name: "projet", note: "chef de projet et domaine — contrat défini à l'étape 3" },
    { name: "ressources_PDC", note: "plan de charge — contrat défini à l'étape 4" },
  );
}

function emitAssembly(report: ImportReport, rdom: RdomTable | null): void {
  const rdomStatus = rdom === null
    ? "absente — fournir le CSV « Domaine;Nom »"
    : `prête (${rdom.entries.length} noms, ${rdom.namesByDomain.size} domaines)`;
  report.assembly.push(
    { subject: "table RDOM", status: rdomStatus },
    { subject: "cartes", status: "en attente de `SP_total` (étape 2)" },
    { subject: "domaine et chef de projet des cartes", status: "en attente de `projet` (étape 3)" },
    { subject: "plan de charge", status: "en attente de `ressources_PDC` (étape 4)" },
  );
}
