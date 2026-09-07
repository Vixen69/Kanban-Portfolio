// The report's roadmap and assembly-state lines: what is still expected,
// and how far the deck currently assembles (perimeter, joins, coverage).
// French, user-facing; consumed by render-report.ts as-is.

import type { BoardConfig } from "../../core/types.ts";
import type { ParamTable } from "./param.ts";
import type { ProjetsTable } from "./projets.ts";
import type { JalonsTable } from "./jalons.ts";
import type { SpTable } from "./sp.ts";
import type { CardAssembly } from "./enrich.ts";
import { cardDistribution } from "./enrich.ts";
import type { PdcTable } from "./pdc.ts";
import type { ProfilsTable } from "./profils.ts";
import type { CapacityBuild } from "./capacity.ts";
import { formatJh } from "./charges.ts";
import type { ChargeStats } from "./charges.ts";
import type { ImportReport } from "./report.ts";

/** Presence flags of the expected sources. */
export interface Presence {
  param: boolean;
  projets: boolean;
  jalons: boolean;
  sp: boolean;
  pdc: boolean;
  profils: boolean;
}

/**
 * Lists the expected-but-missing source files, with what each brings.
 * Inputs: the report and the presence flags. Outputs: none (mutates the
 * report). Failure modes: none.
 */
export function emitMissing(report: ImportReport, present: Presence): void {
  const expected: Array<[keyof Presence, string, string]> = [
    ["projets", "Projets", "le périmètre et les cartes (identité, type, domaine, chef de projet) — sans lui, pas d'assemblage"],
    ["param", "PARAM", "responsables de domaine (exclus du chef de projet) et traduction des chemins d'organisation"],
    ["jalons", "ProjetsJalons", "position initiale (RDO / RDLI / RDR franchi) — sans lui, tout en colonne d'entrée"],
    ["sp", "SP (2026 ou total)", "coûts 2026 : meilleur estimé, réel, engagé"],
    ["pdc", "Ressources_PdC", "plan de charge de l'exercice par profil et par personne (+ consolidation nominative)"],
    ["profils", "Ress.Profils", "personnes de la DSI (domaine, métier, capacité) — sans lui, la vue capacité ne connaît que la demande"],
  ];
  for (const [key, name, note] of expected) {
    if (!present[key]) report.missingExpected.push({ name, note });
  }
}

/** The parsed tables and the deck, for the assembly read-out. */
export interface AssemblyData {
  param: ParamTable | null;
  projets: ProjetsTable | null;
  jalons: JalonsTable | null;
  sp: SpTable | null;
  pdc: PdcTable | null;
  profils: ProfilsTable | null;
  cards: CardAssembly | null;
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
  if (data.cards !== null && data.projets !== null) emitDeck(report, data, data.cards, data.projets, config);
  else emitWaiting(report, data);
  report.assembly.push({ subject: "plan de charge", status: chargeStatus(data) });
  report.assembly.push({ subject: "capacité", status: capacityStatus(data) });
}

// The capacity snapshot (ADR 024): who, how much capacity, how much demand.
function capacityStatus(data: AssemblyData): string {
  if (data.capacity === null) return "en attente de `Ress.Profils` (personnes) et de `Ressources_PdC` (affectations)";
  const s = data.capacity.stats;
  const people = data.profils === null
    ? "sans `Ress.Profils` — personnes connues par le plan de charge seul, capacité inconnue"
    : `${s.persons} personne(s) dont ${s.external} externe(s) · capacité ${formatJh(s.capacityJh)} j.h`;
  return `${people} · ${s.stubs} sans fiche · affectations : ${s.assignments} sur ${s.cardsCovered} carte(s)` +
    ` · demande ${formatJh(s.demandJh)} j.h`;
}

function paramStatus(param: ParamTable | null): string {
  if (param === null) return "absente — responsables de domaine non exclus, export brut non traduisible";
  const c = param.counts;
  return `prête (${c.leads} responsable(s) de domaine · ${c.orgaRows} ligne(s) organisation, ${c.withPath} avec chemin)`;
}

// The perimeter line: the list rules; types are counted by config name.
function perimeterStatus(projets: ProjetsTable, config: BoardConfig): string {
  const names = new Map(config.types.map((t) => [t.id, t.name]));
  const parts = [...projets.typeCounts.entries()]
    .map(([id, count]) => `${id === "?" ? "hors des quatre retenus" : (names.get(id) ?? id)} ${count}`);
  const shape = projets.shape === "orga" ? "colonnes Orga (direct)"
    : projets.shape === "path" ? "chemin d'organisation (via PARAM)" : "aucune colonne de domaine";
  return `${projets.entries.length} carte(s) — la liste fait foi · types : ${parts.join(" · ")} · domaine : ${shape}`;
}

function chargeStatus(data: AssemblyData): string {
  if (data.pdc === null) return "en attente de `Ressources_PdC`";
  if (data.chargeStats === null || data.cards === null) {
    return `chargé (${data.pdc.projects.size} projets) — en attente de \`projets\``;
  }
  const s = data.chargeStats;
  return `${s.covered}/${data.cards.cards.length} cartes couvertes · charge 2026 des cartes : ` +
    `${formatJh(s.cardsJh)} j.h prév. · ${formatJh(s.cardsDone)} réel` +
    ` · total du fichier PdC (toute la DSI) : ${formatJh(s.totalJh)} / ${formatJh(s.totalDone)}` +
    ` · projets PdC hors périmètre : ${s.pdcOutside} · cartes sans charge : ${s.uncovered}`;
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
    { subject: "chef de projet", status: `${s.withOwner}/${s.total} · responsables de domaine exclus : ${c.leadsExcluded}` },
    { subject: "coûts 2026 (SP)", status: spStatus(data.sp, deck) },
  );
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

function spStatus(sp: SpTable | null, deck: CardAssembly): string {
  const s = deck.stats;
  const q = " · RDLI et charges j.h lus dans `projets` (pluriannuels — Q22/Q23 en suspens)";
  if (sp === null) return `en attente de SP — coûts 2026 inconnus${q}`;
  const joined = s.spById + s.spByName + s.spByCode;
  return `${joined}/${s.total} jointes (Id ${s.spById} · nom ${s.spByName} · code ${s.spByCode})` +
    ` · sans correspondance : ${s.withoutSp} · sujets SP hors périmètre : ${s.spOutside}` +
    `${sp.hasIds ? "" : " · fichier sans colonne Id (forme SP_total)"}${q}`;
}

// No deck yet: say what each present table waits for.
function emitWaiting(report: ImportReport, data: AssemblyData): void {
  report.assembly.push({ subject: "cartes", status: "en attente de `projets` (le périmètre)" });
  if (data.jalons !== null) {
    report.assembly.push({ subject: "jalons", status: `${data.jalons.entries.length} ligne(s) lue(s) — en attente de \`projets\`` });
  }
  if (data.sp !== null) {
    report.assembly.push({ subject: "coûts 2026 (SP)", status: `${data.sp.entries.length} sujet(s) lu(s) — en attente de \`projets\`` });
  }
}
