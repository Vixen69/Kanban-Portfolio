// The header-contract registry (docs/IMPORT-MAPPING.md « Contrat
// d'en-têtes »): one FileContract per recognizable source file, live
// since the PMO revision of 2026-09-04 (R1/R9) — PARAM, SP (exercise year
// or total), ProjetsJalons, Projets (the perimeter), Ress.Profils and
// Ressources_PdC (built for the exercise year, ADR 024). The July RDOM
// table stays registered as RETIRED: inventoried by name, never parsed.
// The matching engine lives in contract.ts.

import { DEFAULT_EXERCISE_YEAR } from "../../core/config.ts";
import type { FileContract } from "./contract.ts";

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
  displayName: "SP (exercice ou total)",
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

/** The ProjetsCdP sheet (2026-09-08): the perimeter's rows with their
 * Responsable 1→3, exported separately because the August Projets onglet
 * carries none. Same rule as Projets (R6): the chef de projet is the first
 * Responsable that is not a PARAM domain lead. Keep this file to Id, Nom and
 * the Responsable columns: with Type + État du processus it would pass for
 * a second Projets perimeter (registry order elects Projets first). */
export const CDP_CONTRACT: FileContract = {
  id: "projets_cdp",
  displayName: "ProjetsCdP",
  columns: ["Id", "Responsable 1"],
  optional: ["Nom", "Responsable 2", "Responsable 3"],
  ignored: [],
};

/** The Ress.Profils onglet — the DSI's people (ADR 024): identity, Orga
 * domain, métier, Int/Ext and the exercise year's capacity. Email and
 * Coût are declared ignored: never read, never stored. */
export const PROFILS_CONTRACT: FileContract = {
  id: "ress_profils",
  displayName: "Ress.Profils",
  columns: ["Nom de famille", "Prénom", "Métier", "Disponibilité"],
  optional: ["pk Contact", "Id", "Int/Ext", "Domaine (Orga)", "Sous-domaine (Orga)", "Profil", "Statut"],
  ignored: ["Email", "Coût"],
};

/**
 * The plan de charge (Ressources_PdC): two-level headers — the year row
 * carries the exercise year over a Prév./Réel pair, reconstructed by the
 * reader from the sub-header row (real labels, survey of 2026-07-31). Built
 * for the configured exercise year (ADR 024); the neighbouring years are
 * declared ignored so header drift stays named.
 * Input: the exercise year. Output: the contract. Failure modes: none.
 */
export function pdcContract(year: number): FileContract {
  const otherYears = Array.from({ length: 8 }, (_, i) => year - 3 + i)
    .filter((y) => y !== year).map(String);
  return {
    id: "ressources_pdc",
    displayName: "Ressources_PdC",
    columns: ["Matricule", "Ressource", "Métier", "Nom Projet", String(year)],
    optional: ["Organisation", "Id Projet", "Total Prév.", "Total Réel"],
    ignored: [
      "Type projet", "Portefeuille", ...otherYears, "Etat du processus", "Date de publication",
      "Projet.Actif", "Date export",
    ],
  };
}

/** The plan de charge contract for the default exercise year. */
export const PDC_CONTRACT: FileContract = pdcContract(DEFAULT_EXERCISE_YEAR);

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
 * rich export, and PARAM itself carries both. The PdC contract is built for
 * the exercise year (ADR 024), hence a registry per year.
 * Input: the exercise year. Output: the ordered registry. Failure: none. */
export function contractsFor(year: number): readonly FileContract[] {
  return [
    PARAM_CONTRACT, SP_CONTRACT, JALONS_CONTRACT, PROJETS_CONTRACT, CDP_CONTRACT, PROFILS_CONTRACT,
    pdcContract(year), RDOM_CONTRACT,
  ];
}

/** The registry for the default exercise year (tests, documentation). */
export const CONTRACTS: readonly FileContract[] = contractsFor(DEFAULT_EXERCISE_YEAR);
