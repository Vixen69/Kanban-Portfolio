// Header-contract registry and identification engine. Files are recognized
// by their header row, never by their filename (docs/IMPORT-MAPPING.md
// « Contrat d'en-têtes » — the number-one long-term killer is header drift,
// so every deviation is named precisely). Live registry since the PMO
// revision of 2026-09-04 (R1/R9): PARAM, SP (2026 or total), ProjetsJalons,
// Projets (the perimeter) and Ressources_PdC. The July RDOM table stays
// registered as RETIRED: such a file is inventoried by name, never parsed.

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
  /** Set on a July contract kept for recognition only: the French note
   * shown in the inventory. Such a file is never parsed. */
  retired?: string;
}

/** The PMO's PARAM sheet (R5): four tables side by side, row 1 = titles,
 * row 2 = headers. Only DOMAINES (Domaine, Responsable) and ORGANISATION
 * (Domaine (Orga), Sous-domaine (Orga), preceded by an unlabeled
 * organisation-path column) are read. « Responsable » repeats per table —
 * the reader locates each one by position. */
export const PARAM_CONTRACT: FileContract = {
  id: "param",
  displayName: "PARAM",
  columns: ["Domaine", "Responsable", "Domaine (Orga)", "Sous-domaine (Orga)"],
  optional: ["Organisation", "Domaine (Ptf)", "Sous domaine (Ptf)"],
  ignored: ["Domaine Projets Vendus", "Nom", "PDSI", "Colonne1"],
};

/** The SP sheet — the 2026 costs (R8). Accepts the SP_2026 onglet (with an
 * « Id ») as well as the raw SP_total export (no Id, join by name). */
export const SP_CONTRACT: FileContract = {
  id: "sp",
  displayName: "SP (2026 ou total)",
  columns: ["Nom", "Coût prév (ME)", "Coût réel", "Engagé Achats"],
  optional: ["Id", "* Budget validé RDLI", "Type Gpe", "Type", "État du processus", "Sous domaine"],
  ignored: [
    "Notes", "Menu", "Score criblage", "Priorité", "Top projet", "Responsable 1",
    "État suivant autorisé", "Catégorie", "Début", "Jalon RVSR ou Fin", "Jalon RDLI validé",
    "Jalon RDR validé (Réf.8)", "Jalon RDR prévisionnel", "Budget présenté PDSI",
    "Budget validé PDSI", "* CAT global projet", "ME Achats", "Réel Achats",
    "Lignes Arbitrages", "RAF Achats", "% Reste à engager", "% Engagé ou Réalisé",
    "Seuil Engagé ou Réalisé",
  ],
};

/** The ProjetsJalons onglet — the initial position (R7): RDO / RDLI / RDR
 * « franchi » cells (their exact format is surveyed, Q21). */
export const JALONS_CONTRACT: FileContract = {
  id: "projets_jalons",
  displayName: "ProjetsJalons",
  columns: ["Id", "Nom du projet", "RDO franchi", "RDLI franchi", "RDR franchi"],
  optional: [
    "RDO (Statut)", "RDLI (Statut)", "RDR (Statut)", "Jalon en cours", "Next jalon",
    "Etat du processus", "Type", "Domaine (Ptf)", "Sous domaine (Ptf)",
  ],
  ignored: [
    "Début", "Fin", "CAT", "Début T0", "Budg", "Pré", "RDO", "RDLI", "RDR", "RVAV", "RVSR",
    "Process RTM", "Planif next jalon", "Début (calculé)", "Fin (calculé)", "MEF Fin calc",
    "Année ID PE", "PDSI2026 O/N",
  ],
};

/** The Projets sheet — THE perimeter (R2): every row is a retained card.
 * One contract covers both shapes (R4): the consolidated onglet carries the
 * resolved Orga columns; the raw Sciforma export only the organisation
 * path (« Domaine »), translated through PARAM. Id + Type + État du
 * processus keep an old SP_total (Nom + Type) from posing as the perimeter. */
export const PROJETS_CONTRACT: FileContract = {
  id: "projets",
  displayName: "Projets",
  columns: ["Id", "Nom", "Type", "État du processus"],
  optional: [
    "Domaine (Orga)", "Ss-Daine (Orga)", "Domaine",
    "Responsable 1", "Responsable 2", "Responsable 3",
    "Début", "Fin", "Jalon en cours", "Projet.Actif",
    "Budget RDLI Total Coût (Res+Trans)", "Charge finale ME (Res) (J)",
    "Charge réelle ME (Res) (J)", "Charge JH",
  ],
  ignored: [
    "Domaine (Ptf)", "Ss-Daine (Ptf)", "Catégorie", "Type Gpe", "Complexité du projet",
    "Priorité.", "Score total", "Date T0", "isProjetSIS", "Responsable portefeuilles",
    "Budget Validé PDSI Charge (Res) (J)", "Budget Validé PDSI Coût (Res)",
    "Budget Validé PDSI Coût (Trans)", "Budget Validé PDSI Total coût (Res+Trans)",
    "Budget RDLI Charge (Res) (J)", "Budget RDLI Coût (Trans)",
    "Coût final ME (Res.+Trans)", "Coût réel ME (Res.+Trans)", "Engagé 2026 (Trans)",
    "Coût final ME (Trans)", "Coût réel ME (Trans)", "Coût réel ME (Res)", "Coût final ME (Res)",
    "Référence active (Réf.)", "Catégorisation", "Date d'export", "PDSI2026 O/N",
    "ME 2026 (Res|Trans)", "ME 2026 (Res)", "ME2026 (Trans)", "ME2026 (Trans CAPEX)",
    "ME2026 (Trans OPEX)", "Réel 2026 (Res|Trans)", "Réel 2026 (Trans)", "Réel 2026 (Res)(€)",
    "Réel 2026 (Res)(J)", "RAF 2026 (Res|Trans)", "Budget validé PDSI2026", "Budg.2026 (Res)",
    "Budg.2026 (Trans)", "Budg.2026 (Trans.CAPEX)", "Budg.2026 (Trans.OPEX)",
    "Fichier", "Portefeuille", "Nature", "État du budget", "Nature du projet", "Criticité",
    "Date prévisionnelle de démarrage (RDO)", "Date prévisionnelle de déploiement",
    "Descriptions texte riche", "Objectifs", "Impact si report du projet",
    "Entité demandeur", "Entité payeur", "Entité payeur mutualisée",
    "Directions Participantes", "Programme métier", "Outils",
    "Exigences légales et/ou de sécurité", "Taux TUO",
    "Budget PDSI Présenté Charge (Res) (J)", "Budget Présenté PDSI Coût (Res)",
    "Budget Présenté PDSI Coût (Trans)", "Budget Présenté PDSI Total Coût (Res+Trans)",
    "Créateur", "Top projet", "Date création", "CAT",
  ],
};

/** The plan de charge (Ressources_PdC): two-level headers — the year row
 * carries « 2026 » over a Prév./Réel pair, reconstructed by the reader
 * from the sub-header row (real labels, survey of 2026-07-31). */
export const PDC_CONTRACT: FileContract = {
  id: "ressources_pdc",
  displayName: "Ressources_PdC",
  columns: ["Matricule", "Ressource", "Métier", "Nom Projet", "2026"],
  optional: ["Organisation", "Id Projet", "Total Prév.", "Total Réel"],
  ignored: [
    "Type projet", "Portefeuille", "2023", "2024", "2025", "2027", "2028",
    "2029", "2030", "Etat du processus", "Date de publication",
    "Projet.Actif", "Date export",
  ],
};

/** The July RDOM table (domaine ↔ nom), retired by PARAM (R5). Kept so a
 * stray RDOM.csv is named for what it is instead of « inconnu ». */
export const RDOM_CONTRACT: FileContract = {
  id: "rdom",
  displayName: "RDOM",
  columns: ["Domaine", "Nom"],
  retired: "table RDOM de juillet — remplacée par PARAM (révision 2026-09-04), non lue",
};

/** Every registered contract, **from the most specific to the most
 * generic**: when a file fully matches several contracts, the first one
 * here wins (registry order IS the priority). Live contracts first; the
 * retired RDOM table last — its two generic columns exist in almost every
 * rich export, and PARAM itself carries both. */
export const CONTRACTS: readonly FileContract[] =
  [PARAM_CONTRACT, SP_CONTRACT, JALONS_CONTRACT, PROJETS_CONTRACT, PDC_CONTRACT, RDOM_CONTRACT];

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
 * larger one must resolve to the full match, seen on the real Projets.csv).
 * Among full matches, **registry order decides** (CONTRACTS is ordered
 * most-specific first); among near-misses, more required columns found
 * wins, then registry order.
 * Failure modes: none — an empty header yields "unknown".
 */
export function identifyHeader(
  headerCells: string[],
  contracts: readonly FileContract[] = CONTRACTS,
): HeaderIdentification {
  const normalized = headerCells.map(normalizeLabel);
  let bestFull: Evaluation | null = null;
  let bestPartial: Evaluation | null = null;
  let bestPartialFound = -1;
  for (const contract of contracts) {
    const evaluation = evaluate(contract, headerCells, normalized);
    const found = contract.columns.length - evaluation.missing.length;
    if (found === 0) continue;
    if (evaluation.missing.length === 0) {
      bestFull ??= evaluation;
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
