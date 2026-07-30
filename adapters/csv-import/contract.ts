// Header-contract registry and identification engine. Files are recognized
// by their header row, never by their filename (docs/IMPORT-MAPPING.md
// « Contrat d'en-têtes » — the number-one long-term killer is header drift,
// so every deviation is named precisely). Étapes 2-4 register sp_total /
// projet / ressources_pdc here without touching the engine.

import { damageTolerantPattern, normalizeLabel } from "./normalize.ts";

/** One recognizable source file: canonical column labels. */
export interface FileContract {
  id: string;
  displayName: string;
  /** Required columns: all must be present for a match. */
  columns: readonly string[];
  /** Read when present; absence is tolerated, never a deviation. */
  optional?: readonly string[];
  /** Known and deliberately unused; claimed so they are not « en trop »,
   * listed once in the report (never silently). */
  ignored?: readonly string[];
}

/** The RDOM table: domaine <-> nom de responsable de domaine. */
export const RDOM_CONTRACT: FileContract = {
  id: "rdom",
  displayName: "RDOM",
  columns: ["Domaine", "Nom"],
};

/** SP_total: subjects, milestones and budgets (real labels, survey of
 * 2026-07-29 — docs/IMPORT-MAPPING.md « Relevé réel »). The starred labels
 * carry the export's own footnote marker, verbatim. */
export const SP_TOTAL_CONTRACT: FileContract = {
  id: "sp_total",
  displayName: "SP_total",
  columns: [
    "Nom", "Type", "Début",
    "Jalon RDLI validé", "Jalon RDR validé (Réf.8)", "Jalon RDR prévisionnel",
    "* Budget validé RDLI", "Coût prév (ME)", "Coût réel", "Engagé Achats",
  ],
  optional: ["État suivant autorisé"],
  ignored: [
    "Notes", "Menu", "Score criblage", "Priorité", "Top projet", "Responsable 1",
    "Catégorie", "Jalon RVSR ou Fin", "* CAT global projet", "Budget présenté PDSI",
    "Budget validé PDSI", "ME Achats", "Réel Achats",
  ],
};

/** Every registered contract, in priority order for tie-breaking. */
export const CONTRACTS: readonly FileContract[] = [RDOM_CONTRACT, SP_TOTAL_CONTRACT];

/** A tolerated header anomaly (the file is still readable). */
export interface HeaderDeviation {
  kind: "extra" | "duplicate";
  column: string;
}

/** All canonical columns found; order-independent, extras tolerated. */
export interface HeaderMatch {
  status: "match";
  contract: FileContract;
  /** Canonical column label -> cell index (first occurrence on duplicates);
   * includes the optional columns that were found. */
  columnIndex: ReadonlyMap<string, number>;
  /** Exact cell count of the header row (data rows beyond it are flagged). */
  headerWidth: number;
  deviations: HeaderDeviation[];
  /** Ignored-by-contract columns present in this file (report them once). */
  ignoredPresent: string[];
  /** Canonical labels only matched through accent-damage repair (report). */
  repaired: string[];
}

/** Some canonical columns found, others missing: the file is NOT parsed. */
export interface HeaderNearMiss {
  status: "near-miss";
  contract: FileContract;
  missing: string[];
  deviations: HeaderDeviation[];
}

export type HeaderIdentification = HeaderMatch | HeaderNearMiss | { status: "unknown" };

interface Evaluation {
  contract: FileContract;
  columnIndex: Map<string, number>;
  deviations: HeaderDeviation[];
  missing: string[];
  ignoredPresent: string[];
  repaired: string[];
}

/**
 * Matches a header row against the contract registry.
 * Inputs: the raw header cells and optionally a registry (defaults to
 * CONTRACTS; tests inject their own). Comparison uses normalizeLabel on
 * both sides, so case, accents, spacing and a leaked BOM are tolerated.
 * Outputs: "match" when every canonical column is present (extras and
 * duplicates reported, order irrelevant); "near-miss" for the best contract
 * with at least one column found (with the precise missing list);
 * "unknown" otherwise. A FULL match always dominates any near-miss (a rich
 * export carrying a small contract's two columns plus fragments of a
 * larger one must resolve to the full match, seen on the real Projets.csv);
 * within a status, more required columns found wins, then registry order.
 * Failure modes: none — an empty header yields "unknown".
 */
export function identifyHeader(
  headerCells: string[],
  contracts: readonly FileContract[] = CONTRACTS,
): HeaderIdentification {
  const normalized = headerCells.map(normalizeLabel);
  let bestFull: Evaluation | null = null;
  let bestFullFound = -1;
  let bestPartial: Evaluation | null = null;
  let bestPartialFound = -1;
  for (const contract of contracts) {
    const evaluation = evaluate(contract, headerCells, normalized);
    const found = contract.columns.length - evaluation.missing.length;
    if (found === 0) continue;
    if (evaluation.missing.length === 0) {
      if (found > bestFullFound) {
        bestFull = evaluation;
        bestFullFound = found;
      }
    } else if (found > bestPartialFound) {
      bestPartial = evaluation;
      bestPartialFound = found;
    }
  }
  const best = bestFull ?? bestPartial;
  if (best === null) return { status: "unknown" };
  if (best.missing.length > 0) {
    return {
      status: "near-miss", contract: best.contract,
      missing: best.missing, deviations: best.deviations,
    };
  }
  return {
    status: "match", contract: best.contract,
    columnIndex: best.columnIndex, headerWidth: headerCells.length,
    deviations: best.deviations, ignoredPresent: best.ignoredPresent,
    repaired: best.repaired,
  };
}

// Scores one contract against the normalized header: claims cell indexes
// for required then optional then ignored columns, then classifies the
// unclaimed cells as extras.
function evaluate(
  contract: FileContract, headerCells: string[], normalized: string[],
): Evaluation {
  const e: Evaluation = {
    contract, columnIndex: new Map(), deviations: [], missing: [],
    ignoredPresent: [], repaired: [],
  };
  const claimed = new Set<number>();
  claimColumns(contract.columns, normalized, e, claimed, e.missing);
  claimColumns(contract.optional ?? [], normalized, e, claimed, null);
  for (const label of contract.ignored ?? []) {
    const wanted = normalizeLabel(label);
    normalized.forEach((cell, index) => {
      if (cell !== wanted || claimed.has(index)) return;
      claimed.add(index);
      if (!e.ignoredPresent.includes(label)) e.ignoredPresent.push(label);
    });
  }
  headerCells.forEach((raw, index) => {
    if (claimed.has(index)) return;
    const label = normalizeLabel(raw);
    e.deviations.push({ kind: "extra", column: label === "" ? "(colonne vide)" : raw.trim() });
  });
  return e;
}

// Claims every cell matching each label — exactly first, then through the
// accent-damage patterns (destroyed é -> "?"/"�"/dropped, a real client
// case) with the repair recorded. A null `missing` marks the optional set
// (absence tolerated). Duplicates keep the first index.
function claimColumns(
  labels: readonly string[], normalized: string[],
  e: Evaluation, claimed: Set<number>, missing: string[] | null,
): void {
  for (const column of labels) {
    const wanted = normalizeLabel(column);
    const hits: number[] = [];
    normalized.forEach((label, index) => {
      if (label === wanted) hits.push(index);
    });
    if (hits.length === 0) {
      const pattern = damageTolerantPattern(column);
      normalized.forEach((label, index) => {
        if (!claimed.has(index) && pattern.test(label)) hits.push(index);
      });
      if (hits.length > 0) e.repaired.push(column);
    }
    const first = hits[0];
    if (first === undefined) {
      if (missing !== null) missing.push(column);
      continue;
    }
    e.columnIndex.set(column, first);
    hits.forEach((index) => claimed.add(index));
    if (hits.length > 1) e.deviations.push({ kind: "duplicate", column });
  }
}
