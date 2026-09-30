// The day a milestone date without statut is compared with (ADR 058,
// idempotence): the EXPORT's own date — the latest « Date d'export » /
// « Date export » cell of the received files — so the same files give the
// same columns whatever the day they are loaded; only when no file carries
// one, the load day. Either way a calendar day in Europe/Paris, never the
// server's time zone (the container runs in UTC, a CLI on the VM in
// Paris). Pure.

import { normalizeLabel } from "./normalize.ts";
import { parseFrenchDate } from "./values.ts";
import type { CsvRow } from "./csv.ts";

/** The reference day and where it comes from, in the report's words. */
export interface ReferenceDay {
  /** aaaa-mm-jj */
  iso: string;
  /** « date d'export de « Cout.csv » » or « jour du chargement (Europe/Paris) ». */
  source: string;
}

/** A received file as the reference day reads it: its name, header and rows. */
export interface ExportDateSource {
  name: string;
  headerCells: readonly string[];
  dataRows: readonly CsvRow[];
}

const EXPORT_DATE_LABELS: ReadonlySet<string> = new Set([normalizeLabel("Date d'export"), normalizeLabel("Date export")]);

/**
 * The calendar day of an instant in Europe/Paris (aaaa-mm-jj), whatever
 * the host's time zone.
 * Input: the instant. Output: the ISO day. Failure modes: none (Node
 * ships the full ICU time zone data).
 */
export function parisDay(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// The latest export date one file carries, or null.
function exportDateOf(source: ExportDateSource): string | null {
  const index = source.headerCells.findIndex((cell) => EXPORT_DATE_LABELS.has(normalizeLabel(cell)));
  if (index < 0) return null;
  let latest: string | null = null;
  for (const row of source.dataRows) {
    const date = parseFrenchDate(row.cells[index] ?? "");
    if (date.kind === "date" && (latest === null || date.iso > latest)) latest = date.iso;
  }
  return latest;
}

/**
 * The reference day of an audit from the recognized files by contract
 * (the audit's classification): every candidate of every contract.
 * Inputs: the candidates by contract id, the load instant.
 * Output: the ReferenceDay. Failure modes: none.
 */
export function referenceDayOf(
  byContract: ReadonlyMap<string, ReadonlyArray<{ file: { name: string }; headerCells: readonly string[]; dataRows: readonly CsvRow[] }>>,
  now: Date,
): ReferenceDay {
  const sources = [...byContract.values()].flat().map((c) => ({ name: c.file.name, headerCells: c.headerCells, dataRows: c.dataRows }));
  return referenceDay(sources, now);
}

/**
 * The reference day of an audit: the latest export date the files carry,
 * else the load day in Europe/Paris.
 * Inputs: the recognized files (any order), the load instant.
 * Output: the ReferenceDay. Failure modes: none — unreadable dates are
 * ignored.
 */
export function referenceDay(sources: readonly ExportDateSource[], now: Date): ReferenceDay {
  let best: { iso: string; name: string } | null = null;
  for (const source of sources) {
    const iso = exportDateOf(source);
    if (iso !== null && (best === null || iso > best.iso || (iso === best.iso && source.name < best.name))) best = { iso, name: source.name };
  }
  if (best === null) return { iso: parisDay(now), source: "jour du chargement (Europe/Paris) — aucun fichier ne porte de date d’export" };
  return { iso: best.iso, source: `date d’export de « ${best.name} »` };
}
