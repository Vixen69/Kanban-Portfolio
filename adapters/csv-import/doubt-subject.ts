// What a « Doute à trancher » is about inside its project, in a few French
// words (ADR 062): one project may raise several doubts — its COUT PREV
// rows disagree on the état AND on the type — and each question must be
// told apart where it is asked (the legend of its row, « Redemander »,
// « ne plus me demander », which is remembered per question). Derived from
// the doubt's kind and detail, which every reader already sets. Pure.

import type { ImportDoubtKind } from "../../core/import-doubts.ts";

const FACTS: Readonly<Record<string, string>> = { etat: "état", type: "type", portfolio: "portefeuille", name: "nom" };

const ROWS: Readonly<Record<string, string>> = {
  projets: "ligne de l'onglet Projets", jalons: "ligne ProjetsJalons", sp: "ligne SP", cdp: "chef de projet (ProjetsCdP)",
};

const JOINS: Readonly<Record<string, string>> = {
  "jalons-nom": "ligne ProjetsJalons à son nom", "jalons-nom-ambigu": "ligne ProjetsJalons à son nom",
  "sp-nom": "ligne SP à son nom", "sp-nom-ambigu": "ligne SP à son nom", "sp-id-nom": "ligne SP : Id ou nom",
  "cdp-nom": "chef de projet (ProjetsCdP) à son nom",
};

const IDENTITIES: Readonly<Record<string, string>> = {
  collision: "deux projets sur une carte", "cartes-main": "cartes saisies à la main", adoption: "adoption d'une carte",
};

/**
 * The subject of a doubt: what the question is on, inside the project.
 * Inputs: the kind, the detail (the fact, the file, the column). Output:
 * a few French words (« état », « ligne SP », « montant « Coût prév (ME) » »);
 * the detail itself when a reader adds a detail this table does not know.
 * Failure modes: none.
 */
export function doubtSubject(kind: ImportDoubtKind, detail: string): string {
  if (kind === "couts-fact") return FACTS[detail] ?? detail;
  if (kind === "me-unreadable") return "chiffre ME";
  if (kind === "duplicate-row") return ROWS[detail] ?? detail;
  if (kind === "join") return JOINS[detail] ?? detail;
  if (kind === "figure") return `montant « ${detail} »`;
  return IDENTITIES[detail] ?? detail;
}
