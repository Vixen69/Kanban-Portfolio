// Where the perimeter is read (ADR 030, ADR 056): the COUT PREV export
// (« Coût ») when one came; the Projets onglet otherwise — said loudly,
// since that list carries none of the exercise, state, type and ME rules.
// A file that LOOKS like the Coût export without being recognized (a
// header near miss, or an encoding the reader cannot open) refuses the
// load: the perimeter never falls back to Projets silently (E07 of the
// 2026-09-30 audit: one renamed « Année » header created a cancelled
// project, moved a finished one back to Demandes). Pure.

import type { BoardConfig } from "../../core/types.ts";
import { COUTS_CONTRACT, PROJETS_CONTRACT } from "./contract.ts";
import { elect, electProjets, namesLabel } from "./election.ts";
import type { Candidate, ImportBlocker } from "./election.ts";
import type { NearMiss } from "./identify.ts";
import { doubt, warn } from "./report.ts";
import type { ImportReport } from "./report.ts";
import type { ParamTable } from "./param.ts";
import { parseProjets } from "./projets.ts";
import type { ProjetsTable } from "./projets.ts";
import { checkPerimeters, parseCouts } from "./couts.ts";
import type { CoutsTable, PerimeterCheck } from "./couts.ts";
import type { DoubtBook } from "./doubt-book.ts";

/** How many of the Coût contract's five required columns make a near miss « Coût-like ». */
const COUTS_LIKE_FOUND = 3;

/** The perimeter as read, and the Projets files around it. */
export interface Perimeter {
  couts: CoutsTable | null;
  /** The Projets onglet read: the perimeter without COUT PREV, the cross-check with it. */
  ongletBest: Candidate | null;
  onglet: ProjetsTable | null;
  /** The perimeter: COUT PREV, else the onglet — null when none came or the Coût export is refused. */
  projets: ProjetsTable | null;
  check: PerimeterCheck | null;
  /** A full Projets export carrying « Responsable 1 » beside the onglet: it lends the chefs de projet. */
  lender: Candidate | null;
  /** True when a Coût-like file came but cannot be read as THE Coût export (ADR 056). */
  coutsRefused: boolean;
}

/** What the perimeter reading needs from the audit pass. */
export interface PerimeterInput {
  byContract: ReadonlyMap<string, Candidate[]>;
  config: BoardConfig;
  param: ParamTable | null;
  report: ImportReport;
  blockers: ImportBlocker[];
  nearMisses: readonly NearMiss[];
  /** The « Doutes à trancher » of this audit (ADR 062): asked by the file that IS the perimeter only. */
  book?: DoubtBook;
}

/**
 * The refusal for a Coût-like file that is not THE Coût export: a near
 * miss of its header (three of its five columns or more), or — when no
 * Coût file was recognized — a .csv the reader cannot open (UTF-16).
 * Inputs: the near misses, the report's inventory, whether a Coût file
 * was recognized. Output: the blocker, null when nothing looks like it.
 * Failure modes: none.
 */
export function coutsGuard(nearMisses: readonly NearMiss[], report: ImportReport, recognized: boolean): ImportBlocker | null {
  const near = nearMisses.filter((n) => n.contractId === COUTS_CONTRACT.id && n.found >= COUTS_LIKE_FOUND);
  const tail = "chargement refusé : le périmètre ne bascule jamais sur l'onglet Projets.";
  if (near.length > 0) {
    const missing = [...new Set(near.flatMap((n) => n.missing))].join(", ");
    return {
      source: "couts", files: near.map((n) => n.file),
      message: `${namesLabel(near.map((n) => n.file))} ${near.length > 1 ? "ressemblent" : "ressemble"} à l'export Coût (COUT PREV) sans être reconnu ` +
        `(colonne(s) manquante(s) : ${missing}) — corriger l'en-tête ou l'encodage, ou retirer le fichier ; ${tail}`,
    };
  }
  const unreadable = recognized ? [] : report.inventory.filter((e) => e.status === "unsupported").map((e) => e.name);
  if (unreadable.length === 0) return null;
  return {
    source: "couts", files: unreadable,
    message: `${namesLabel(unreadable)} ${unreadable.length > 1 ? "n'ont pas pu être lus" : "n'a pas pu être lu"} (encodage UTF-16) — s'il s'agit de l'export Coût, ` +
      `le réenregistrer en CSV UTF-8 ; ${tail}`,
  };
}

// The Coût export, when exactly one came and nothing Coût-like competes.
function readCouts(input: PerimeterInput): { couts: CoutsTable | null; refused: boolean } {
  const candidates = input.byContract.get(COUTS_CONTRACT.id) ?? [];
  const best = elect(candidates, input.blockers);
  const guard = coutsGuard(input.nearMisses, input.report, candidates.length > 0);
  if (guard !== null) input.blockers.push(guard);
  const refused = candidates.length > 1 || guard !== null;
  if (best === null || refused) return { couts: null, refused };
  return { couts: parseCouts(best.dataRows, best.match, input.config, input.report, best.file.name, input.book), refused };
}

/**
 * Reads the perimeter: COUT PREV first (ADR 030); the Projets onglet is
 * read anyway — the perimeter when no Coût-like file came (a douteux says
 * so), the cross-check otherwise, and never the perimeter when the Coût
 * export is refused (ADR 056).
 * Input: the classified candidates, config, PARAM, report, blockers and
 * near misses. Output: the Perimeter. Failure modes: none.
 */
export function readPerimeter(input: PerimeterInput): Perimeter {
  const { report } = input;
  const { couts, refused } = readCouts(input);
  const { perimeter: ongletBest, lender } = electProjets(input.byContract.get(PROJETS_CONTRACT.id) ?? [], input.blockers, report);
  // The onglet asks its doubts only when it is the perimeter (a cross-check decides nothing).
  const book = couts === null && !refused ? input.book : undefined;
  const onglet = ongletBest === null ? null
    : parseProjets(ongletBest.dataRows, ongletBest.match, input.config, input.param, report, ongletBest.file.name, book);
  const check = couts !== null && onglet !== null ? checkPerimeters(couts, onglet) : null;
  if (couts !== null && onglet !== null) {
    warn(report, `périmètre lu dans « ${couts.fileName} » (COUT PREV, ADR 030) — ce fichier ne sert qu'au recoupement`, onglet.fileName);
  }
  if (refused && onglet !== null) {
    warn(report, "non utilisé comme périmètre : l'export Coût est refusé (ADR 056)", onglet.fileName);
  }
  if (couts === null && !refused && onglet !== null) {
    doubt(report, onglet.fileName,
      "périmètre lu dans l'onglet Projets : aucun export Coût (COUT PREV) déposé — chaque ligne devient une carte, " +
        "sans les règles d'exercice, d'état, de type ni de ME (ADR 030) ; déposer le fichier Coût pour le périmètre de l'exercice");
  }
  return { couts, ongletBest, onglet, projets: couts ?? (refused ? null : onglet), check, lender, coutsRefused: refused };
}
