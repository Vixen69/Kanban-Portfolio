// The audit pass the CLI calls: classify every received file (identify.ts),
// elect one candidate per contract (election.ts), run the contract readers in
// dependency order (PARAM before Projets), assemble the cards (enrich.ts
// — the `projets` sheet is the perimeter), attach the charges, then
// describe what is missing and the assembly state (assembly.ts). Pure and
// filesystem-free; stateless by design.

import type { BoardConfig } from "../../core/types.ts";
import {
  CDP_CONTRACT, JALONS_CONTRACT, PARAM_CONTRACT, PDC_CONTRACT, PROFILS_CONTRACT, PROJETS_CONTRACT, SP_CONTRACT,
  contractsFor,
} from "./contract.ts";
import type { FileContract } from "./contract.ts";
import { processFile } from "./identify.ts";
import type { InputFile } from "./identify.ts";
import { elect, electPerimeter, secondProjets } from "./election.ts";
import type { Candidate } from "./election.ts";
import { createReport } from "./report.ts";
import type { ImportReport } from "./report.ts";
import { parseParam } from "./param.ts";
import type { ParamTable } from "./param.ts";
import { parseProjets } from "./projets.ts";
import type { ProjetsTable } from "./projets.ts";
import { parseJalons } from "./jalons.ts";
import type { JalonsTable } from "./jalons.ts";
import { parseSp } from "./sp.ts";
import type { SpTable } from "./sp.ts";
import { assembleCards } from "./enrich.ts";
import type { CardAssembly } from "./enrich.ts";
import { parsePdc } from "./pdc.ts";
import type { PdcTable } from "./pdc.ts";
import { attachCharges } from "./charges.ts";
import type { ChargeStats } from "./charges.ts";
import { parseCdp } from "./cdp.ts";
import type { CdpTable } from "./cdp.ts";
import { attachOwners } from "./owners.ts";
import type { OwnerStats } from "./owners.ts";
import { parseProfils } from "./profils.ts";
import type { ProfilsTable } from "./profils.ts";
import { buildCapacity } from "./capacity.ts";
import type { CapacityBuild } from "./capacity.ts";
import { emitAssembly, emitMissing } from "./assembly.ts";

export type { InputFile } from "./identify.ts";

/** The audit outcome: the report, the parsed tables, the assembled deck. */
export interface AuditResult {
  report: ImportReport;
  param: ParamTable | null;
  projets: ProjetsTable | null;
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
 * Runs the full audit pass over the received files.
 * Inputs: the files (any set — recognition is by header contract, never by
 * filename), the board config actually served (runtime override), and
 * `now` (injected for determinism; dates a « franchi » milestone against
 * the run day). When several files match one contract, the cleanest
 * header wins (fewest deviations, then first name); the others are flagged
 * douteux. The perimeter has its own rule (election.ts): among the
 * Projets-shaped files, the one without Responsable columns.
 * Outputs: the report, the parsed tables and the assembled cards (non-null
 * when the `projets` perimeter is present). Deterministic for identical
 * inputs and `now`.
 * Failure modes: none — unreadable or alien files land in the inventory
 * with a reason, nothing throws.
 */
export function runImportAudit(files: InputFile[], config: BoardConfig, now: Date): AuditResult {
  const report = createReport();
  const byContract = classifyFiles(files, report, contractsFor(config.exercise.year));
  const pick = (id: string): Candidate | null => elect(byContract.get(id) ?? [], report);
  const paramBest = pick(PARAM_CONTRACT.id);
  const param = paramBest === null ? null
    : parseParam(paramBest.dataRows, paramBest.match, paramBest.headerCells, config, report, paramBest.file.name);
  const projetsBest = electPerimeter(byContract.get(PROJETS_CONTRACT.id) ?? [], report);
  const projets = projetsBest === null ? null
    : parseProjets(projetsBest.dataRows, projetsBest.match, config, param, report, projetsBest.file.name);
  const jalonsBest = pick(JALONS_CONTRACT.id);
  const jalons = jalonsBest === null ? null
    : parseJalons(jalonsBest.dataRows, jalonsBest.match, config, report, jalonsBest.file.name, now);
  const spBest = pick(SP_CONTRACT.id);
  const sp = spBest === null ? null : parseSp(spBest.dataRows, spBest.match, report, spBest.file.name);
  const pdcBest = pick(PDC_CONTRACT.id);
  const pdc = pdcBest === null ? null
    : parsePdc(pdcBest.dataRows, pdcBest.match, config, report, pdcBest.file.name);
  const profilsBest = pick(PROFILS_CONTRACT.id);
  const profils = profilsBest === null ? null
    : parseProfils(profilsBest.dataRows, profilsBest.match, config, report, profilsBest.file.name);
  const cdpBest = pick(CDP_CONTRACT.id) ?? secondProjets(byContract.get(PROJETS_CONTRACT.id) ?? [], projetsBest, report);
  const cdp = cdpBest === null ? null : parseCdp(cdpBest.dataRows, cdpBest.match, param, report, cdpBest.file.name);
  const cards = assembleCards(projets, jalons, sp, config, report);
  const ownerStats = attachOwners(cards, cdp, report);
  const chargeStats = attachCharges(cards?.cards ?? [], pdc, report, config.exercise.year);
  const capacity = buildCapacity(profils, pdc, cards?.cards ?? [], config, report, param);
  emitMissing(report, {
    param: param !== null, projets: projets !== null, jalons: jalons !== null,
    sp: sp !== null, pdc: pdc !== null, profils: profils !== null, cdp: cdp !== null,
  }, config.exercise.year);
  const result: AuditResult = {
    report, param, projets, jalons, sp, pdc, profils, cdp, cards, ownerStats, chargeStats, capacity,
  };
  emitAssembly(report, result, config);
  return result;
}

// Recognition by header contract (the registry names the PdC column after
// the exercise year); files are visited in name order for determinism.
function classifyFiles(
  files: InputFile[], report: ImportReport, contracts: readonly FileContract[],
): Map<string, Candidate[]> {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const byContract = new Map<string, Candidate[]>();
  for (const file of sorted) {
    const parsed = processFile(file, report, contracts);
    if (parsed === null) continue;
    const list = byContract.get(parsed.match.contract.id) ?? [];
    list.push({ file, ...parsed });
    byContract.set(parsed.match.contract.id, list);
  }
  return byContract;
}
