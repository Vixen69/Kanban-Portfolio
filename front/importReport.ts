// The words of the readable import screen (ADR 055): the title of the
// report before and after the load, the key numbers, one chip per expected
// file (« ✓ Coût », « ProjetsCdP absent → chefs de projet gardés »), and
// the instantané the last load of an exercise was taken from (« Voir ce
// qui a changé depuis le dernier import »). Also the lines that say what
// the key numbers do not: the hand corrections replaced (ADR 060), the
// identity doubts (ADR 058/059), the refusal that forbids the load (ADR
// 056) and the outcomes of a load. Pure; no React.

import type { BoardConfig } from "../core/types.ts";
import type {
  ImportAdopted, ImportAdvanced, ImportChangeCounts, ImportChanges, ImportFileEntry, ImportLoadResult, ImportSource,
} from "../core/import-types.ts";
import type { SnapshotSummary } from "../core/snapshot.ts";
import { changeWords } from "./changeGroups.ts";

/**
 * The report's title: what the load WILL change (audit) or HAS changed.
 * Input: whether the load ran. Output: the French title. Failure: none.
 */
export function reportTitle(loaded: boolean): string {
  return loaded ? "Ce que le chargement a changé" : "Ce que le chargement va changer";
}

/** One key number of the strip; hint: its tooltip, when the label needs one. */
export interface KeyNumber {
  value: number;
  label: string;
  hint?: string;
}

/** The tooltip of « projets relus »: re-read, not necessarily changed. */
export const UPDATED_HINT =
  "Relus dans les fichiers, pas forcément modifiés : ce qui change vraiment est compté dans « projets modifiés ».";

/**
 * The key numbers, in the mockup's order: projets relus, nouveaux,
 * absents de l'import (∅), projets modifiés, projets aux valeurs gardées
 * (absentes des fichiers) — the last two count PROJECTS, their values are
 * listed below. Input: the counts. Output: the five numbers. Failure: none.
 */
export function keyNumbers(counts: ImportChangeCounts): KeyNumber[] {
  return [
    { value: counts.updated, label: "projets relus", hint: UPDATED_HINT },
    { value: counts.created, label: "nouveaux" },
    { value: counts.absent, label: "absents de l’import (∅)" },
    { value: counts.valuesChanged, label: "projets modifiés" },
    { value: counts.valuesKept, label: "projets aux valeurs gardées (absentes des fichiers)" },
  ];
}

/**
 * The secondary counts worth a line when not zero: de retour, déplacés
 * (and among them the hand placements a new jalon overtook, ADR 060),
 * divergences left in place (ADR 026), hand-made cards adopted (ADR 059),
 * deleted cards skipped (ADR 058). Input: the report's counts and lists.
 * Output: the French phrases, empty when all are zero. Failure: none.
 */
export function minorCounts(changes: Pick<ImportChanges, "counts" | "adopted" | "deletedSkipped">): string[] {
  const { counts } = changes;
  const advanced = counts.advanced ?? 0;
  const overtaken = advanced > 0 ? ` dont ${advanced} placé(s) à la main, dépassé(s) par un nouveau jalon` : "";
  const out: string[] = [];
  if (counts.back > 0) out.push(`${counts.back} de retour`);
  if (counts.moved > 0) out.push(`${counts.moved} déplacé(s)${overtaken}`);
  if (counts.divergences > 0) out.push(`${counts.divergences} divergence(s) laissée(s) en place (placées à la main ou en pause)`);
  if (changes.adopted.length > 0) out.push(`${changes.adopted.length} carte(s) saisie(s) à la main adoptée(s)`);
  if (changes.deletedSkipped.length > 0) out.push(`${changes.deletedSkipped.length} supprimée(s) du tableau, ignorée(s)`);
  return out;
}

/**
 * The lines that must not hide among the minor counts: the hand
 * corrections the export's NEW value replaces — the only thing a load
 * overwrites (ADR 060) — and the identity doubts (ADR 058/059).
 * Inputs: the report's counts and doubts, whether the load ran (tense).
 * Output: the French lines, empty when neither. Failure: none.
 */
export function warnLines(changes: Pick<ImportChanges, "counts" | "identityDoubts">, loaded: boolean): string[] {
  const out: string[] = [];
  const replaced = changes.counts.replaced ?? 0;
  if (replaced > 0) {
    const verb = loaded ? "a été remplacée" : "sera remplacée";
    out.push(`${replaced} projet(s) : une correction faite à la main ${verb} par la nouvelle valeur de l’export — voir la liste.`);
  }
  const doubts = changes.identityDoubts.length;
  if (doubts > 0) out.push(`${doubts} doute(s) d’identité à vérifier — voir la liste.`);
  return out;
}

/**
 * Why nothing can be loaded: the refusals themselves (ADR 056) when there
 * are any, else the missing perimeter. Input: the report's changes
 * (reports made before the field carry no blockers). Output: the French
 * line. Failure: none.
 */
export function unloadableLine(changes: Pick<ImportChanges, "blockers">): string {
  const blockers = changes.blockers ?? [];
  if (blockers.length > 0) return `Chargement refusé, rien ne serait écrit : ${blockers.join(" ")}`;
  return "Périmètre non assemblé : le chargement est impossible, rien ne serait écrit.";
}

/**
 * The perimeter line when no perimeter was read: the perimeter export was
 * refused (two competing COUT PREV or Projets files, ADR 056), or no
 * perimeter file came. Input: the report's file entries. Output: the
 * French line. Failure: none.
 */
export function noPerimeterLine(files: readonly ImportFileEntry[]): string {
  const refused = files.find((entry) => (entry.source === "couts" || entry.source === "projets") &&
    (entry.consequence ?? "").startsWith("chargement refusé"));
  if (refused !== undefined) return `Périmètre non lu : l’export ${SHORT[refused.source]} est refusé (voir ci-dessus).`;
  return "Aucun fichier de périmètre : rien ne peut être chargé.";
}

/**
 * The reason shown for an adopted hand-made card (ADR 059): the title it
 * was typed under, when it differs from the export's. Input: the entry.
 * Output: the French reason. Failure: none.
 */
export function adoptedReason(entry: ImportAdopted): string {
  return entry.manualTitle === entry.title ? "saisie à la main, même nom" : `saisie à la main sous « ${entry.manualTitle} »`;
}

/**
 * The reason shown for a hand placement a new jalon overtook (ADR 060):
 * « from → to » in the config's column names. Inputs: the config, the
 * entry. Output: the French reason. Failure: none — an id the config no
 * longer declares shows as is.
 */
export function advancedReason(config: BoardConfig, entry: ImportAdvanced): string {
  return `${changeWords(config, "moved", entry.fromColumn)} → ${changeWords(config, "moved", entry.toColumn)}`;
}

/**
 * What a load wrote beyond the summary's fixed phrases (ADR 058/059/060),
 * and the doubts' choices it traced (ADR 062), the non-zero ones only. Input: the load's counts. Output: the French
 * phrases. Failure: none.
 */
export function loadOutcomes(load: ImportLoadResult["load"]): string[] {
  const out: string[] = [];
  if (load.replaced > 0) out.push(`${load.replaced} correction(s) manuelle(s) remplacée(s) par l’export`);
  if (load.advanced > 0) out.push(`${load.advanced} placement(s) à la main dépassé(s) par un nouveau jalon`);
  if ((load.paused ?? 0) > 0) out.push(`${load.paused ?? 0} en pause, nouveau jalon non appliqué`);
  if (load.adopted > 0) out.push(`${load.adopted} carte(s) saisie(s) à la main adoptée(s)`);
  if (load.deletedSkipped > 0) out.push(`${load.deletedSkipped} supprimée(s) du tableau, ignorée(s)`);
  if ((load.settled ?? 0) > 0) out.push(`${load.settled ?? 0} choix de doute tracé(s) dans le journal`);
  return out;
}

/** The files' short names, as the PMO calls the tabs of the workbook. */
const SHORT: Record<ImportSource, string> = {
  couts: "Coût", param: "PARAM", projets: "Projets", cdp: "ProjetsCdP", jalons: "ProjetsJalons",
  sp: "SP", pdc: "Ressources_PdC", profils: "Ress.Profils",
};

/** How a chip reads: taken, missing but optional, missing with a consequence. */
export type ChipTone = "ok" | "muted" | "warn";

/** One file chip: its tone, its text, its full detail (tooltip and folded list). */
export interface FileChip {
  source: ImportSource;
  tone: ChipTone;
  text: string;
  detail: string;
}

/**
 * The chip of one expected source: « ✓ Coût » when a file was taken;
 * otherwise its status and what the load does without it (« ProjetsCdP
 * absent → chefs de projet gardés », « SP douteux → budgets gardés… ») in
 * the warning tone — muted, « Ress.Profils absent (facultatif) », when the
 * source is optional. The file that looked like it stays in the detail,
 * which carries the long label, the file taken, the whole consequence and
 * the files not read (tooltip and folded list).
 * Input: the file entry. Output: the chip. Failure: none.
 */
export function fileChip(entry: ImportFileEntry): FileChip {
  const short = SHORT[entry.source];
  const others = entry.others.length === 0 ? "" : ` (non lu${entry.others.length > 1 ? "s" : ""} : ${entry.others.join(", ")})`;
  const detail = `${entry.label}${entry.file === null ? "" : ` ← ${entry.file}`}` +
    `${entry.consequence === null ? "" : ` — ${entry.consequence}`}${others}`;
  if (entry.status === "pris") return { source: entry.source, tone: "ok", text: `✓ ${short}`, detail };
  // What the load does instead; the near-miss or old-format file (« — « x.csv » … ») stays in the detail.
  const consequence = (entry.consequence ?? "").split(" — « ")[0] ?? "";
  if (consequence.startsWith("facultatif")) {
    return { source: entry.source, tone: "muted", text: `${short} ${entry.status} (facultatif)`, detail };
  }
  const text = `${short} ${entry.status}${consequence === "" ? "" : ` → ${consequence}`}`;
  return { source: entry.source, tone: "warn", text, detail };
}

/** A list of the report (projects entering, leaving, kept facts) unfolds by itself up to this many rows. */
export const LIST_OPEN_MAX = 10;

/**
 * Whether a list of the report starts unfolded: a short list is read at
 * once, a long one stays folded behind its count. Input: the row count.
 * Output: true when open. Failure: none.
 */
export function listOpen(rows: number): boolean {
  return rows > 0 && rows <= LIST_OPEN_MAX;
}

/**
 * The note when no load of the exercise left an instantané to compare
 * with (a load run from the command line may not take one). Input: the
 * year. Output: the French note. Failure: none.
 */
export function noImportSnapshotNote(year: number): string {
  return `Aucun instantané « ${importSnapshotLabel(year)} » : aucun chargement de l’exercice ${year} n’en a laissé à comparer.`;
}

/** The label the middle gives the instantané it takes before a load (middle/app.ts). */
export function importSnapshotLabel(year: number): string {
  return `avant chargement ${year}`;
}

/**
 * The instantané taken before the last load of an exercise: the newest
 * snapshot labelled « avant chargement <year> ».
 * Inputs: the snapshots (any order), the year. Output: the summary, null
 * when that exercise was never loaded from the tool. Failure: none.
 */
export function lastImportSnapshot(list: readonly SnapshotSummary[], year: number): SnapshotSummary | null {
  const label = importSnapshotLabel(year);
  let found: SnapshotSummary | null = null;
  for (const entry of list) {
    if (entry.label === label && (found === null || entry.ts > found.ts)) found = entry;
  }
  return found;
}
