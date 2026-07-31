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

/** The consolidated sheet (delivered as Projets.csv) — the SINGLE card
 * source since 2026-07-31: everything but the plan de charge. The 53 real
 * labels were dictated by the author (« Ss-Daine », double spaces and
 * « (Res|Trans) » pipes are verbatim; normalization absorbs the spacing). */
export const CONSOLIDE_CONTRACT: FileContract = {
  id: "consolide",
  displayName: "Consolidé",
  columns: ["Nom", "Domaine (Ptf)", "isProjetSIS"],
  optional: [
    "Id", "Type", "Complexité du projet", "État du processus", "Début", "Fin",
    "Jalon en cours", "Charge JH",
    "Budget RDLI Total Coût (Res+Trans)",
    "Coût final ME (Res.+Trans)", "Coût réel ME (Res.+Trans)",
    "Engagé 2026 (Trans)",
    "Charge finale ME (Res) (J)", "Charge réelle ME (Res) (J)",
    "Responsable 1", "Responsable 2", "Responsable 3", "Responsable portefeuilles",
  ],
  ignored: [
    "Ss-Daine (Ptf)", "Domaine (Orga)", "Ss-Daine (Orga)", "Catégorie",
    "Type Gpe", "Priorité.", "Score total", "Date T0",
    "Budget Validé PDSI Charge (Res) (J)", "Budget Validé PDSI Coût (Res)",
    "Budget Validé PDSI Coût (Trans)", "Budget Validé PDSI Total coût (Res+Trans)",
    "Budget RDLI Charge (Res) (J)", "Budget RDLI Coût (Trans)",
    "Coût final ME (Trans)", "Coût réel ME (Trans)",
    "Coût réel ME (Res)", "Coût final ME (Res)",
    "Référence active (Réf.)", "Catégorisation", "Date d'export",
    "PDSI2026 O/N", "ME 2026 (Res|Trans)", "ME 2026 (Res)", "ME2026 (Trans)",
    "ME2026 (Trans CAPEX)", "ME2026 (Trans OPEX)", "Réel 2026 (Res|Trans)",
    "Réel 2026 (Trans)", "Réel 2026 (Res)(€)", "Réel 2026 (Res)(J)",
    "RAF 2026 (Res|Trans)", "Budget validé PDSI2026", "Budg.2026 (Res)",
    "Budg.2026 (Trans)", "Budg.2026 (Trans.CAPEX)", "Budg.2026 (Trans.OPEX)",
  ],
};

/** The raw `projet` export — chef de projet + RDOM-based domain fallback
 * (real labels, survey of 2026-07-29). */
export const PROJETS_CONTRACT: FileContract = {
  id: "projets",
  displayName: "Projets",
  columns: ["Nom", "Responsable 1", "Responsable 2", "Responsable 3", "Responsable portefeuilles"],
  optional: ["Projet.Actif", "État du processus", "Id", "Domaine"],
  ignored: [
    "Fichier", "Portefeuille", "Type", "Nature", "État du budget",
    "Nature du projet", "Priorité.", "Criticité", "Score total", "Début", "Date T0",
    "Date prévisionnelle de démarrage (RDO)", "Date prévisionnelle de déploiement", "Fin",
    "Descriptions texte riche", "Objectifs", "Impact si report du projet",
    "Entité demandeur", "Entité payeur", "Entité payeur mutualisée",
    "Directions Participantes", "Programme métier", "Outils",
    "Exigences légales et/ou de sécurité", "Charge JH", "Taux TUO",
    "Budget PDSI Présenté Charge (Res) (J)", "Budget Présenté PDSI Coût (Res)",
    "Budget Présenté PDSI Coût (Trans)", "Budget Présenté PDSI Total Coût (Res+Trans)",
    "Budget Validé PDSI Charge (Res) (J)", "Budget Validé PDSI Coût (Res)",
    "Budget Validé PDSI Coût (Trans)", "Budget Validé PDSI Total coût (Res+Trans)",
    "Budget RDLI Charge (Res) (J)", "Budget RDLI Coût (Trans)",
    "Budget RDLI Total Coût (Res+Trans)", "Coût final ME (Res.+Trans)",
    "Coût réel ME (Res.+Trans)", "Coût final ME (Trans)", "Coût réel ME (Trans)",
    "Charge finale ME (Res) (J)", "Charge réelle ME (Res) (J)", "Coût réel ME (Res)",
    "Coût final ME (Res)", "Créateur", "Référence active (Réf.)", "Jalon en cours",
    "Top projet", "Catégorie", "Date création", "CAT", "Date d'export",
  ],
};

/** Every registered contract, in priority order for tie-breaking. The raw
 * `projet` export left the circuit on 2026-07-31 (the consolidated sheet
 * carries the responsables now); its contract stays defined but
 * unregistered so it can never steal the consolidated file. */
export const CONTRACTS: readonly FileContract[] =
  [CONSOLIDE_CONTRACT, RDOM_CONTRACT, SP_TOTAL_CONTRACT];

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
