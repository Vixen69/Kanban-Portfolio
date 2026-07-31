// The audit pass the CLI calls: classify every received file (identify.ts),
// elect the cleanest candidate per contract, run the contract readers,
// assemble the cards (enrich.ts — the consolidated sheet is the perimeter
// master), then describe what is missing and the assembly state
// (assembly.ts). Pure and filesystem-free; stateless by design.

import type { BoardConfig } from "../../core/types.ts";
import { CONSOLIDE_CONTRACT, RDOM_CONTRACT, SP_TOTAL_CONTRACT } from "./contract.ts";
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
import { parseConsolide } from "./consolide.ts";
import type { ConsolideTable } from "./consolide.ts";
import { assembleCards } from "./enrich.ts";
import type { CardAssembly } from "./enrich.ts";
import { emitAssembly, emitMissing } from "./assembly.ts";

export type { InputFile } from "./identify.ts";

/** The audit outcome: the report, the parsed tables, the assembled deck. */
export interface AuditResult {
  report: ImportReport;
  rdom: RdomTable | null;
  spTotal: SpTotalTable | null;
  consolide: ConsolideTable | null;
  cards: CardAssembly | null;
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
 * Outputs: the report, the four tables and the assembled cards (non-null
 * when the consolidated perimeter master is present). Deterministic for
 * identical inputs and `now`.
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
  const pick = (id: string): Candidate | null => elect(byContract.get(id) ?? [], report);
  const rdomBest = pick(RDOM_CONTRACT.id);
  const spBest = pick(SP_TOTAL_CONTRACT.id);
  const consolideBest = pick(CONSOLIDE_CONTRACT.id);
  const rdom = rdomBest === null ? null
    : parseRdom(rdomBest.dataRows, rdomBest.match, config.domains, report, rdomBest.file.name);
  const consolide = consolideBest === null ? null
    : parseConsolide(consolideBest.dataRows, consolideBest.match, config, rdom, report, consolideBest.file.name);
  const spTotal = spBest === null ? null
    : parseSpTotal(spBest.dataRows, spBest.match, config, report, spBest.file.name, now, consolide !== null);
  const cards = assembleCards(consolide, spTotal, config, report);
  emitMissing(report, { rdom: rdom !== null, consolide: consolide !== null });
  emitAssembly(report, { rdom, spTotal, consolide, cards }, config);
  return { report, rdom, spTotal, consolide, cards };
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