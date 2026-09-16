// The COUT PREV reader's report lines (ADR 030/034 — split from couts.ts to
// respect the 300-line cap): the reading in figures, the aggregated
// signalements, where every « Projet.Portefeuille » path landed and by
// which rule (2026-09-15: the author found sold projects under A&D and
// could not tell why), then the questions — portfolios without domain,
// non-PE codes retained, and the projects excluded for having no ME
// figure, named so the domain owners can check them (a « 0 / 0 / 0 » can
// be a missing entry, not a cancellation).

import type { BoardConfig } from "../../core/types.ts";
import { ruleLabel } from "./portfolio.ts";
import { tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import { doubt, warn } from "./report.ts";
import type { ImportReport } from "./report.ts";
import type { PortfolioHit } from "./portfolio.ts";
import { excludedSummary } from "./couts-stats.ts";
import type { CoutsStats } from "./couts-stats.ts";

/** One « Projet.Portefeuille » path of the retained projects: how many, and where it landed. */
export interface PortfolioTally {
  count: number;
  hit: PortfolioHit | null;
}

/** What the reader collected, handed to the report. */
export interface CoutsReading {
  report: ImportReport;
  fileName: string;
  year: string;
  config: BoardConfig;
  stats: CoutsStats;
  /** Retained projects. */
  entries: number;
  /** False when the config carries no `exercise.states` (every state kept). */
  statesListed: boolean;
  tallies: Map<string, Tally>;
  unknownPortfolios: Map<string, Tally>;
  portfolios: Map<string, PortfolioTally>;
  nonPe: string[];
  noMe: string[];
}

const CODES_SHOWN = 20;

/**
 * A capped code list for the report (« PE1, PE2, … +12 »).
 * Input: the codes. Output: the text. Failure: none.
 */
export function codes(list: readonly string[]): string {
  const rest = list.length - CODES_SHOWN;
  return `${list.slice(0, CODES_SHOWN).join(", ")}${rest > 0 ? `, … +${rest}` : ""}`;
}

function domainLabel(config: BoardConfig, hit: PortfolioHit): string {
  const domain = config.domains.find((d) => d.id === hit.domainId);
  const sub = hit.subDomainId === null ? undefined : domain?.subDomains?.find((s) => s.id === hit.subDomainId);
  return `${domain?.name ?? hit.domainId}${sub === undefined ? "" : ` / ${sub.name}`}`;
}

// Where every portfolio path lands, and by which rule — most projects
// first: the author reads here why a project sits in a domain.
function emitPortfolios(r: CoutsReading): void {
  const rows = [...r.portfolios.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], "fr"));
  for (const [path, { count, hit }] of rows) {
    const target = hit === null ? "sans domaine" : domainLabel(r.config, hit);
    const how = hit === null ? "aucun mot connu (nom, code, alias de domaine, sous-domaine)" : ruleLabel(hit);
    warn(r.report, `portefeuille « ${path || "(vide)"} » : ${count} projet(s) → ${target} — ${how}`, r.fileName);
  }
}

/**
 * Writes the COUT PREV reading into the report: figures, signalements,
 * the portfolio → domain relevé, then the questions.
 * Inputs: what the reader collected. Output: none (mutates the report).
 * Failure modes: none.
 */
export function emitCoutsReport(r: CoutsReading): void {
  const s = r.stats;
  if (!r.statesListed) warn(r.report, "aucune liste d'états dans la config (`exercise.states`) — tous les états gardés", r.fileName);
  warn(r.report,
    `${s.rows} ligne(s) lue(s) · ${s.projectsSeen} projet(s) distinct(s) · ${s.otherYearRows} ligne(s) hors ${r.year}` +
      ` · périmètre ${r.entries} : écartés ${excludedSummary(s.excluded, r.year)}` +
      (s.inactive > 0 ? ` · ${s.inactive} retenu(s) avec « Projet.Actif » faux (gardés, information)` : ""),
    r.fileName);
  for (const [message, t] of r.tallies) warn(r.report, `${message} : ${tallyLabel(t)}`, r.fileName);
  emitPortfolios(r);
  for (const [label, t] of r.unknownPortfolios) {
    doubt(r.report, r.fileName,
      `portefeuille sans domaine : « ${label} » (${t.count} projet(s)) — à déclarer dans \`domains[].aliases\` ou en sous-domaine ?`);
  }
  if (r.nonPe.length > 0) {
    doubt(r.report, r.fileName,
      `codes retenus hors PE : ${r.nonPe.length} (${codes(r.nonPe)}) — l'auteur en attend 4 ou 5 ; davantage = une règle manque`);
  }
  if (r.noMe.length > 0) {
    doubt(r.report, r.fileName,
      `projets écartés sans aucun chiffre ME (quatre cellules vides ou à zéro) : ${r.noMe.length} — codes : ${codes(r.noMe)}` +
        " — annulés de fait, ou saisie manquante ? à vérifier avec les responsables de domaine");
  }
}
