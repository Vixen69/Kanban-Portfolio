// The report's roadmap and assembly-state lines: what is still expected,
// and how far the deck currently assembles (perimeter, joins, coverage).
// French, user-facing; consumed by render-report.ts as-is.

import type { BoardConfig } from "../../core/types.ts";
import type { ConsolideTable } from "./consolide.ts";
import type { ProjetsTable } from "./projets.ts";
import type { RdomTable } from "./rdom.ts";
import type { SpTotalTable } from "./sp-total.ts";
import type { CardAssembly } from "./enrich.ts";
import { cardDistribution } from "./enrich.ts";
import type { PdcTable } from "./pdc.ts";
import { formatJh } from "./charges.ts";
import type { ChargeStats } from "./charges.ts";
import type { ImportReport } from "./report.ts";

/**
 * Lists the expected-but-missing source files, with what each brings.
 * Inputs: the report and the presence flags. Outputs: none (mutates the
 * report). Failure modes: none.
 */
export function emitMissing(
  report: ImportReport,
  present: { rdom: boolean; consolide: boolean; projets: boolean; pdc: boolean },
): void {
  if (!present.consolide) {
    report.missingExpected.push({
      name: "consolidé",
      note: "source unique des cartes (révision 2026-07-31) — sans lui, pas d'assemblage",
    });
  }
  if (!present.rdom) {
    report.missingExpected.push({ name: "RDOM", note: "table domaine ↔ nom (fournie par l'auteur)" });
  }
  if (!present.projets) {
    report.missingExpected.push(
      { name: "Projets (export brut)", note: "chef de projet — absent du consolidé" },
    );
  }
  if (!present.pdc) {
    report.missingExpected.push(
      { name: "Ressources_PdC", note: "plan de charge 2026 par profil (+ consolidation nominative)" },
    );
  }
}

interface AssemblyData {
  rdom: RdomTable | null;
  spTotal: SpTotalTable | null;
  consolide: ConsolideTable | null;
  projets: ProjetsTable | null;
  pdc: PdcTable | null;
  cards: CardAssembly | null;
  chargeStats: ChargeStats | null;
}

/**
 * Describes the assembly state: perimeter, card distribution, join and
 * coverage counters — or what is still blocking the assembly.
 * Inputs: the report, the parsed tables and the deck, the board config
 * (column names and order). Outputs: none (mutates the report).
 * Failure modes: none.
 */
export function emitAssembly(report: ImportReport, data: AssemblyData, config: BoardConfig): void {
  const rdomStatus = data.rdom === null
    ? "absente — fournir le CSV « Domaine;Nom »"
    : `prête (${data.rdom.entries.length} noms, ${data.rdom.namesByDomain.size} domaines)`;
  report.assembly.push({ subject: "table RDOM", status: rdomStatus });
  if (data.consolide !== null) {
    const sis = data.consolide.sisCounts;
    const excluded = data.consolide.excluded === 0
      ? "" : ` · exclus : ${data.consolide.excluded} (Domaine (Ptf) TMA CORRECTIVES / IT4IT / PROJETS VENDUS)`;
    report.assembly.push({
      subject: "périmètre `consolidé`",
      status: `${data.consolide.entries.length} carte(s) — le fichier fait foi${excluded}` +
        ` · isProjetSIS (informatif) : VRAI ${sis.yes} · FAUX ${sis.no} · vide ${sis.blank}`,
    });
  }
  if (data.cards !== null) emitDeck(report, data.cards, config, data.spTotal !== null);
  else emitWaiting(report, data);
  report.assembly.push({ subject: "plan de charge", status: chargeStatus(data) });
}

// Where the chefs de projet came from: the raw `projet` export is their
// only source (the consolidated sheet has no Responsable columns).
function ownerStatus(s: CardAssembly["stats"]): string {
  const source = s.ownerFromProjets === 0
    ? "" : ` (dont ${s.ownerFromProjets} via l'export \`projet\`)`;
  const missing = s.withoutProjets === 0
    ? "" : ` · ${s.withoutProjets} carte(s) sans ligne dans l'export \`projet\``;
  return `${s.withOwner}/${s.total}${source}${missing}`;
}

function chargeStatus(data: AssemblyData): string {
  if (data.pdc === null) return "en attente de `Ressources_PdC`";
  if (data.chargeStats === null || data.cards === null) {
    return `chargé (${data.pdc.projects.size} projets) — en attente du \`consolidé\``;
  }
  const s = data.chargeStats;
  return `${s.covered}/${data.cards.cards.length} cartes couvertes · 2026 : ${formatJh(s.totalJh)} j.h prév.` +
    ` · ${formatJh(s.totalDone)} réel · projets PdC hors périmètre : ${s.pdcOutside}` +
    ` · cartes sans charge : ${s.uncovered}`;
}

// The assembled deck: distribution + join and coverage counters.
function emitDeck(report: ImportReport, deck: CardAssembly, config: BoardConfig, hasSp: boolean): void {
  const distribution = cardDistribution(deck.cards);
  const parts = config.columns
    .filter((c) => (distribution.get(c.id) ?? 0) > 0)
    .map((c) => `${c.name} ${distribution.get(c.id)}`);
  const s = deck.stats;
  report.assembly.push({
    subject: "cartes",
    status: `${s.total}${parts.length === 0 ? "" : ` — répartition : ${parts.join(" · ")}`}`,
  });
  const defaults = s.total - s.positioned - s.byJalon;
  report.assembly.push({
    subject: "position",
    status: (hasSp ? `jalons datés SP_total ${s.positioned} (nom ${s.joinByName} · code ${s.joinByCode}` +
        ` · titre ${s.joinByTitle}) · ` : "") +
      `« Jalon en cours » ${s.byJalon} (RDO→Qualification, RDLI→Études, RDR→Actifs,` +
      ` RVSR→Exploitation — Q19) · défaut Demandes : ${defaults}`,
  });
  report.assembly.push(
    {
      subject: "domaine",
      status: `${s.withDomain}/${s.total} · manquant : ${s.total - s.withDomain}`,
    },
    { subject: "chef de projet", status: ownerStatus(s) },
  );
  if (hasSp) {
    report.assembly.push({
      subject: "hors périmètre",
      status: `${s.spOutsidePerimeter} sujet(s) SP_total non retenus par le consolidé`,
    });
  }
}

// No deck yet: say what each present table waits for.
function emitWaiting(report: ImportReport, data: AssemblyData): void {
  if (data.spTotal !== null) {
    const profile = spTotalProfile(data.spTotal);
    report.assembly.push(
      { subject: "cartes", status: `en attente du \`consolidé\` — ${data.spTotal.drafts.length} sujet(s) SP_total lus, non filtrés` },
      { subject: "profil `SP_total`", status: profile },
    );
  } else {
    report.assembly.push({ subject: "cartes", status: "en attente du `consolidé` (source unique des cartes)" });
  }
}

// Ventilation of the drafts along the candidate perimeter discriminants:
// the counts point at where the real-project boundary lies.
function spTotalProfile(spTotal: SpTotalTable): string {
  const total = spTotal.drafts.length;
  const coded = spTotal.drafts.filter((d) => d.codename !== null).length;
  const typed = spTotal.drafts.filter((d) => d.typeId !== null).length;
  const budgeted = spTotal.drafts.filter((d) =>
    d.budgetRdli !== null || d.budgetEstimated !== null
    || d.budgetConsumed !== null || d.budgetEngaged !== null).length;
  const dated = spTotal.drafts.filter((d) => d.createdAt !== null).length;
  return `code PE : ${coded}/${total} · type : ${typed}/${total}` +
    ` · budget : ${budgeted}/${total} · date de début : ${dated}/${total}`;
}
