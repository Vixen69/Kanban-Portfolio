// The words of the readable import screen (ADR 055): the title of the
// report before and after the load, the key numbers, one chip per expected
// file (« ✓ Coût », « ProjetsCdP absent → chefs de projet gardés »), and
// the instantané the last load of an exercise was taken from (« Voir ce
// qui a changé depuis le dernier import »). Pure; no React.

import type { ImportChangeCounts, ImportFileEntry, ImportSource } from "../core/import-types.ts";
import type { SnapshotSummary } from "../core/snapshot.ts";

/**
 * The report's title: what the load WILL change (audit) or HAS changed.
 * Input: whether the load ran. Output: the French title. Failure: none.
 */
export function reportTitle(loaded: boolean): string {
  return loaded ? "Ce que le chargement a changé" : "Ce que le chargement va changer";
}

/** One key number of the strip. */
export interface KeyNumber {
  value: number;
  label: string;
}

/**
 * The key numbers, in the mockup's order: projets mis à jour, nouveaux,
 * absents de l'import (∅), valeurs changées, gardées (absentes des
 * fichiers). Input: the counts. Output: the five numbers. Failure: none.
 */
export function keyNumbers(counts: ImportChangeCounts): KeyNumber[] {
  return [
    { value: counts.updated, label: "projets mis à jour" },
    { value: counts.created, label: "nouveaux" },
    { value: counts.absent, label: "absents de l’import (∅)" },
    { value: counts.valuesChanged, label: "valeurs changées" },
    { value: counts.valuesKept, label: "gardées (absentes des fichiers)" },
  ];
}

/**
 * The secondary counts worth a line when not zero: de retour, déplacés,
 * divergences left in place (ADR 026). Input: the counts. Output: the
 * French phrases, empty when all are zero. Failure: none.
 */
export function minorCounts(counts: ImportChangeCounts): string[] {
  const out: string[] = [];
  if (counts.back > 0) out.push(`${counts.back} de retour`);
  if (counts.moved > 0) out.push(`${counts.moved} déplacé(s)`);
  if (counts.divergences > 0) out.push(`${counts.divergences} divergence(s) laissée(s) en place (placées à la main)`);
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
