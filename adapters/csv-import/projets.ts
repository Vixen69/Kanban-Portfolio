// Reader for the Projets sheet — THE perimeter (R2): every kept row is a
// card, the PMO guarantees the list. Identity = « Id »; type = « Type »
// against the four retained types (suffix ignored, unknowns signaled but
// never excluded, R3); domain + sub-domain from the Orga columns when the
// file carries them, else translated from the organisation path through
// PARAM (R4); chef de projet = first Responsable that is not a domain
// lead (R6); dates, RDLI and efforts (Q22/Q23 status quo, said out loud).

import type { BoardConfig } from "../../core/types.ts";
import { normalizeLabel } from "./normalize.ts";
import { splitSubjectName } from "./subject-name.ts";
import { createDomainLookup, createSubDomainLookups, createTypeLookup, isDomainLead } from "./domains.ts";
import type { Lookup } from "./domains.ts";
import { amountCell, dateCell, moneyCell } from "./cells.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import type { ParamTable } from "./param.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";

/** How the file carries the domain: resolved Orga columns, an organisation
 * path to translate through PARAM, or nothing. */
export type DomainShape = "orga" | "path" | "none";

/** One retained project (a future card). */
export interface ProjetEntry {
  /** « Id » as written (the stable identity); "" when the cell is empty. */
  id: string;
  name: string;
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
  owner: string | null;
  budgetRdli: number | null;
  effortEstimated: number | null;
  effortConsumed: number | null;
  ref: RowRef;
}

/** The parsed perimeter. */
export interface ProjetsTable {
  /** The elected file's name — the assembly line names the perimeter's source. */
  fileName: string;
  entries: ProjetEntry[];
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

interface ProjetsContext {
  match: HeaderMatch;
  report: ImportReport;
  fileName: string;
  param: ParamTable | null;
  shape: DomainShape;
  domainLookup: Lookup;
  subLookups: Map<string, Lookup>;
  typeLookup: Lookup;
  entries: ProjetEntry[];
  byId: Map<string, ProjetEntry>;
  byName: Map<string, ProjetEntry>;
  typeCounts: Map<string, number>;
  counts: ProjetsCounts;
  unknownTypes: Map<string, Tally>;
  unknownDomains: Map<string, Tally>;
  unknownSubs: Map<string, Tally>;
  unknownPaths: Map<string, Tally>;
  states: Map<string, number>;
  tallies: Map<string, Tally>;
}

/**
 * Parses the Projets data rows (header excluded): every kept row is a card.
 * Inputs: the data rows, the header match, the board config, the PARAM
 * table (null tolerated: no lead exclusion, no path translation — said in
 * the report), the report and the file name.
 * Outputs: the ProjetsTable; side effects: écarté (empty / total rows),
 * douteux (duplicate ids, unknown types / domains / sub-domains / paths),
 * aggregated signalements, the « État du processus » survey.
 * Failure modes: none — every anomaly is reported, nothing throws.
 */
export function parseProjets(
  rows: CsvRow[], match: HeaderMatch, config: BoardConfig, param: ParamTable | null,
  report: ImportReport, fileName: string,
): ProjetsTable {
  const ctx: ProjetsContext = {
    match, report, fileName, param, shape: detectShape(match, param, report, fileName),
    domainLookup: createDomainLookup(config), subLookups: createSubDomainLookups(config),
    typeLookup: createTypeLookup(config),
    entries: [], byId: new Map(), byName: new Map(), typeCounts: new Map(),
    counts: { domainDirect: 0, domainViaParam: 0, domainMissing: 0, subDetailed: 0, subFolded: 0, withOwner: 0, leadsExcluded: 0 },
    unknownTypes: new Map(), unknownDomains: new Map(), unknownSubs: new Map(),
    unknownPaths: new Map(), states: new Map(), tallies: new Map(),
  };
  if (param === null) warn(report, "PARAM absent — responsables de domaine non exclus du chef de projet", fileName);
  for (const row of rows) readRow(ctx, row);
  finalize(ctx);
  return {
    fileName, entries: ctx.entries, byId: ctx.byId, byName: ctx.byName, shape: ctx.shape,
    typeCounts: ctx.typeCounts, counts: ctx.counts,
  };
}

function detectShape(match: HeaderMatch, param: ParamTable | null, report: ImportReport, fileName: string): DomainShape {
  if (match.columnIndex.has("Domaine (Orga)")) return "orga";
  if (match.columnIndex.has("Domaine")) {
    if (param === null) warn(report, "export brut sans PARAM — chemins d'organisation non traduits, domaines manquants", fileName);
    return "path";
  }
  warn(report, "ni « Domaine (Orga) » ni « Domaine » — aucune carte n'aura de domaine", fileName);
  return "none";
}

function cell(ctx: ProjetsContext, row: CsvRow, column: string): string {
  const index = ctx.match.columnIndex.get(column);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

// Structural gates (empty, nameless, total rows, duplicate ids), then the
// entry build. A duplicate name with another id is kept — but questioned.
function readRow(ctx: ProjetsContext, row: CsvRow): void {
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  if (row.cells.every((c) => c.trim() === "")) {
    discard(ctx.report, ctx.fileName, "ligne vide", { ref });
    return;
  }
  const nom = cell(ctx, row, "Nom");
  if (nom === "") {
    discard(ctx.report, ctx.fileName, "nom vide", { ref });
    return;
  }
  const normalizedName = normalizeLabel(nom);
  if (/^(sous[\s-])?total\b/.test(normalizedName)) {
    discard(ctx.report, ctx.fileName, "ligne de total/sous-total — exclue (risque de double compte)", { ref, value: nom });
    return;
  }
  const id = cell(ctx, row, "Id");
  if (id === "") tallyInto(ctx.tallies, "« Id » vide — identité dérivée du nom", row.line);
  const sameId = id === "" ? undefined : ctx.byId.get(id);
  if (sameId !== undefined) {
    doubt(ctx.report, ctx.fileName,
      `Id « ${id}» porté par « ${sameId.name} » (ligne ${sameId.ref.line}) et « ${nom} » (ligne ${row.line}) — première conservée`, { ref });
    return;
  }
  const entry = buildEntry(ctx, row, ref, id, nom, normalizedName);
  ctx.entries.push(entry);
  if (id !== "") ctx.byId.set(id, entry);
  const sameName = ctx.byName.get(normalizedName);
  if (sameName === undefined) ctx.byName.set(normalizedName, entry);
  else doubt(ctx.report, ctx.fileName, `nom « ${nom} » porté par deux Id (${sameName.id || "vide"}, ${id || "vide"}) — jointures par nom ambiguës`, { ref });
}

function buildEntry(
  ctx: ProjetsContext, row: CsvRow, ref: RowRef, id: string, nom: string, normalizedName: string,
): ProjetEntry {
  const split = splitSubjectName(nom);
  const domain = deriveDomain(ctx, row);
  const owner = deriveOwner(ctx, row);
  if (owner !== null) ctx.counts.withOwner++;
  const state = cell(ctx, row, "État du processus");
  if (state !== "") ctx.states.set(state, (ctx.states.get(state) ?? 0) + 1);
  return {
    id, name: nom, normalizedName, normalizedTitle: normalizeLabel(split.title),
    codename: id !== "" ? id : split.codename,
    typeId: deriveType(ctx, row),
    createdAt: dateCell(cell(ctx, row, "Début"), "Début", row.line, ctx.tallies),
    dateRdr: dateCell(cell(ctx, row, "Fin"), "Fin", row.line, ctx.tallies),
    ...domain, owner,
    budgetRdli: moneyCell(cell(ctx, row, "Budget RDLI Total Coût (Res+Trans)"), "Budget RDLI Total Coût (Res+Trans)", row.line, ctx.tallies),
    effortEstimated: amountCell(cell(ctx, row, "Charge finale ME (Res) (J)"), "Charge finale ME (Res) (J)", row.line, ctx.tallies)
      ?? amountCell(cell(ctx, row, "Charge JH"), "Charge JH", row.line, ctx.tallies),
    effortConsumed: amountCell(cell(ctx, row, "Charge réelle ME (Res) (J)"), "Charge réelle ME (Res) (J)", row.line, ctx.tallies),
    ref,
  };
}

// « Type » against the retained types, suffix ignored; unknown labels are
// counted under "?" and questioned — the row stays (the PMO's list rules).
function deriveType(ctx: ProjetsContext, row: CsvRow): string | null {
  const raw = cell(ctx, row, "Type");
  const hit = raw === "" ? null : ctx.typeLookup(raw);
  if (raw === "") tallyInto(ctx.tallies, "« Type » vide", row.line);
  else if (hit === null) tallyInto(ctx.unknownTypes, raw, row.line);
  else if (hit.repaired) tallyInto(ctx.tallies, "« Type » aux accents détruits — rapproché", row.line);
  const key = hit?.id ?? "?";
  ctx.typeCounts.set(key, (ctx.typeCounts.get(key) ?? 0) + 1);
  return hit?.id ?? null;
}

type DomainPart = Pick<ProjetEntry, "domainId" | "subDomainId" | "domainSource">;

// Orga columns first (direct), else the organisation path through PARAM.
function deriveDomain(ctx: ProjetsContext, row: CsvRow): DomainPart {
  const none: DomainPart = { domainId: null, subDomainId: null, domainSource: null };
  if (ctx.shape === "orga") {
    const label = cell(ctx, row, "Domaine (Orga)");
    const domainId = label === "" ? null : (ctx.domainLookup(label)?.id ?? null);
    if (label !== "" && domainId === null) tallyInto(ctx.unknownDomains, label, row.line);
    if (domainId === null) {
      ctx.counts.domainMissing++;
      return none;
    }
    ctx.counts.domainDirect++;
    return { domainId, subDomainId: resolveSub(ctx, domainId, cell(ctx, row, "Ss-Daine (Orga)"), row.line), domainSource: "orga" };
  }
  const path = ctx.shape === "path" ? cell(ctx, row, "Domaine") : "";
  const hit = path === "" || ctx.param === null ? undefined : ctx.param.byPath.get(normalizeLabel(path));
  if (hit === undefined || hit.domainId === null) {
    if (path !== "" && ctx.param !== null) tallyInto(ctx.unknownPaths, path, row.line);
    ctx.counts.domainMissing++;
    return none;
  }
  ctx.counts.domainViaParam++;
  if (hit.subDomainId !== null) ctx.counts.subDetailed++;
  return { domainId: hit.domainId, subDomainId: hit.subDomainId, domainSource: "param" };
}

// A sub-domain resolves only inside a detailed domain (ADR 022); elsewhere
// a non-empty label is folded into the domain and counted.
function resolveSub(ctx: ProjetsContext, domainId: string, label: string, line: number): string | null {
  if (label === "") return null;
  const lookup = ctx.subLookups.get(domainId);
  if (lookup === undefined) {
    ctx.counts.subFolded++;
    return null;
  }
  const hit = lookup(label);
  if (hit === null) {
    tallyInto(ctx.unknownSubs, `${domainId} / ${label}`, line);
    return null;
  }
  ctx.counts.subDetailed++;
  return hit.id;
}

// First of Responsables 1→3 that is not a PARAM domain lead; exclusions
// are counted (an homonym would silently cost a chef de projet otherwise).
function deriveOwner(ctx: ProjetsContext, row: CsvRow): string | null {
  let sawAny = false;
  for (const column of ["Responsable 1", "Responsable 2", "Responsable 3"]) {
    const value = cell(ctx, row, column);
    if (value === "") continue;
    sawAny = true;
    if (ctx.param !== null && isDomainLead(ctx.param.leadWords, value)) {
      ctx.counts.leadsExcluded++;
      tallyInto(ctx.tallies, `« ${column} » est un responsable de domaine — exclu du chef de projet`, row.line);
      continue;
    }
    return value;
  }
  tallyInto(ctx.tallies, sawAny ? "aucun chef de projet (responsables tous responsables de domaine)" : "responsables vides", row.line);
  return null;
}

// Aggregated signalements, the vocabulary questions and the state survey.
function finalize(ctx: ProjetsContext): void {
  for (const [message, t] of ctx.tallies) warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  const question = (prefix: string, map: Map<string, Tally>, suffix: string): void => {
    for (const [label, t] of map) doubt(ctx.report, ctx.fileName, `${prefix} « ${label} » (${tallyLabel(t)}) — ${suffix}`);
  };
  question("type hors des quatre retenus :", ctx.unknownTypes, "carte gardée sans type (la liste `projets` fait foi)");
  question("« Domaine (Orga) » inconnu du board :", ctx.unknownDomains, "carte sans domaine");
  question("sous-domaine inconnu de la config :", ctx.unknownSubs, "replié dans le domaine — à déclarer ?");
  question("chemin d'organisation absent de PARAM :", ctx.unknownPaths, "carte sans domaine");
  if (ctx.states.size > 0) {
    const seen = [...ctx.states.entries()].map(([label, count]) => `« ${label} » (${count})`).join(" ; ");
    warn(ctx.report, `« État du processus » — valeurs vues : ${seen} (information)`, ctx.fileName);
  }
}
