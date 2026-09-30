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
import { stripCode } from "./code-prefix.ts";
import { createDomainLookup, createSubDomainLookups, createTypeLookup, isDomainLead } from "./domains.ts";
import type { Lookup } from "./domains.ts";
import { pickOwner } from "./owner-rule.ts";
import { amountCell, dateCell, moneyCell } from "./cells.ts";
import { tallyInto, tallyLabel } from "./tallies.ts";
import type { Tally } from "./tallies.ts";
import type { CsvRow } from "./csv.ts";
import type { HeaderMatch } from "./contract.ts";
import type { ParamTable } from "./param.ts";
import { discard, doubt, warn } from "./report.ts";
import type { ImportReport, RowRef } from "./report.ts";
import type { DomainShape, PerimeterVerdict, ProjetEntry, ProjetsCounts, ProjetsTable } from "./projets-types.ts";
import { projetsVerdict } from "./couts-verdicts.ts";
import { KEPT_ROW_RULE, keptRow } from "./duplicate-rows.ts";

export type { DomainShape, PerimeterVerdict, ProjetEntry, ProjetsCounts, ProjetsTable } from "./projets-types.ts";

/** A row past the structural gates, waiting for the other rows of its Id. */
interface Candidate {
  row: CsvRow;
  line: number;
  cells: string[];
  id: string;
  nom: string;
  normalizedName: string;
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
  /** The rows past the gates, grouped by Id in the order the Ids first came (one group per row without Id). */
  groups: Candidate[][];
  groupById: Map<string, Candidate[]>;
  entries: ProjetEntry[];
  verdicts: PerimeterVerdict[];
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
    groups: [], groupById: new Map(), entries: [], verdicts: [], byId: new Map(), byName: new Map(), typeCounts: new Map(),
    counts: { domainDirect: 0, domainViaParam: 0, domainMissing: 0, subDetailed: 0, subFolded: 0, withOwner: 0, leadsExcluded: 0 },
    unknownTypes: new Map(), unknownDomains: new Map(), unknownSubs: new Map(),
    unknownPaths: new Map(), states: new Map(), tallies: new Map(),
  };
  if (param === null) warn(report, "PARAM absent — responsables de domaine non exclus du chef de projet", fileName);
  for (const row of rows) readRow(ctx, row);
  for (const group of ctx.groups) takeGroup(ctx, group);
  finalize(ctx);
  return {
    fileName, entries: ctx.entries, verdicts: ctx.verdicts, byId: ctx.byId, byName: ctx.byName, shape: ctx.shape,
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

// Structural gates (empty, nameless, total rows), then the row joins the
// group of its Id: the entries are built once every row was read.
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
  const candidate: Candidate = { row, line: row.line, cells: row.cells, id, nom, normalizedName };
  const group = id === "" ? undefined : ctx.groupById.get(id);
  if (group !== undefined) {
    group.push(candidate);
    return;
  }
  ctx.groups.push([candidate]);
  if (id !== "") ctx.groupById.set(id, ctx.groups[ctx.groups.length - 1] ?? []);
}

// One Id: the row kept whatever the order the rows came in (ADR 056 —
// duplicate-rows.ts), the others named, then the entry build. A duplicate
// name with another id is kept — but questioned.
function takeGroup(ctx: ProjetsContext, group: Candidate[]): void {
  const kept = keptRow(group);
  const { row, id, nom, normalizedName } = kept;
  const ref: RowRef = { file: ctx.fileName, line: row.line };
  const entry = buildEntry(ctx, row, ref, id, nom, normalizedName);
  ctx.entries.push(entry);
  ctx.verdicts.push(projetsVerdict(entry.codename ?? "", nom, cell(ctx, row, "Type"), entry.state, null));
  if (group.length > 1) sayDuplicates(ctx, group, kept);
  if (id !== "") ctx.byId.set(id, entry);
  const sameName = ctx.byName.get(normalizedName);
  if (sameName === undefined) ctx.byName.set(normalizedName, entry);
  else doubt(ctx.report, ctx.fileName, `nom « ${nom} » porté par deux Id (${sameName.id || "vide"}, ${id || "vide"}) — jointures par nom ambiguës`, { ref });
}

// The rows of one Id beside the kept one: a verdict each, one douteux.
function sayDuplicates(ctx: ProjetsContext, group: Candidate[], kept: Candidate): void {
  const others = group.filter((c) => c !== kept).sort((a, b) => a.line - b.line);
  for (const c of others) {
    ctx.verdicts.push(projetsVerdict(c.id, c.nom, cell(ctx, c.row, "Type"), cell(ctx, c.row, "État du processus"), kept.line));
  }
  const lines = [...group].sort((a, b) => a.line - b.line).map((c) => `« ${c.nom} » (ligne ${c.line})`).join(", ");
  doubt(ctx.report, ctx.fileName,
    `Id « ${kept.id} » porté par ${group.length} lignes : ${lines} — ligne ${kept.line} gardée (${KEPT_ROW_RULE})`,
    { ref: { file: ctx.fileName, line: kept.line } });
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
  const codename = id !== "" ? id : split.codename;
  return {
    id, name: nom, title: stripCode(split.title, codename),
    normalizedName, normalizedTitle: normalizeLabel(split.title),
    codename,
    typeId: deriveType(ctx, row),
    createdAt: dateCell(cell(ctx, row, "Début"), "Début", row.line, ctx.tallies),
    dateRdr: dateCell(cell(ctx, row, "Fin"), "Fin", row.line, ctx.tallies),
    ...domain, owner, state,
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

type DomainPart = Pick<ProjetEntry, "domainId" | "subDomainId" | "domainSource" | "domainRule">;

// Orga columns first (direct), else the organisation path through PARAM.
function deriveDomain(ctx: ProjetsContext, row: CsvRow): DomainPart {
  const none: DomainPart = { domainId: null, subDomainId: null, domainSource: null, domainRule: null };
  if (ctx.shape === "orga") {
    const label = cell(ctx, row, "Domaine (Orga)");
    const domainId = label === "" ? null : (ctx.domainLookup(label)?.id ?? null);
    if (label !== "" && domainId === null) tallyInto(ctx.unknownDomains, label, row.line);
    if (domainId === null) {
      ctx.counts.domainMissing++;
      return none;
    }
    ctx.counts.domainDirect++;
    return { domainId, subDomainId: resolveSub(ctx, domainId, cell(ctx, row, "Ss-Daine (Orga)"), row.line), domainSource: "orga", domainRule: "colonne « Domaine (Orga) »" };
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
  return { domainId: hit.domainId, subDomainId: hit.subDomainId, domainSource: "param", domainRule: "chemin d'organisation traduit par PARAM" };
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

// The chef de projet among Responsables 1→3 (owner-rule.ts): the first one
// that is not a PARAM domain lead, else the domain lead when he is the only
// name. Leads passed over are counted (an homonym would silently cost a
// chef de projet otherwise).
function deriveOwner(ctx: ProjetsContext, row: CsvRow): string | null {
  const leads = ctx.param?.leadWords;
  const pick = pickOwner(
    ["Responsable 1", "Responsable 2", "Responsable 3"].map((column) => cell(ctx, row, column)),
    leads === undefined ? null : (value) => isDomainLead(leads, value),
  );
  ctx.counts.leadsExcluded += pick.leadsSkipped;
  if (pick.leadsSkipped > 0) tallyInto(ctx.tallies, "responsable de domaine passé pour le responsable suivant (chef de projet)", row.line);
  if (pick.leadTaken) tallyInto(ctx.tallies, "seul nom : un responsable de domaine, pris comme chef de projet", row.line);
  if (pick.owner === null) tallyInto(ctx.tallies, "responsables vides", row.line);
  return pick.owner;
}

// Aggregated signalements, the vocabulary questions and the state survey.
function finalize(ctx: ProjetsContext): void {
  for (const [message, t] of ctx.tallies) warn(ctx.report, `${message} : ${tallyLabel(t)}`, ctx.fileName);
  const question = (prefix: string, map: Map<string, Tally>, suffix: string): void => {
    for (const [label, t] of map) doubt(ctx.report, ctx.fileName, `${prefix} « ${label} » (${tallyLabel(t)}) — ${suffix}`);
  };
  question("type hors des types retenus :", ctx.unknownTypes, "carte gardée sans type (la liste `projets` fait foi)");
  question("« Domaine (Orga) » inconnu du board :", ctx.unknownDomains, "carte sans domaine");
  question("sous-domaine inconnu de la config :", ctx.unknownSubs, "replié dans le domaine — à déclarer ?");
  question("chemin d'organisation absent de PARAM :", ctx.unknownPaths, "carte sans domaine");
  if (ctx.states.size > 0) {
    const seen = [...ctx.states.entries()].map(([label, count]) => `« ${label} » (${count})`).join(" ; ");
    warn(ctx.report, `« État du processus » — valeurs vues : ${seen} (information)`, ctx.fileName);
  }
}
