// The audit pass the CLI calls: classify every received file (identify.ts),
// elect one candidate per contract (election.ts), run the contract readers in
// dependency order (PARAM before the perimeter), assemble the cards (enrich.ts
// — the perimeter is the COUT PREV export when present, else the `projets`
// onglet, ADR 030), attach the charges, then describe what is missing and
// the assembly state (assembly.ts). Pure and filesystem-free; stateless by
// design.

import type { BoardConfig } from "../../core/types.ts";
import {
  CDP_CONTRACT, COUTS_CONTRACT, JALONS_CONTRACT, PARAM_CONTRACT, PDC_CONTRACT, PROFILS_CONTRACT, PROJETS_CONTRACT,
  SP_CONTRACT, contractsFor,
} from "./contract.ts";
import type { FileContract } from "./contract.ts";
import { processFile } from "./identify.ts";
import type { InputFile } from "./identify.ts";
import { elect, electPerimeter, secondProjets } from "./election.ts";
import type { Candidate } from "./election.ts";
import { createReport, warn } from "./report.ts";
import type { ImportReport } from "./report.ts";
import { parseParam } from "./param.ts";
import type { ParamTable } from "./param.ts";
import { parseProjets } from "./projets.ts";
import type { ProjetsTable } from "./projets.ts";
import { checkPerimeters, parseCouts } from "./couts.ts";
import type { CoutsTable, PerimeterCheck } from "./couts.ts";
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
  /** The COUT PREV export when it came — then it IS `projets` (ADR 030). */
  couts: CoutsTable | null;
  /** The perimeter: COUT PREV when present, else the Projets onglet. */
  projets: ProjetsTable | null;
  /** Both perimeters came: their code-by-code comparison. */
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
 * Runs the full audit pass over the received files.
 * Inputs: the files (any set — recognition is by header contract, never by
 * filename), the board config actually served (runtime override), and
 * `now` (injected for determinism; dates a « franchi » milestone against
 * the run day). When several files match one contract, the cleanest
 * header wins (fewest deviations, then first name); the others are flagged
 * douteux. The perimeter is the COUT PREV export when one came (ADR 030);
 * else, among the Projets-shaped files, the one without Responsable
 * columns (election.ts).
 * Outputs: the report, the parsed tables and the assembled cards (non-null
 * when a perimeter is present). Deterministic for identical inputs and
 * `now`.
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
  const perimeter = readPerimeter(byContract, config, param, report);
  const projets = perimeter.projets;
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
  const cdpBest = pick(CDP_CONTRACT.id)
    ?? secondProjets(byContract.get(PROJETS_CONTRACT.id) ?? [], perimeter.ongletBest, report) ?? lentOnglet(perimeter, report);
  const cdp = cdpBest === null ? null : parseCdp(cdpBest.dataRows, cdpBest.match, param, report, cdpBest.file.name);
  const cards = assembleCards(projets, jalons, sp, config, report);
  const ownerStats = attachOwners(cards, cdp, report);
  const chargeStats = attachCharges(cards?.cards ?? [], pdc, report, config.exercise.year);
  const capacity = buildCapacity(profils, pdc, cards?.cards ?? [], config, report, param);
  emitMissing(report, {
    param: param !== null, couts: perimeter.couts !== null, projets: perimeter.onglet !== null, jalons: jalons !== null,
    sp: sp !== null, pdc: pdc !== null, profils: profils !== null, cdp: cdp !== null,
  }, config.exercise.year);
  const result: AuditResult = {
    report, param, couts: perimeter.couts, projets, perimeterCheck: perimeter.check, jalons, sp, pdc, profils, cdp,
    cards, ownerStats, chargeStats, capacity,
  };
  emitAssembly(report, result, config);
  return result;
}

interface Perimeter {
  couts: CoutsTable | null;
  /** The elected Projets onglet: the perimeter without COUT PREV, the cross-check with it. */
  ongletBest: Candidate | null;
  onglet: ProjetsTable | null;
  projets: ProjetsTable | null;
  check: PerimeterCheck | null;
}

// COUT PREV first (ADR 030); the Projets onglet is read anyway — it is the
// perimeter when COUT PREV is absent, the cross-check otherwise (said in
// the report, on the onglet's name).
function readPerimeter(
  byContract: Map<string, Candidate[]>, config: BoardConfig, param: ParamTable | null, report: ImportReport,
): Perimeter {
  const coutsBest = elect(byContract.get(COUTS_CONTRACT.id) ?? [], report);
  const couts = coutsBest === null ? null
    : parseCouts(coutsBest.dataRows, coutsBest.match, config, report, coutsBest.file.name);
  const ongletBest = electPerimeter(byContract.get(PROJETS_CONTRACT.id) ?? [], report);
  const onglet = ongletBest === null ? null
    : parseProjets(ongletBest.dataRows, ongletBest.match, config, param, report, ongletBest.file.name);
  const check = couts !== null && onglet !== null ? checkPerimeters(couts, onglet) : null;
  if (couts !== null && onglet !== null) {
    warn(report, `périmètre lu dans « ${couts.fileName} » (COUT PREV, ADR 030) — ce fichier ne sert qu'au recoupement`, onglet.fileName);
  }
  return { couts, ongletBest, onglet, projets: couts ?? onglet, check };
}

// When COUT PREV is the perimeter, a Projets onglet carrying the Responsable
// columns lends its chefs de projet if no ProjetsCdP source came.
function lentOnglet(p: Perimeter, report: ImportReport): Candidate | null {
  if (p.couts === null || p.ongletBest === null || !p.ongletBest.match.columnIndex.has("Responsable 1")) return null;
  warn(report, "lu aussi comme ProjetsCdP (chefs de projet) — le périmètre est COUT PREV", p.ongletBest.file.name);
  return p.ongletBest;
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
