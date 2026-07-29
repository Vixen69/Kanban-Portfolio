// Shared audit-report model (docs/IMPORT-MAPPING.md « Rapport d'import ») :
// inventory first, then the three buckets — pris / écarté / douteux — plus
// free-form signalements. Étapes 2-4 extend this same structure. Mutation
// goes through the helpers below so optional fields are only ever assigned
// when present (exactOptionalPropertyTypes).

/** Location of one source row: file name + 1-based line (header = line 1). */
export interface RowRef {
  file: string;
  line: number;
}

/** A value that was imported, with its source and destination. */
export interface TakenEntry {
  ref: RowRef;
  value: string;
  destination: string;
  note?: string;
}

/** A row or value that was not taken, with the reason. */
export interface DiscardedEntry {
  file: string;
  reason: string;
  ref?: RowRef;
  value?: string;
}

/** An ambiguous case, with the precise question to settle. */
export interface DoubtfulEntry {
  file: string;
  question: string;
  ref?: RowRef;
  value?: string;
}

/** A tolerated anomaly worth reading (encoding, separator, merges...). */
export interface WarningEntry {
  message: string;
  file?: string;
}

/** How one received file was classified. */
export interface FileInventoryEntry {
  name: string;
  sizeBytes: number;
  status: "recognized" | "recognized-with-deviations" | "near-miss" | "unknown" | "not-csv" | "unsupported";
  /** French label: "utf-8", "utf-8 (BOM)", "windows-1252", "indéterminé". */
  encoding?: string;
  contractId?: string;
  /** French detail: header deviations, sniffed separator, refusal reason. */
  detail?: string;
}

/** An expected source file that was not received. */
export interface MissingExpectedEntry {
  name: string;
  note: string;
}

/** One line of the assembly state ("domaine : en attente de projet"...). */
export interface AssemblyEntry {
  subject: string;
  status: string;
}

/** The full audit report, rendered by render-report.ts. */
export interface ImportReport {
  inventory: FileInventoryEntry[];
  missingExpected: MissingExpectedEntry[];
  assembly: AssemblyEntry[];
  taken: TakenEntry[];
  discarded: DiscardedEntry[];
  doubtful: DoubtfulEntry[];
  warnings: WarningEntry[];
}

/**
 * Creates an empty report (all sections empty).
 * Inputs: none. Outputs: a fresh mutable ImportReport.
 * Failure modes: none.
 */
export function createReport(): ImportReport {
  return {
    inventory: [], missingExpected: [], assembly: [],
    taken: [], discarded: [], doubtful: [], warnings: [],
  };
}

/**
 * Records an imported value (bucket « pris »).
 * Inputs: the report, the source row, the raw value, its destination
 * (French), and an optional French note (e.g. how a label was resolved).
 * Outputs: none (mutates the report). Failure modes: none.
 */
export function take(
  report: ImportReport, ref: RowRef, value: string, destination: string, note?: string,
): void {
  const entry: TakenEntry = { ref, value, destination };
  if (note !== undefined) entry.note = note;
  report.taken.push(entry);
}

/**
 * Records a rejected row or value (bucket « écarté »).
 * Inputs: the report, the file name, the French reason, and optionally the
 * source row and raw value. Outputs: none (mutates the report).
 * Failure modes: none.
 */
export function discard(
  report: ImportReport, file: string, reason: string,
  opts?: { ref?: RowRef; value?: string },
): void {
  const entry: DiscardedEntry = { file, reason };
  if (opts?.ref !== undefined) entry.ref = opts.ref;
  if (opts?.value !== undefined) entry.value = opts.value;
  report.discarded.push(entry);
}

/**
 * Records an ambiguous case (bucket « douteux »).
 * Inputs: the report, the file name, the precise French question, and
 * optionally the source row and raw value. Outputs: none (mutates the
 * report). Failure modes: none.
 */
export function doubt(
  report: ImportReport, file: string, question: string,
  opts?: { ref?: RowRef; value?: string },
): void {
  const entry: DoubtfulEntry = { file, question };
  if (opts?.ref !== undefined) entry.ref = opts.ref;
  if (opts?.value !== undefined) entry.value = opts.value;
  report.doubtful.push(entry);
}

/**
 * Records a tolerated anomaly (section « signalements »).
 * Inputs: the report, the French message, optionally the file it concerns.
 * Outputs: none (mutates the report). Failure modes: none.
 */
export function warn(report: ImportReport, message: string, file?: string): void {
  const entry: WarningEntry = { message };
  if (file !== undefined) entry.file = file;
  report.warnings.push(entry);
}
