// Reader for the Ress.Profils onglet — the DSI's people (ADR 024): one row
// per person with the Orga domain / sub-domain, the métier, Int/Ext and the
// capacity for the exercise year. Email and Coût are declared ignored by
// the contract and never read. Each person is keyed by its matricule
// candidates (« Id », « pk Contact ») so the plan de charge can join by
// « Matricule » whatever column the PPM used; the opaque person id is
// derived at assembly (capacity.ts), names never enter the event log.

import type { BoardConfig } from "../../core/types.ts";
import { ETP_JH } from "../../core/capacity.ts";
import { normalizeLabel } from "./normalize.ts";
import { createDomainLookup, createProfileLookup, createSubDomainLookups } from "./domains.ts";
import type { Lookup } from "./domains.ts";
import { parseFrenchAmount, parseFrenchBoolean } from "./values.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** One person read from Ress.Profils. */
export interface ProfilEntry {
  /** Normalized matricule candidates (« Id », « pk Contact »), non-empty. */
  keys: string[];
  name: string;
  domainId: string | null;
  subDomainId: string | null;
  profileId: string | null;
  metier: string;
  external: boolean;
  /** j.h for the exercise year; null when the cell is empty or unreadable. */
  capacityJh: number | null;
  ref: RowRef;
}

/** The parsed people registry. */
export interface ProfilsTable {
  entries: ProfilEntry[];
  /** normalized matricule -> entry (every candidate key of every person). */
  byKey: ReadonlyMap<string, ProfilEntry>;
  counts: { persons: number; external: number; withCapacity: number; capacityJh: number; readAsEtp: number };
}

interface ProfilsContext {
  match: HeaderMatch;
  report: ImportReport;
  fileName: string;
  domainLookup: Lookup;
  subLookups: Map<string, Lookup>;
  profileLookup: Lookup;
  entries: ProfilEntry[];
  byKey: Map<string, ProfilEntry>;
  counts: ProfilsTable["counts"];
  unknownDomains: Map<string, Tally>;
  unknownMetiers: Map<string, Tally>;
  capacities: Map<string, number>;
  tallies: Map<string, Tally>;
}

/**
 * Parses the Ress.Profils data rows (header excluded).
 * Inputs: the data rows, the header match, the board config (domains,
 * sub-domains, profiles), the report and the file name.
 * Outputs: the ProfilsTable; side effects: écarté (empty / nameless rows),
 * douteux (unknown domains and métiers, persons without any matricule),
 * aggregated signalements (capacity read as ETP, distinct capacity values).
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseProfils(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig, report: ImportReport, fileName: string,
): ProfilsTable {
  const ctx: ProfilsContext = {
    match, report, fileName,
    domainLookup: createDomainLookup(config), subLookups: createSubDomainLookups(config),
    profileLookup: createProfileLookup(config),
    entries: [], byKey: new Map(),
    counts: { persons: 0, external: 0, withCapacity: 0, capacityJh: 0, readAsEtp: 0 },
    unknownDomains: new Map(), unknownMetiers: new Map(), capacities: new Map(), tallies: new Map(),
  };
  for (const row of rows) readRow(ctx, row);
  finalize(ctx);
  return { entries: ctx.entries, byKey: ctx.byKey, counts: ctx.counts };
}

function cell(ctx: ProfilsContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

function readRow(ctx: ProfilsContext, row: CsvRow): void {
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  if (row.cells.every((c) => c.trim() === "")) {
    discard(ctx.report, ctx.fileName, "ligne vide", { ref });
    return;
  }
  const last = cell(ctx, row, "Nom de famille");
  const first = cell(ctx, row, "Prénom");
  if (last === "" && first === "") {
    discard(ctx.report, ctx.fileName, "personne sans nom", { ref });
    return;
  }
  const keys = [cell(ctx, row, "Id"), cell(ctx, row, "pk Contact")].filter((k) => k !== "").map(normalizeLabel);
  if (keys.length === 0) {
    doubt(ctx.report, ctx.fileName, "personne sans « Id » ni « pk Contact » — injoignable au plan de charge", { ref, value: `${first} ${last}` });
  }
  const entry: ProfilEntry = {
    keys, name: `${first} ${last}`.trim(),
    ...deriveDomain(ctx, row), ...deriveMetier(ctx, row),
    external: parseFrenchBoolean(cell(ctx, row, "Int/Ext")) === true || /^ext/i.test(cell(ctx, row, "Int/Ext")),
    capacityJh: deriveCapacity(ctx, row),
    ref,
  };
  ctx.entries.push(entry);
  ctx.counts.persons++;
  if (entry.external) ctx.counts.external++;
  if (entry.capacityJh !== null) {
    ctx.counts.withCapacity++;
    ctx.counts.capacityJh = Math.round((ctx.counts.capacityJh + entry.capacityJh) * 100) / 100;
  }
  for (const key of keys) {
    if (ctx.byKey.has(key)) doubt(ctx.report, ctx.fileName, `matricule « ${key} » porté par deux personnes — première conservée`, { ref });
    else ctx.byKey.set(key, entry);
  }
}

function deriveDomain(ctx: ProfilsContext, row: CsvRow): Pick<ProfilEntry, "domainId" | "subDomainId"> {
  const label = cell(ctx, row, "Domaine (Orga)");
  const domainId = label === "" ? null : (ctx.domainLookup(label)?.id ?? null);
  if (label !== "" && domainId === null) tallyInto(ctx.unknownDomains, label, row.line);
  const sub = cell(ctx, row, "Sous-domaine (Orga)");
  const lookup = domainId === null ? undefined : ctx.subLookups.get(domainId);
  const subDomainId = lookup === undefined || sub === "" ? null : (lookup(sub)?.id ?? null);
  return { domainId, subDomainId };
}

function deriveMetier(ctx: ProfilsContext, row: CsvRow): Pick<ProfilEntry, "profileId" | "metier"> {
  const metier = cell(ctx, row, "Métier");
  if (metier === "") {
    tallyInto(ctx.tallies, "« Métier » vide", row.line);
    return { profileId: null, metier };
  }
  const hit = ctx.profileLookup(metier);
  if (hit === null) tallyInto(ctx.unknownMetiers, metier, row.line);
  return { profileId: hit?.id ?? null, metier };
}

// « Disponibilité »: 0 means no declared capacity (August export: 56 such
// persons — not counted, said in the report); a value up to 5 is read as
// ETP and scaled by 200 j.h; anything above is taken as j.h for the year.
function deriveCapacity(ctx: ProfilsContext, row: CsvRow): number | null {
  const raw = cell(ctx, row, "Disponibilité");
  const parsed = parseFrenchAmount(raw);
  if (parsed.kind === "empty") {
    tallyInto(ctx.tallies, "« Disponibilité » vide — capacité inconnue", row.line);
    return null;
  }
  if (parsed.kind === "invalid") {
    tallyInto(ctx.tallies, "« Disponibilité » illisible — capacité inconnue", row.line);
    return null;
  }
  ctx.capacities.set(raw, (ctx.capacities.get(raw) ?? 0) + 1);
  if (parsed.value === 0) {
    tallyInto(ctx.tallies, "« Disponibilité » à 0 — capacité non déclarée (non comptée)", row.line);
    return null;
  }
  if (parsed.value <= 5) {
    ctx.counts.readAsEtp++;
    return Math.round(parsed.value * ETP_JH * 100) / 100;
  }
  return parsed.value;
}

function finalize(ctx: ProfilsContext): void {
  for (const [message, t] of ctx.tallies) warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  for (const [label, t] of ctx.unknownDomains) {
    doubt(ctx.report, ctx.fileName, `« Domaine (Orga) » inconnu du board : « ${label} » (${tallyLabel(t)}) — personne sans domaine`);
  }
  for (const [label, t] of ctx.unknownMetiers) {
    doubt(ctx.report, ctx.fileName, `métier inconnu « ${label} » (${tallyLabel(t)}) — à rapprocher d'un profil DSI ?`);
  }
  if (ctx.counts.readAsEtp > 0) {
    warn(ctx.report, `« Disponibilité » ≤ 5 lue comme des ETP × ${ETP_JH} j.h : ${ctx.counts.readAsEtp} personne(s) — unité à confirmer`, ctx.fileName);
  }
  const seen = [...ctx.capacities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([value, count]) => `« ${value} » (${count})`).join(" ; ");
  if (seen !== "") warn(ctx.report, `« Disponibilité » — valeurs les plus fréquentes : ${seen}`, ctx.fileName);
}
