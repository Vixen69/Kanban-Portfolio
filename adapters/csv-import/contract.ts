// Header-contract registry and identification engine. Files are recognized
// by their header row, never by their filename (docs/IMPORT-MAPPING.md
// « Contrat d'en-têtes » — the number-one long-term killer is header drift,
// so every deviation is named precisely). Étapes 2-4 register sp_total /
// projet / ressources_pdc here without touching the engine.

import { normalizeLabel } from "./normalize.ts";

/** One recognizable source file: canonical column labels. */
export interface FileContract {
  id: string;
  displayName: string;
  columns: readonly string[];
}

/** The RDOM table: domaine <-> nom de responsable de domaine. */
export const RDOM_CONTRACT: FileContract = {
  id: "rdom",
  displayName: "RDOM",
  columns: ["Domaine", "Nom"],
};

/** Every registered contract, in priority order for tie-breaking. */
export const CONTRACTS: readonly FileContract[] = [RDOM_CONTRACT];

/** A tolerated header anomaly (the file is still readable). */
export interface HeaderDeviation {
  kind: "extra" | "duplicate";
  column: string;
}

/** All canonical columns found; order-independent, extras tolerated. */
export interface HeaderMatch {
  status: "match";
  contract: FileContract;
  /** Canonical column label -> cell index (first occurrence on duplicates). */
  columnIndex: ReadonlyMap<string, number>;
  /** Exact cell count of the header row (data rows beyond it are flagged). */
  headerWidth: number;
  deviations: HeaderDeviation[];
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
}

/**
 * Matches a header row against the contract registry.
 * Inputs: the raw header cells and optionally a registry (defaults to
 * CONTRACTS; tests inject their own). Comparison uses normalizeLabel on
 * both sides, so case, accents, spacing and a leaked BOM are tolerated.
 * Outputs: "match" when every canonical column is present (extras and
 * duplicates reported, order irrelevant); "near-miss" for the best contract
 * with at least one column found (with the precise missing list);
 * "unknown" otherwise. Ties break by registry order.
 * Failure modes: none — an empty header yields "unknown".
 */
export function identifyHeader(
  headerCells: string[],
  contracts: readonly FileContract[] = CONTRACTS,
): HeaderIdentification {
  const normalized = headerCells.map(normalizeLabel);
  let best: Evaluation | null = null;
  for (const contract of contracts) {
    const evaluation = evaluate(contract, headerCells, normalized);
    const found = contract.columns.length - evaluation.missing.length;
    const bestFound = best === null ? -1 : best.contract.columns.length - best.missing.length;
    if (found > bestFound) best = evaluation;
  }
  if (best === null) return { status: "unknown" };
  if (best.missing.length === best.contract.columns.length) return { status: "unknown" };
  if (best.missing.length > 0) {
    return {
      status: "near-miss", contract: best.contract,
      missing: best.missing, deviations: best.deviations,
    };
  }
  return {
    status: "match", contract: best.contract,
    columnIndex: best.columnIndex, headerWidth: headerCells.length,
    deviations: best.deviations,
  };
}

// Scores one contract against the normalized header: claims cell indexes
// per canonical column, then classifies the unclaimed cells as extras.
function evaluate(
  contract: FileContract, headerCells: string[], normalized: string[],
): Evaluation {
  const columnIndex = new Map<string, number>();
  const deviations: HeaderDeviation[] = [];
  const missing: string[] = [];
  const claimed = new Set<number>();
  for (const column of contract.columns) {
    const wanted = normalizeLabel(column);
    const hits: number[] = [];
    normalized.forEach((label, index) => {
      if (label === wanted) hits.push(index);
    });
    const first = hits[0];
    if (first === undefined) {
      missing.push(column);
      continue;
    }
    columnIndex.set(column, first);
    hits.forEach((index) => claimed.add(index));
    if (hits.length > 1) deviations.push({ kind: "duplicate", column });
  }
  headerCells.forEach((raw, index) => {
    if (claimed.has(index)) return;
    const label = normalizeLabel(raw);
    deviations.push({ kind: "extra", column: label === "" ? "(colonne vide)" : raw.trim() });
  });
  return { contract, columnIndex, deviations, missing };
}
