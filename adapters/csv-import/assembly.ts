// The report's roadmap and assembly-state lines: what is still expected,
// and how far the deck currently assembles (perimeter, joins, coverage).
// French, user-facing; consumed by render-report.ts as-is.

import type { BoardConfig } from "../../core/types.ts";
import type { ParamTable } from "./param.ts";
import type { DomainShape, ProjetsTable } from "./projets.ts";
import { excludedSummary } from "./couts.ts";
import type { CoutsTable, PerimeterCheck } from "./couts.ts";
import type { JalonsTable } from "./jalons.ts";
import type { SpTable } from "./sp.ts";
import type { CardAssembly, EnrichedCard } from "./enrich.ts";
import { emitCapacityByDomain } from "./assembly-capacity.ts";
import { cardDistribution } from "./enrich.ts";
import type { PdcTable } from "./pdc.ts";
import type { ProfilsTable } from "./profils.ts";
import type { CdpTable } from "./cdp.ts";
import type { OwnerStats } from "./owners.ts";
import type { CapacityBuild } from "./capacity.ts";
import { formatJh } from "./charges.ts";
import type { ChargeStats } from "./charges.ts";
import type { ImportReport } from "./report.ts";

/** Presence flags of the expected sources. */
export interface Presence {
  param: boolean;
  /** The COUT PREV export — the perimeter when present (ADR 030). */
  couts: boolean;
  /** The Projets onglet — the perimeter without COUT PREV, the cross-check with it. */
  projets: boolean;
  jalons: boolean;
  sp: boolean;
  pdc: boolean;
  profils: boolean;
  cdp: boolean;
}

/**
 * Lists the expected-but-missing source files, with what each brings.
 * Inputs: the report, the presence flags, the exercise year. Outputs: none (mutates the
 * report). Failure modes: none.
 */
export function emitMissing(report: ImportReport, present: Presence, year: number): void {
  const expected: Array<[keyof Presence, string, string]> = [
    ["couts", "Coût prévisionnel (COUT PREV)", "le périmètre lu à la source Sciforma (projets uniques de l'exercice, sans Achat ni TMA, ni Annulé ni Reporté ; domaine par portefeuille) — fait foi quand il est là, l'onglet Projets ne servant qu'au recoupement (ADR 030) ; à défaut, Projets fait foi"],
    ["projets", "Projets", "le périmètre et les cartes (identité, type, domaine, chef de projet) — sans lui ni COUT PREV, pas d'assemblage"],
    ["param", "PARAM", "responsables de domaine (exclus du chef de projet) et traduction des chemins d'organisation"],
    ["jalons", "ProjetsJalons", "position initiale (RDO / RDLI / RDR franchi) — sans lui, tout en colonne d'entrée"],
    ["sp", "SP (exercice ou total)", `coûts ${year} : meilleur estimé, réel, engagé`],
    ["pdc", "Ressources_PdC", "plan de charge de l'exercice par profil et par personne (+ consolidation nominative)"],
    ["profils", "Ress.Profils", "facultatif depuis l'ADR 029 — les personnes, capacités et métiers viennent du plan de charge ; sert de repli pour le domaine"],
    ["cdp", "ProjetsCdP", "chefs de projet (Responsable 1→3, responsables de domaine exclus) quand `projets` ne les porte pas — facultatif"],
  ];
  for (const [key, name, note] of expected) {
    if (key === "projets" && present.couts) continue;
    if (!present[key]) report.missingExpected.push({ name, note });
  }
}

/** The parsed tables and the deck, for the assembly read-out. */
export interface AssemblyData {
  param: ParamTable | null;
  couts: CoutsTable | null;
  projets: ProjetsTable | null;
  perimeterCheck: PerimeterCheck | null;
  jalons: JalonsTable | null;
  sp: SpTable | null;
  pdc: PdcTable | null;
  profils: ProfilsTable | null;
  cdp: CdpTable | null;
  cards: CardAssembly | null;
  ownerStats: OwnerStats | null;
  chargeStats: ChargeStats | null;
  capacity: CapacityBuild | null;
}

/**
 * Describes the assembly state: PARAM, perimeter, card distribution, join
 * and coverage counters — or what is still blocking the assembly.
 * Inputs: the report, the parsed tables and the deck, the board config
 * (column and type names). Outputs: none (mutates the report).
 * Failure modes: none.
 */
export function emitAssembly(report: ImportReport, data: AssemblyData, config: BoardConfig): void {
  report.assembly.push({ subject: "table PARAM", status: paramStatus(data.param) });
  if (data.projets !== null) {
    report.assembly.push({ subject: "périmètre `projets`", status: perimeterStatus(data.projets, config) });
  }
  if (data.couts !== null) {
    report.assembly.push({ subject: "périmètre · lecture COUT PREV", status: coutsStatus(data.couts, config.exercise.year) });
  }
  if (data.perimeterCheck !== null) {
    report.assembly.push({ subject: "périmètre · recoupement", status: checkStatus(data.perimeterCheck) });
  }
  if (data.cards !== null && data.projets !== null) emitDeck(report, data, data.cards, data.projets, config);
  else emitWaiting(report, data, config.exercise.year);
  report.assembly.push({ subject: "plan de charge", status: chargeStatus(data, config.exercise.year) });
  if (data.pdc !== null) report.assembly.push({ subject: "plan de charge · lecture", status: readingStatus(data.pdc) });
  report.assembly.push({ subject: "capacité", status: capacityStatus(data) });
  if (data.capacity !== null) emitCapacityByDomain(report, data.capacity, config);
}

// The PdC reader's self-diagnosis: which natures of lines were seen and
// where the matricules came from — the first thing to read when the
// capacity figures look wrong (ADR 029).
function readingStatus(pdc: PdcTable): string {
  const r = pdc.reading;
  return `${r.rows} ligne(s) lue(s) : ${r.projectRows} affectations projet · ${r.capacityLines} lignes « Disponible ressource »` +
    ` · ${r.plannedLines} lignes « Planifiée projet » · matricule vide : ${r.emptyMatricule}` +
    ` · matricule lu dans « Ressource » : ${r.matriculeFromResource} · personnes nominatives : ${pdc.persons.length}`;
}

// The capacity snapshot (ADR 024): who, how much capacity, how much demand.
function capacityStatus(data: AssemblyData): string {
  if (data.capacity === null) return "en attente de `Ressources_PdC` (personnes, capacités et affectations — ADR 029)";
  const s = data.capacity.stats;
  const viaProfils = s.domainViaProfils > 0 ? ` · Ress.Profils ${s.domainViaProfils}` : "";
  return `${s.persons} personne(s) nominatives du plan de charge dont ${s.external} externe(s)` +
    ` · capacité ${formatJh(s.capacityJh)} j.h (${s.withoutCapacity} sans ligne « Disponible »)` +
    ` · domaine ${s.persons - s.domainUnknown}/${s.persons} (Organisation → PARAM ${s.domainViaPath}${viaProfils})` +
    ` · affectations : ${s.assignments} sur ${s.cardsCovered} carte(s)` +
    ` · demande du tableau ${formatJh(s.demandJh)} j.h · projeté (tout le plan de charge) ${formatJh(s.plannedJh)} j.h` +
    ` · réalisé ${formatJh(s.doneAllJh)} j.h`;
}

function paramStatus(param: ParamTable | null): string {
  if (param === null) return "absente — responsables de domaine non exclus, export brut non traduisible";
  const c = param.counts;
  return `prête (${c.leads} responsable(s) de domaine · ${c.orgaRows} ligne(s) organisation, ${c.withPath} avec chemin)`;
}

const SHAPES: Record<DomainShape, string> = {
  orga: "colonnes Orga (direct)", path: "chemin d'organisation (via PARAM)", none: "aucune colonne de domaine",
  portefeuille: "portefeuille Sciforma (« Projet.Portefeuille » → alias et sous-domaines de la config)",
};

// The perimeter line: the list rules; types are counted by config name.
function perimeterStatus(projets: ProjetsTable, config: BoardConfig): string {
  const names = new Map(config.types.map((t) => [t.id, t.name]));
  const parts = [...projets.typeCounts.entries()]
    .map(([id, count]) => `${id === "?" ? "hors des quatre retenus" : (names.get(id) ?? id)} ${count}`);
  return `${projets.entries.length} carte(s) — la liste fait foi (« ${projets.fileName} ») · types : ${parts.join(" · ")}` +
    ` · domaine : ${SHAPES[projets.shape]}`;
}

// The COUT PREV reading (ADR 030): what the rows became, exclusions by reason.
function coutsStatus(couts: CoutsTable, year: number): string {
  const s = couts.stats;
  return `${s.rows} ligne(s) · ${s.projectsSeen} projet(s) distinct(s) · retenus ${s.retained} (${s.nonPe} hors PE)` +
    ` · écartés : ${excludedSummary(s.excluded, year)}` +
    ` · « Projet.Actif » faux gardés ${s.inactive} · domaine via portefeuille ${s.domainResolved}/${s.retained}`;
}

const CODES_SHOWN = 20;

function codeList(codes: readonly string[]): string {
  if (codes.length === 0) return "aucun";
  const rest = codes.length - CODES_SHOWN;
  return `${codes.length} (${codes.slice(0, CODES_SHOWN).join(", ")}${rest > 0 ? `, … +${rest}` : ""})`;
}

// Both perimeters came: the disagreement is the information (ADR 030).
function checkStatus(c: PerimeterCheck): string {
  return `${c.couts} projet(s) dans « ${c.coutsFile} » (COUT PREV, fait foi) · ${c.projets} dans « ${c.projetsFile} »` +
    ` · ${c.common} commun(s) · seulement COUT PREV : ${codeList(c.onlyCouts)} · seulement Projets : ${codeList(c.onlyProjets)}`;
}

function chargeStatus(data: AssemblyData, year: number): string {
  if (data.pdc === null) return "en attente de `Ressources_PdC`";
  if (data.chargeStats === null || data.cards === null) {
    return `chargé (${data.pdc.projects.size} projets) — en attente de \`projets\``;
  }
  const s = data.chargeStats;
  return `${s.covered}/${data.cards.cards.length} cartes couvertes · charge ${year} des cartes : ` +
    `${formatJh(s.cardsJh)} j.h prév. · ${formatJh(s.cardsDone)} réel` +
    ` · total du fichier PdC (toute la DSI) : ${formatJh(s.totalJh)} / ${formatJh(s.totalDone)}` +
    ` · projets PdC hors périmètre : ${s.pdcOutside} · cartes sans charge : ${s.uncovered}` +
    ` · non nominatives : ${s.genericRows} ligne(s) (${formatJh(s.genericJh)} j.h, gardées sur les projets)`;
}

// The assembled deck: distribution, position, domain, owner, costs.
function emitDeck(
  report: ImportReport, data: AssemblyData, deck: CardAssembly, projets: ProjetsTable, config: BoardConfig,
): void {
  const distribution = cardDistribution(deck.cards);
  const parts = config.columns
    .filter((c) => (distribution.get(c.id) ?? 0) > 0)
    .map((c) => `${c.name} ${distribution.get(c.id)}`);
  const s = deck.stats;
  const c = projets.counts;
  report.assembly.push(
    { subject: "cartes", status: `${s.total}${parts.length === 0 ? "" : ` — répartition : ${parts.join(" · ")}`}` },
    { subject: "position", status: positionStatus(data, deck) },
    {
      subject: "domaine",
      status: `${s.withDomain}/${s.total} (direct ${c.domainDirect} · via PARAM ${c.domainViaParam} · manquant ${c.domainMissing})` +
        ` · sous-domaine : ${s.withSubDomain} détaillé(s), ${c.subFolded} replié(s) dans leur domaine`,
    },
    { subject: "chef de projet", status: ownerStatus(deck, projets, data) },
    { subject: `coûts ${config.exercise.year} (SP)`, status: spStatus(data.sp, deck, config.exercise.year) },
  );
}

// Chefs de projet: from Projets, completed by ProjetsCdP when present; the
// domain leads excluded by both readers are summed.
function ownerStatus(deck: CardAssembly, projets: ProjetsTable, data: AssemblyData): string {
  const via = data.ownerStats === null ? ""
    : ` (dont ${data.ownerStats.filled} via ProjetsCdP · ${data.ownerStats.cdpOutside} ligne(s) ProjetsCdP hors périmètre)`;
  const excluded = projets.counts.leadsExcluded + (data.cdp?.counts.leadsExcluded ?? 0);
  return `${deck.stats.withOwner}/${deck.stats.total}${via} · responsables de domaine exclus : ${excluded}`;
}

function positionStatus(data: AssemblyData, deck: CardAssembly): string {
  const s = deck.stats;
  if (data.jalons === null) return `en attente de \`ProjetsJalons\` — ${s.total} carte(s) en colonne d'entrée`;
  const stages: Array<[string, string]> = [
    ["exploitation", "Exploitation"], ["actifs", "Actifs"], ["etudes", "Études"], ["entree", "entrée"],
  ];
  const detail = stages.map(([key, label]) => `${label} ${s.stageCounts.get(key as never) ?? 0}`).join(" · ");
  return `jalons ${s.positioned}/${s.total} (${detail}) · sans jalon : ${s.withoutJalons} → colonne d'entrée` +
    ` · lignes jalons hors périmètre : ${s.jalonsOutside}`;
}

function spStatus(sp: SpTable | null, deck: CardAssembly, year: number): string {
  const s = deck.stats;
  const q = " · RDLI depuis SP (« * Budget validé RDLI », annuelle — Q23 tranchée 2026-09-10)";
  if (sp === null) return `en attente de SP — coûts ${year} inconnus${q}`;
  const joined = s.spById + s.spByName + s.spByCode;
  const filled = (pick: (c: EnrichedCard) => number | null): string =>
    `${deck.cards.filter((c) => pick(c) !== null).length}/${s.total}`;
  return `${joined}/${s.total} jointes (Id ${s.spById} · nom ${s.spByName} · code ${s.spByCode})` +
    ` · sans correspondance : ${s.withoutSp} · sujets SP hors périmètre : ${s.spOutside}` +
    `${sp.hasIds ? "" : " · fichier sans colonne Id (forme SP_total)"}${q}` +
    ` · montants renseignés : estimé ${filled((c) => c.budgetEstimated)} · réel ${filled((c) => c.budgetConsumed)}` +
    ` · engagé ${filled((c) => c.budgetEngaged)} · RDLI ${filled((c) => c.budgetRdli)}`;
}

// No deck yet: say what each present table waits for.
function emitWaiting(report: ImportReport, data: AssemblyData, year: number): void {
  report.assembly.push({ subject: "cartes", status: "en attente de `projets` (le périmètre)" });
  if (data.jalons !== null) {
    report.assembly.push({ subject: "jalons", status: `${data.jalons.entries.length} ligne(s) lue(s) — en attente de \`projets\`` });
  }
  if (data.sp !== null) {
    report.assembly.push({ subject: `coûts ${year} (SP)`, status: `${data.sp.entries.length} sujet(s) lu(s) — en attente de \`projets\`` });
  }
}
