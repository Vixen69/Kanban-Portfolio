// Which file serves each contract when several match — recognition is by
// header, never by name, so two exports can compete for one contract. The
// generic rule is the cleanest header. The perimeter has its own rule since
// the September audit elected a 1 357-row full export over the PMO's
// 138-row Projets onglet: the PMO's Projets never carries the Responsable
// columns, and the export that does is the ProjetsCdP source (author,
// 2026-09-09). Pure functions over the classified candidates.

import type { HeaderMatch } from "./contract.ts";
import type { CsvRow } from "./csv.ts";
import type { InputFile } from "./identify.ts";
import { doubt, warn } from "./report.ts";
import type { ImportReport } from "./report.ts";

/** A recognized file competing for its contract. */
export interface Candidate {
  file: InputFile;
  match: HeaderMatch;
  /** The raw header row (PARAM locates its side-by-side tables in it). */
  headerCells: string[];
  dataRows: CsvRow[];
}

/** The column that tells a ProjetsCdP export from the PMO's Projets onglet. */
const RESPONSABLE = "Responsable 1";
/** The column the consolidated onglet carries and a raw export does not. */
const ORGA = "Domaine (Orga)";

/**
 * Elects one file for a contract: the cleanest header wins (fewest
 * deviations, then first name — the candidates arrive in name order); the
 * others are flagged douteux, never silently parsed.
 * Inputs: the candidates of one contract, the report.
 * Output: the elected candidate, null when there is none.
 * Failure modes: none.
 */
export function elect(candidates: Candidate[], report: ImportReport): Candidate | null {
  const best = candidates.reduce<Candidate | null>(
    (acc, c) => (acc === null || c.match.deviations.length < acc.match.deviations.length ? c : acc),
    null,
  );
  if (best === null) return null;
  for (const c of candidates) {
    if (c === best) continue;
    doubt(
      report, c.file.name,
      `correspond aussi au contrat ${best.match.contract.displayName} ` +
        `(${c.match.deviations.length} écart(s) d'en-têtes, contre ` +
        `${best.match.deviations.length} pour « ${best.file.name} ») — non retenu`,
    );
  }
  return best;
}

interface PerimeterRank {
  responsable: number;
  orga: number;
  deviations: number;
  name: string;
}

// Lowest wins: no Responsable columns first (the PMO's Projets onglet never
// carries them), then the consolidated Orga columns, then the fewest header
// deviations, then the name.
function perimeterRank(c: Candidate): PerimeterRank {
  return {
    responsable: c.match.columnIndex.has(RESPONSABLE) ? 1 : 0,
    orga: c.match.columnIndex.has(ORGA) ? 0 : 1,
    deviations: c.match.deviations.length,
    name: c.file.name,
  };
}

function compareRanks(a: PerimeterRank, b: PerimeterRank): number {
  return (a.responsable - b.responsable) || (a.orga - b.orga) || (a.deviations - b.deviations) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/**
 * Elects the perimeter among the Projets-shaped files (author, 2026-09-09):
 * the one WITHOUT « Responsable 1 » — the PMO's Projets onglet never
 * carries the Responsable columns; a full export that does is the
 * ProjetsCdP source, not the perimeter (September: 1 357 rows against
 * 138). Ties: the consolidated Orga columns, then the cleanest header,
 * then the first name. Every other candidate is flagged douteux with the
 * reason and the elected file's name.
 * Inputs: the Projets candidates, the report.
 * Output: the perimeter candidate, null when there is none.
 * Failure modes: none.
 */
export function electPerimeter(candidates: Candidate[], report: ImportReport): Candidate | null {
  const ranked = [...candidates].sort((a, b) => compareRanks(perimeterRank(a), perimeterRank(b)));
  const best = ranked[0];
  if (best === undefined) return null;
  for (const c of ranked.slice(1)) {
    const why = c.match.columnIndex.has(RESPONSABLE) && !best.match.columnIndex.has(RESPONSABLE)
      ? `il porte « ${RESPONSABLE} » (export ProjetsCdP, chefs de projet)`
      : `${c.match.deviations.length} écart(s) d'en-têtes, contre ${best.match.deviations.length}`;
    doubt(report, c.file.name,
      `correspond aussi au contrat Projets — non retenu comme périmètre : ${why} ; périmètre = « ${best.file.name} »`);
  }
  return best;
}

/**
 * A second Projets-shaped file carrying the Responsable columns feeds the
 * chefs de projet when no dedicated ProjetsCdP file came: the elected
 * perimeter stays, the other one only lends its owners (signaled).
 * Inputs: the Projets candidates, the elected perimeter, the report.
 * Output: the candidate to read as ProjetsCdP, null when there is none.
 * Failure modes: none.
 */
export function secondProjets(candidates: Candidate[], elected: Candidate | null, report: ImportReport): Candidate | null {
  const other = candidates.find((c) => c !== elected && c.match.columnIndex.has(RESPONSABLE));
  if (other === undefined) return null;
  warn(report, "second fichier Projets — lu comme ProjetsCdP (chefs de projet), non retenu comme périmètre", other.file.name);
  return other;
}
