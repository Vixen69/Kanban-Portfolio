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
import type { ImportReport } from "./report.ts";

/**
 * Lists the expected-but-missing source files, with what each brings.
 * Inputs: the report and the presence flags. Outputs: none (mutates the
 * report). Failure modes: none.
 */
export function emitMissing(
  report: ImportReport,
  present: { rdom: boolean; spTotal: boolean; projets: boolean; consolide: boolean },
): void {
  if (!present.consolide) {
    report.missingExpected.push({ name: "consolidé", note: "fichier maître du périmètre (Q18) — sans lui, pas d'assemblage de cartes" });
  }
  if (!present.rdom) {
    report.missingExpected.push({ name: "RDOM", note: "table domaine ↔ nom (fournie par l'auteur)" });
  }
  if (!present.spTotal) {
    report.missingExpected.push({ name: "SP_total", note: "sujets, jalons → position, budgets" });
  }
  if (!present.projets) {
    report.missingExpected.push({ name: "Projets", note: "chef de projet + domaine de repli (RDOM)" });
  }
  report.missingExpected.push(
    { name: "ressources_PDC", note: "plan de charge — contrat défini à l'étape 4" },
  );
}

interface AssemblyData {
  rdom: RdomTable | null;
  spTotal: SpTotalTable | null;
  projets: ProjetsTable | null;
  consolide: ConsolideTable | null;
  cards: CardAssembly | null;
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
    report.assembly.push({
      subject: "périmètre `consolidé`",
      status: `${data.consolide.entries.length} retenu(s) · ${data.consolide.excludedCount} hors périmètre (isProjetSIS faux)`,
    });
  }
  if (data.cards !== null) emitDeck(report, data.cards, config);
  else emitWaiting(report, data);
  report.assembly.push({ subject: "plan de charge", status: "en attente de `ressources_PDC` (étape 4)" });
}

// The assembled deck: distribution + join and coverage counters.
function emitDeck(report: ImportReport, deck: CardAssembly, config: BoardConfig): void {
  const distribution = cardDistribution(deck.cards);
  const parts = config.columns
    .filter((c) => (distribution.get(c.id) ?? 0) > 0)
    .map((c) => `${c.name} ${distribution.get(c.id)}`);
  const s = deck.stats;
  report.assembly.push(
    {
      subject: "cartes",
      status: `${s.total}${parts.length === 0 ? "" : ` — répartition : ${parts.join(" · ")}`}`,
    },
    {
      subject: "position par jalons",
      status: `${s.positioned}/${s.total} via SP_total (nom ${s.joinByName} · code ${s.joinByCode}` +
        ` · titre ${s.joinByTitle}) · défaut : ${s.withoutSp}`,
    },
    {
      subject: "domaine",
      status: `${s.domainFromConsolide + s.domainFromRdom}/${s.total}` +
        ` (consolidé ${s.domainFromConsolide} · RDOM ${s.domainFromRdom}) · manquant : ${s.domainMissing}`,
    },
    { subject: "chef de projet", status: `${s.withOwner}/${s.total}` },
    {
      subject: "hors périmètre",
      status: `${s.spOutsidePerimeter} sujet(s) SP_total non retenus par le consolidé`,
    },
  );
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
    report.assembly.push({ subject: "cartes", status: "en attente de `SP_total` et du `consolidé`" });
  }
  if (data.projets !== null) {
    report.assembly.push({
      subject: "enrichissement `Projets`",
      status: `chargé (${data.projets.entries.length} lignes) — en attente du \`consolidé\``,
    });
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
