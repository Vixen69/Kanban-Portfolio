// Shapes exchanged by the import-from-the-tool routes (ADR 027), shared by
// the middle (producer) and the front (consumer) through core — types only,
// no logic, so both sides agree without importing each other. The readable
// report of ADR 055 (ImportChanges) lives in import-changes.ts.

import type { ImportChanges } from "./import-changes.ts";

export type {
  ImportAdopted, ImportAdvanced, ImportCardRef, ImportChangeCounts, ImportChanges, ImportEntered, ImportExcluded, ImportFileEntry, ImportFileStatus,
  ImportKeptFact, ImportLeft, ImportSource, ImportUnrecognized,
} from "./import-changes.ts";

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

/** A domain + sub-domain pair, by config ids. */
export interface DomainRef {
  domain: string;
  subDomain: string | null;
}

/** What the PMO decides on one domain conflict (ADR 036). */
export type DomainDecision = "garder" | "remplacer";

/**
 * One card the board holds under a domain the export disagrees with
 * (ADR 036). The domain is what the responsables de domaine arbitrate on:
 * it is never overwritten silently — the PMO decides, one by one.
 */
export interface DomainConflict {
  cardId: string;
  title: string;
  codename: string | null;
  /** The board's value (a sub-domain the config no longer declares counts as none). */
  board: DomainRef;
  /** What the export and the rules propose. */
  proposed: DomainRef;
  /** The rule that proposed it, worded as in the report. */
  rule: string;
  /** The last decision the log holds on this card's domain: set by hand in the fiche, or an earlier import decision. */
  prior: { kind: "main" | "garder" | "remplacer"; ts: string } | null;
}

/** What an audit returns: the French report (Markdown) and its counts. */
export interface ImportAuditResult {
  /** The exercise year the files were read for and the load writes into (ADR 035). */
  exercise: number;
  report: string;
  summary: ImportSummary;
  /** True when the perimeter assembled — a load would write cards. */
  loadable: boolean;
  /** The domain conflicts a load would raise (ADR 036) — each needs a decision before the load. */
  conflicts: DomainConflict[];
  /**
   * The facts the files leave blank on cards already on the board, by
   * fact: the stored value stands (ADR 054). On an audit, what a load
   * would keep; on a load, what it kept. Empty when nothing is missing.
   */
  factsKept: Array<{ label: string; cards: number }>;
  /**
   * The readable report (ADR 055): the files taken, what the load changes
   * on the board, card by card, and why each project enters or leaves. On
   * an audit, what a load WOULD change (no domain decision taken yet); on
   * a load, what it DID change.
   */
  changes: ImportChanges;
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
    /** Existing cards the export carried no position for (left in place). */
    kept: number;
    chargesWithoutProfile: number;
    /** Domain conflicts decided on this load (ADR 036): replaced / kept, and silenced by an earlier « garder ». */
    domainReplaced: number;
    domainKept: number;
    domainKeptByPrior: number;
    /** Deck cards deleted on the board: skipped, never re-created (ADR 058). */
    deletedSkipped: number;
    /** Hand-made cards adopted instead of duplicated (ADR 059). */
    adopted: number;
    /** Cards on which the export's NEW value replaced a hand correction (ADR 060). */
    replaced: number;
    /** Hand-placed cards a new jalon moved further along the flow (ADR 060; counted in moved too). */
    advanced: number;
    /** The capacity snapshot stored with the load, when the files carried one. */
    capacity: { persons: number; assignments: number } | null;
  };
}
