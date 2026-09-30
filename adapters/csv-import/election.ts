// Which file serves each contract — recognition is by header, never by
// name, so two exports can match one contract. Since ADR 056 (author,
// 2026-09-30: « un seul mode d'import ») there is no election any more:
// ONE file per kind, and two of a kind refuse the load, both named, so the
// PMO removes one (the file name used to decide — « Cout (1).csv » beat
// « Cout.csv », a dated name elected the OLDEST export). The Projets
// contract keeps its structural pair (author, 2026-09-09): the PMO's
// onglet never carries the Responsable columns — it is the perimeter —
// and a full export that does lends the chefs de projet. Two of either
// shape still refuse. Pure functions over the classified candidates.

import type { ImportSource } from "../../core/import-types.ts";
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

/** Why the files received cannot be loaded (ADR 056), in plain French. */
export interface ImportBlocker {
  /** The expected source it concerns; null for the drop as a whole (same name twice). */
  source: ImportSource | null;
  /** The sentence the PMO reads (« Deux fichiers Coût : « A » et « B » — n'en déposer qu'un. »). */
  message: string;
  /** The received files named. */
  files: string[];
}

/** The column that tells a ProjetsCdP export from the PMO's Projets onglet. */
const RESPONSABLE = "Responsable 1";

/** Each contract's source and its short name in a refusal. */
const KINDS: Readonly<Record<string, { source: ImportSource; label: string }>> = {
  couts: { source: "couts", label: "Coût" },
  param: { source: "param", label: "PARAM" },
  sp: { source: "sp", label: "SP" },
  projets_jalons: { source: "jalons", label: "ProjetsJalons" },
  projets: { source: "projets", label: "Projets" },
  projets_cdp: { source: "cdp", label: "ProjetsCdP" },
  ress_profils: { source: "profils", label: "Ress.Profils" },
  ressources_pdc: { source: "pdc", label: "Ressources_PdC" },
};

const COUNT_WORDS = ["", "Un", "Deux", "Trois", "Quatre", "Cinq"];

/**
 * The names of several files in the PMO's words (« « A » et « B » »,
 * « « A », « B » et « C » »), in code-unit order so the sentence never
 * depends on the drop order.
 * Input: the names. Output: the text. Failure: none.
 */
export function namesLabel(names: readonly string[]): string {
  const quoted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((n) => `« ${n} »`);
  const last = quoted.pop();
  return quoted.length === 0 ? (last ?? "") : `${quoted.join(", ")} et ${last ?? ""}`;
}

/**
 * The refusal for several files of one kind.
 * Inputs: the kind's short name, the files' names. Output: the blocker
 * sentence (« Deux fichiers Coût : « A » et « B » — n'en déposer qu'un. »).
 * Failure modes: none.
 */
export function competingMessage(label: string, names: readonly string[]): string {
  const count = COUNT_WORDS[names.length] ?? String(names.length);
  return `${count} fichiers ${label} : ${namesLabel(names)} — n'en déposer qu'un.`;
}

function refuse(blockers: ImportBlocker[], source: ImportSource | null, label: string, candidates: readonly Candidate[]): void {
  const files = candidates.map((c) => c.file.name);
  blockers.push({ source, message: competingMessage(label, files), files });
}

/**
 * The one file of a contract: none -> null; one -> it; several -> null and
 * a blocker naming them all (ADR 056: never an election by name).
 * Inputs: the candidates of one contract, the blockers to feed.
 * Output: the candidate to read, null when there is none or several.
 * Failure modes: none.
 */
export function elect(candidates: readonly Candidate[], blockers: ImportBlocker[]): Candidate | null {
  const first = candidates[0];
  if (first === undefined) return null;
  if (candidates.length === 1) return first;
  const kind = KINDS[first.match.contract.id];
  refuse(blockers, kind?.source ?? null, kind?.label ?? first.match.contract.displayName, candidates);
  return null;
}

/** The Projets-shaped files, by role (author, 2026-09-09). */
export interface ProjetsElection {
  /** The perimeter candidate: the onglet without Responsable columns, else a lone full export. */
  perimeter: Candidate | null;
  /** The full export carrying « Responsable 1 » when the onglet is the perimeter: it lends the chefs de projet. */
  lender: Candidate | null;
}

/**
 * Splits the Projets-shaped files by role: the one WITHOUT « Responsable
 * 1 » is the perimeter (the PMO's onglet never carries the Responsable
 * columns — September: a 1 357-row full export against 138 rows); a full
 * export that does lends the chefs de projet, and is the perimeter only
 * when it came alone. Two files of one shape refuse the load (ADR 056).
 * Inputs: the Projets candidates, the blockers, the report.
 * Output: the perimeter candidate and the lender. Failure modes: none.
 */
export function electProjets(candidates: readonly Candidate[], blockers: ImportBlocker[], report: ImportReport): ProjetsElection {
  const onglets = candidates.filter((c) => !c.match.columnIndex.has(RESPONSABLE));
  const exports = candidates.filter((c) => c.match.columnIndex.has(RESPONSABLE));
  if (onglets.length > 1) refuse(blockers, "projets", "Projets (onglet sans « Responsable 1 »)", onglets);
  if (exports.length > 1) refuse(blockers, "cdp", "Projets avec « Responsable 1 »", exports);
  const onglet = onglets.length === 1 ? (onglets[0] ?? null) : null;
  const full = exports.length === 1 ? (exports[0] ?? null) : null;
  if (onglets.length > 1) return { perimeter: null, lender: full };
  if (onglet === null) return { perimeter: full, lender: null };
  if (full !== null) {
    doubt(report, full.file.name,
      `correspond aussi au contrat Projets — non retenu comme périmètre : il porte « ${RESPONSABLE} » ` +
        `(export ProjetsCdP, chefs de projet) ; périmètre = « ${onglet.file.name} »`);
  }
  return { perimeter: onglet, lender: full };
}

/**
 * The full export lends its chefs de projet when no dedicated ProjetsCdP
 * file came: the perimeter stays the onglet (signaled).
 * Inputs: the lender (electProjets), the report.
 * Output: the candidate to read as ProjetsCdP, null when there is none.
 * Failure modes: none.
 */
export function secondProjets(lender: Candidate | null, report: ImportReport): Candidate | null {
  if (lender === null) return null;
  warn(report, "second fichier Projets — lu comme ProjetsCdP (chefs de projet), non retenu comme périmètre", lender.file.name);
  return lender;
}

/**
 * The same file name received twice (from two folders — the path is
 * stripped): which one is fresher cannot be told, so the load is refused.
 * Input: the received files. Output: one blocker per repeated name, in
 * name order. Failure modes: none.
 */
export function sameNameBlockers(files: readonly InputFile[]): ImportBlocker[] {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(file.name, (counts.get(file.name) ?? 0) + 1);
  return [...counts].filter(([, n]) => n > 1).map(([name]) => name).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => ({
      source: null, files: [name],
      message: `${COUNT_WORDS[counts.get(name) ?? 0] ?? counts.get(name)} fichiers portent le même nom « ${name} » — n'en déposer qu'un.`,
    }));
}
