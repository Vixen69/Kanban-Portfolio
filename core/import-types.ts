// Shapes exchanged by the import-from-the-tool routes (ADR 027), shared by
// the middle (producer) and the front (consumer) through core — types only,
// no logic, so both sides agree without importing each other.

/** One received file: its name and its bytes, base64-encoded. */
export interface ImportFilePayload {
  name: string;
  base64: string;
}

/** The audit's head-line counts, as the report's first lines say them. */
export interface ImportSummary {
  received: number;
  recognized: number;
  taken: number;
  discarded: number;
  doubtful: number;
  warnings: number;
  /** Names of the expected files still missing. */
  missing: string[];
}

/** What an audit returns: the French report (Markdown) and its counts. */
export interface ImportAuditResult {
  report: string;
  summary: ImportSummary;
  /** True when the perimeter assembled — a load would write cards. */
  loadable: boolean;
}

/** What a load wrote, on top of the audit it re-ran. */
export interface ImportLoadResult extends ImportAuditResult {
  load: {
    created: number;
    updated: number;
    moved: number;
    unlisted: number;
    relisted: number;
    /** Hand-placed cards the export would have moved (left in place). */
    divergences: number;
    chargesWithoutProfile: number;
    /** The capacity snapshot stored with the load, when the files carried one. */
    capacity: { persons: number; assignments: number } | null;
  };
}
