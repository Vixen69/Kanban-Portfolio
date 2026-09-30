// The types of the parsed perimeter (Projets onglet or COUT PREV export):
// one retained project = one future card. Split from projets.ts to respect
// the 300-line file cap; projets.ts re-exports them.

import type { RowRef } from "./report.ts";

/** How the file carries the domain: resolved Orga columns, an organisation
 * path to translate through PARAM, a Sciforma portfolio (COUT PREV, ADR
 * 030), or nothing. */
export type DomainShape = "orga" | "path" | "portefeuille" | "none";

/** One retained project (a future card). */
export interface ProjetEntry {
  /** « Id » as written (the stable identity); "" when the cell is empty. */
  id: string;
  name: string;
  /** The name without its leading code — the card's title (author, 2026-09-09). */
  title: string;
  normalizedName: string;
  normalizedTitle: string;
  /** The Id, else a PE code embedded in the name, else null. */
  codename: string | null;
  typeId: string | null;
  createdAt: string | null;
  dateRdr: string | null;
  domainId: string | null;
  subDomainId: string | null;
  domainSource: "orga" | "param" | null;
  domainRule: string | null; // how the domain came, worded for report and conflicts (ADR 036)
  owner: string | null;
  state: string; // the process state as written ("" when none): a config done state places the card in Done (ADR 043)
  budgetRdli: number | null;
  effortEstimated: number | null;
  effortConsumed: number | null;
  ref: RowRef;
}

/**
 * Why the perimeter rule took or left one project (ADR 055): the import
 * report names every project it retained and every one it excluded, with
 * the rule — never a bare count. The first failing rule is the motive.
 */
export interface PerimeterVerdict {
  /** The project's code as written (« Projet. Id » / « Id », else the code read in the name); "" when none. */
  code: string;
  /** The project's name as written. */
  name: string;
  /** Which rule decided: retained, or the first exclusion motive. */
  motive: "retained" | "noYear" | "state" | "type" | "arbitrage" | "noMe" | "duplicate";
  /**
   * Plain French. Retained: what it was taken on (« état « Budget validé »,
   * type « Etude » »). Excluded: the motive with the offending value
   * (« état « Reporté » hors des états retenus »).
   */
  reason: string;
  /** Set when a « Doute à trancher » decided the value behind the verdict (ADR 062): the fact and the value chosen. */
  settledBy?: string;
}

/** The parsed perimeter. */
export interface ProjetsTable {
  /** The elected file's name — the assembly line names the perimeter's source. */
  fileName: string;
  entries: ProjetEntry[];
  /** One verdict per project read, retained or excluded, in reading order (ADR 055). */
  verdicts: PerimeterVerdict[];
  byId: ReadonlyMap<string, ProjetEntry>;
  byName: ReadonlyMap<string, ProjetEntry>;
  shape: DomainShape;
  /** typeId (or "?" for unknown/empty) -> count. */
  typeCounts: ReadonlyMap<string, number>;
  counts: ProjetsCounts;
}

/** Derivation counters for the assembly read-out. */
export interface ProjetsCounts {
  domainDirect: number;
  domainViaParam: number;
  domainMissing: number;
  subDetailed: number;
  subFolded: number;
  withOwner: number;
  leadsExcluded: number;
}
