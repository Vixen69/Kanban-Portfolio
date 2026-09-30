// The audit pass the CLI calls: classify every received file (identify.ts),
// take the ONE file of each contract (election.ts — two of a kind refuse
// the load, ADR 056), run the contract readers in dependency order (PARAM
// before the perimeter), assemble the cards (enrich.ts — the perimeter is
// the COUT PREV export when present, else the `projets` onglet, ADR 030;
// a Coût-like file that is not recognized refuses, perimeter-source.ts),
// attach the charges, then describe what is missing, the assembly state
// and why a load would be refused (assembly.ts). ADR 062: every reader
// asks the audit's book (doubt-book.ts) how to settle its decidable
// doubts — the side files' doubts are kept only for the deck's projects.
// Pure and filesystem-free; stateless by design.

import type { BoardConfig } from "../../core/types.ts";
import {
  CDP_CONTRACT, COUTS_CONTRACT, JALONS_CONTRACT, PARAM_CONTRACT, PDC_CONTRACT, PROFILS_CONTRACT, PROJETS_CONTRACT,
  SP_CONTRACT, contractsFor,
} from "./contract.ts";
import type { FileContract } from "./contract.ts";
import { processFile } from "./identify.ts";
import type { InputFile, NearMiss } from "./identify.ts";
import { elect, sameNameBlockers, secondProjets } from "./election.ts";
import type { Candidate, ImportBlocker } from "./election.ts";
import { createReport, doubt, warn } from "./report.ts";
import type { ImportReport } from "./report.ts";
import { parseParam } from "./param.ts";
import type { ParamTable } from "./param.ts";
import type { ProjetsTable } from "./projets.ts";
import type { CoutsTable, PerimeterCheck } from "./couts.ts";
import { parseJalons } from "./jalons.ts";
import { referenceDayOf } from "./reference-day.ts";
import type { ReferenceDay } from "./reference-day.ts";
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
import { readPerimeter } from "./perimeter-source.ts";
import type { Perimeter } from "./perimeter-source.ts";
import { promoteAmbiguous } from "./cells.ts";
import type { ImportSource } from "../../core/import-types.ts";
import { createDoubtBook } from "./doubt-book.ts";
import type { DoubtBook } from "./doubt-book.ts";
import { normalizeLabel } from "./normalize.ts";

export type { InputFile } from "./identify.ts";
export type { ImportBlocker } from "./election.ts";

/** The audit outcome: the report, the parsed tables, the assembled deck. */
export interface AuditResult {
  /** The exercise year the files were read for (ADR 035). */
  exercise: number;
  report: ImportReport;
  param: ParamTable | null;
  /** The COUT PREV export when it came — then it IS `projets` (ADR 030). */
  couts: CoutsTable | null;
  /** The perimeter: COUT PREV when present, else the Projets onglet (never when a Coût-like file is refused). */
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
  /** The received file each expected source was read from, null when none (ADR 055). */
  sources: Record<ImportSource, string | null>;
  /**
   * Why a load of these files must be refused (ADR 056): two files of one
   * kind, one name twice, a Coût-like file not recognized. Empty = loadable
   * as far as the files go (the deck may still be empty).
   */
  blockers: ImportBlocker[];
  /** The « Doutes à trancher » of this audit (ADR 062): the plan asks it the identity doubts, the caller lists them. */
  book: DoubtBook;
}

/**
 * Runs the full audit pass over the received files.
 * Inputs: the files (any set — recognition is by header contract, never by
 * filename), the board config the import matches with (vocabulary.ts:
 * the runtime config with the versioned model's vocabulary, ADR 056), and
 * `now` (injected for determinism; dates a « franchi » milestone against
 * the run day). ONE file per contract: when several match one contract
 * none is read and a blocker names them (never an election by name); the
 * Projets contract keeps its onglet + full export pair (election.ts). The
 * perimeter is the COUT PREV export when one came (ADR 030), the Projets
 * onglet when nothing Coût-like came (said as a douteux), none when a
 * Coût-like file is refused (perimeter-source.ts).
 * `year` (default: the config's exercise) is the exercise read — its
 * contracts, COUT PREV year, capacity (ADR 035).
 * Outputs: the report, the parsed tables, the assembled cards (non-null
 * when a perimeter is present) and the blockers. Deterministic for
 * identical inputs and `now`, whatever the order of the files or of the
 * rows of the Coût export. `book` (ADR 062; default: the tool's
 * proposals only) settles the decidable doubts — the same files and the
 * same choices give the same deck.
 * Failure modes: none — unreadable or alien files land in the inventory
 * with a reason, nothing throws.
 */
export function runImportAudit(
  files: InputFile[], config: BoardConfig, now: Date, year: number = config.exercise.year, book: DoubtBook = createDoubtBook({ year }),
): AuditResult {
  // The exercise read: the current one, or another year the caller names (ADR 035).
  const cfg = year === config.exercise.year ? config : { ...config, exercise: { ...config.exercise, year } };
  const report = createReport();
  const blockers = sameNameBlockers(files);
  const nearMisses: NearMiss[] = [];
  const byContract = classifyFiles(files, report, contractsFor(cfg.exercise.year), nearMisses);
  const pick = (id: string): Candidate | null => elect(byContract.get(id) ?? [], blockers);
  const paramBest = pick(PARAM_CONTRACT.id);
  const param = paramBest === null ? null
    : parseParam(paramBest.dataRows, paramBest.match, paramBest.headerCells, cfg, report, paramBest.file.name);
  const perimeter = readPerimeter({ byContract, config: cfg, param, report, blockers, nearMisses, book });
  const projets = perimeter.projets;
  const { jalons, sp, pdc, profils, names } = readSideTables(pick, cfg, report, now, referenceDayOf(byContract, now), book);
  const cdpBest = pick(CDP_CONTRACT.id) ?? secondProjets(perimeter.lender, report) ?? lentOnglet(perimeter, report);
  const cdp = cdpBest === null ? null : parseCdp(cdpBest.dataRows, cdpBest.match, param, report, cdpBest.file.name, book);
  const cards = assembleCards(projets, jalons, sp, cfg, report, book);
  const ownerStats = attachOwners(cards, cdp, report, book);
  book.keepSideDoubts(new Set((cards?.cards ?? []).flatMap((c) => [c.normalizedName, ...(c.codename === null ? [] : [normalizeLabel(c.codename)])])));
  const chargeStats = attachCharges(cards?.cards ?? [], pdc, report, cfg.exercise.year);
  const capacity = buildCapacity(profils, pdc, cards?.cards ?? [], cfg, report, param, perimeter.couts);
  emitMissing(report, presence(byContract, perimeter, cdp !== null), cfg.exercise.year);
  const result: AuditResult = {
    exercise: year, report, param, couts: perimeter.couts, projets, perimeterCheck: perimeter.check, jalons, sp, pdc, profils, cdp,
    cards, ownerStats, chargeStats, capacity,
    sources: {
      couts: perimeter.couts?.fileName ?? null, projets: perimeter.ongletBest?.file.name ?? null,
      param: paramBest?.file.name ?? null, cdp: cdpBest?.file.name ?? null, ...names,
    },
    blockers, book,
  };
  promoteAmbiguous(report);
  emitAssembly(report, result, cfg);
  emitBlockers(report, blockers);
  return result;
}

// Which expected sources came (read, or refused for being several — never
// « manquant » then: the refusal says what to do).
function presence(byContract: ReadonlyMap<string, Candidate[]>, perimeter: Perimeter, cdp: boolean): Parameters<typeof emitMissing>[1] {
  const came = (id: string): boolean => (byContract.get(id)?.length ?? 0) > 0;
  return {
    param: came(PARAM_CONTRACT.id), couts: came(COUTS_CONTRACT.id) || perimeter.coutsRefused, projets: came(PROJETS_CONTRACT.id),
    jalons: came(JALONS_CONTRACT.id), sp: came(SP_CONTRACT.id), pdc: came(PDC_CONTRACT.id), profils: came(PROFILS_CONTRACT.id),
    cdp: cdp || came(CDP_CONTRACT.id),
  };
}

// Every refusal said twice: one douteux per blocker, on the file(s) it
// names, and one assembly line the report opens its verdict with.
function emitBlockers(report: ImportReport, blockers: readonly ImportBlocker[]): void {
  if (blockers.length === 0) return;
  for (const b of blockers) doubt(report, b.files.join(", ") || "dépôt", b.message);
  report.assembly.unshift({ subject: "chargement", status: `refusé — ${blockers.map((b) => b.message).join(" ")}` });
}

interface SideTables {
  jalons: JalonsTable | null;
  sp: SpTable | null;
  pdc: PdcTable | null;
  profils: ProfilsTable | null;
  names: Pick<AuditResult["sources"], "jalons" | "sp" | "pdc" | "profils">;
}

// The tables that enrich the perimeter's cards, each from its elected file
// (elected then read one after the other: the report keeps its order).
// ADR 058: milestone dates are read against the export's day (reference-day.ts).
function readSideTables(
  pick: (id: string) => Candidate | null, cfg: BoardConfig, report: ImportReport, now: Date, reference: ReferenceDay, book: DoubtBook,
): SideTables {
  const jalonsBest = pick(JALONS_CONTRACT.id);
  const jalons = jalonsBest === null ? null
    : parseJalons(jalonsBest.dataRows, jalonsBest.match, cfg, report, jalonsBest.file.name, now, reference, book);
  const spBest = pick(SP_CONTRACT.id);
  const sp = spBest === null ? null : parseSp(spBest.dataRows, spBest.match, report, spBest.file.name, book);
  const pdcBest = pick(PDC_CONTRACT.id);
  const pdc = pdcBest === null ? null : parsePdc(pdcBest.dataRows, pdcBest.match, cfg, report, pdcBest.file.name);
  const profilsBest = pick(PROFILS_CONTRACT.id);
  const profils = profilsBest === null ? null
    : parseProfils(profilsBest.dataRows, profilsBest.match, cfg, report, profilsBest.file.name);
  return {
    jalons, sp, pdc, profils,
    names: {
      jalons: jalonsBest?.file.name ?? null, sp: spBest?.file.name ?? null,
      pdc: pdcBest?.file.name ?? null, profils: profilsBest?.file.name ?? null,
    },
  };
}

// When COUT PREV is the perimeter, a Projets onglet carrying the Responsable
// columns lends its chefs de projet if no ProjetsCdP source came.
function lentOnglet(p: Perimeter, report: ImportReport): Candidate | null {
  if (p.couts === null || p.ongletBest === null || !p.ongletBest.match.columnIndex.has("Responsable 1")) return null;
  warn(report, "lu aussi comme ProjetsCdP (chefs de projet) — le périmètre est COUT PREV", p.ongletBest.file.name);
  return p.ongletBest;
}

// Recognition by header contract (the registry names the PdC column after
// the exercise year); files are visited in name order so the report reads
// the same whatever the drop order (the name never elects, ADR 056).
function classifyFiles(
  files: InputFile[], report: ImportReport, contracts: readonly FileContract[], nearMisses: NearMiss[],
): Map<string, Candidate[]> {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const byContract = new Map<string, Candidate[]>();
  for (const file of sorted) {
    const parsed = processFile(file, report, contracts, nearMisses);
    if (parsed === null) continue;
    const list = byContract.get(parsed.match.contract.id) ?? [];
    list.push({ file, ...parsed });
    byContract.set(parsed.match.contract.id, list);
  }
  return byContract;
}
