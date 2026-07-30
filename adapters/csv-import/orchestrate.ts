// The audit pass the CLI calls: classify every received file (identify.ts),
// elect the cleanest candidate per contract, run the contract readers, list
// what is still expected, describe the assembly state. Pure and
// filesystem-free; stateless by design — each run redoes the whole
// assembly (docs/IMPORT-MAPPING.md « Construction par étapes »).

import type { BoardConfig } from "../../core/types.ts";
import { RDOM_CONTRACT, SP_TOTAL_CONTRACT } from "./contract.ts";
import type { HeaderMatch } from "./contract.ts";
import type { CsvRow } from "./csv.ts";
import { processFile } from "./identify.ts";
import type { InputFile } from "./identify.ts";
import { createReport, doubt } from "./report.ts";
import type { ImportReport } from "./report.ts";
import { parseRdom } from "./rdom.ts";
import type { RdomTable } from "./rdom.ts";
import { parseSpTotal } from "./sp-total.ts";
import type { SpTotalTable } from "./sp-total.ts";

export type { InputFile } from "./identify.ts";

/** The audit outcome: the report, plus the parsed tables for later steps. */
export interface AuditResult {
  report: ImportReport;
  rdom: RdomTable | null;
  spTotal: SpTotalTable | null;
}

interface Candidate {
  file: InputFile;
  match: HeaderMatch;
  dataRows: CsvRow[];
}

/**
 * Runs the full audit pass over the received files.
 * Inputs: the files (any set — recognition is by header contract, never by
 * filename), the board config actually served (runtime override), and
 * `now` (injected for determinism; bounds the milestone-in-the-future
 * rule). When several files match one contract, the cleanest header wins
 * (fewest deviations, then first name); the others are flagged douteux.
 * Outputs: the report and the parsed tables. Deterministic for identical
 * inputs and `now`.
 * Failure modes: none — unreadable or alien files land in the inventory
 * with a reason, nothing throws.
 */
export function runImportAudit(files: InputFile[], config: BoardConfig, now: Date): AuditResult {
  const report = createReport();
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const byContract = new Map<string, Candidate[]>();
  for (const file of sorted) {
    const parsed = processFile(file, report);
    if (parsed === null) continue;
    const list = byContract.get(parsed.match.contract.id) ?? [];
    list.push({ file, ...parsed });
    byContract.set(parsed.match.contract.id, list);
  }
  const rdomBest = elect(byContract.get(RDOM_CONTRACT.id) ?? [], report);
  const spBest = elect(byContract.get(SP_TOTAL_CONTRACT.id) ?? [], report);
  const rdom = rdomBest === null ? null
    : parseRdom(rdomBest.dataRows, rdomBest.match, config.domains, report, rdomBest.file.name);
  const spTotal = spBest === null ? null
    : parseSpTotal(spBest.dataRows, spBest.match, config, report, spBest.file.name, now);
  emitMissing(report, rdom !== null, spTotal !== null);
  emitAssembly(report, rdom, spTotal, config);
  return { report, rdom, spTotal };
}

// Several files can carry a contract's required columns — a rich `projet`
// export does (seen on the real 2026-07-29 run, where it stole the RDOM
// match by name order). The cleanest header wins: fewest deviations, then
// first name; the others are flagged douteux, never silently parsed.
function elect(candidates: Candidate[], report: ImportReport): Candidate | null {
  const best = candidates.reduce<Candidate | null>(
    (acc, c) => (acc === null || c.match.deviations.length < acc.match.deviations.length ? c : acc),
    null,
  );
  if (best === null) return null;
  for (const c of candidates) {
    if (c === best) continue;
    doubt(
      report, c.file.name,
      `correspond aussi au contrat ${best.match.contract.displayName} ` +
        `(${c.match.deviations.length} écart(s) d'en-têtes, contre ` +
        `${best.match.deviations.length} pour « ${best.file.name} ») — non retenu`,
    );
  }
  return best;
}

// The inventory shows the roadmap: sources whose contract arrives at a
// later step are listed as expected, with the step that defines them.
function emitMissing(report: ImportReport, hasRdom: boolean, hasSpTotal: boolean): void {
  if (!hasRdom) {
    report.missingExpected.push({ name: "RDOM", note: "table domaine ↔ nom (fournie par l'auteur)" });
  }
  if (!hasSpTotal) {
    report.missingExpected.push({ name: "SP_total", note: "sujets, jalons, budgets" });
  }
  report.missingExpected.push(
    { name: "projet", note: "chef de projet et domaine — contrat défini à l'étape 3" },
    { name: "ressources_PDC", note: "plan de charge — contrat défini à l'étape 4" },
  );
}

function emitAssembly(
  report: ImportReport, rdom: RdomTable | null, spTotal: SpTotalTable | null, config: BoardConfig,
): void {
  const rdomStatus = rdom === null
    ? "absente — fournir le CSV « Domaine;Nom »"
    : `prête (${rdom.entries.length} noms, ${rdom.namesByDomain.size} domaines)`;
  report.assembly.push({ subject: "table RDOM", status: rdomStatus });
  if (spTotal === null) {
    report.assembly.push({ subject: "cartes", status: "en attente de `SP_total`" });
  } else {
    const parts = config.columns
      .filter((c) => (spTotal.distribution.get(c.id) ?? 0) > 0)
      .map((c) => `${c.name} ${spTotal.distribution.get(c.id)}`);
    const detail = parts.length === 0 ? "" : ` — répartition : ${parts.join(" · ")}`;
    report.assembly.push({
      subject: "cartes",
      status: `${spTotal.drafts.length} prête(s)${detail}`,
    });
    report.assembly.push({ subject: "profil `SP_total`", status: spTotalProfile(spTotal) });
  }
  report.assembly.push(
    {
      subject: "domaine et chef de projet des cartes",
      status: "en attente de `projet` (étape 3)",
    },
    { subject: "plan de charge", status: "en attente de `ressources_PDC` (étape 4)" },
  );
}

// Ventilation of the drafts along the candidate perimeter discriminants
// (Q18): the counts point at where the real-project boundary lies.
function spTotalProfile(spTotal: SpTotalTable): string {
  const total = spTotal.drafts.length;
  const coded = spTotal.drafts.filter((d) => d.codename !== null).length;
  const typed = spTotal.drafts.filter((d) => d.typeId !== null).length;
  const budgeted = spTotal.drafts.filter((d) =>
    d.budgetRdli !== null || d.budgetEstimated !== null
    || d.budgetConsumed !== null || d.budgetEngaged !== null).length;
  const dated = spTotal.drafts.filter((d) => d.createdAt !== null).length;
  return `code PE : ${coded}/${total} · type : ${typed}/${total}` +
    ` · budget : ${budgeted}/${total} · date de début : ${dated}/${total} (matière pour Q18)`;
}
