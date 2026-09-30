// The files part of the readable import report (ADR 055): for each
// expected source, the received file read for it — or what the load does
// without it, in the PMO's words (ADR 054: a missing source keeps the
// board's values, it never erases them) — or why the load is refused
// (ADR 056: two files of one kind, a Coût-like file not recognized).
// Built from the audit's inventory, the files it read and its blockers.
// Pure.

import type { ImportFileEntry, ImportFileStatus, ImportSource, ImportUnrecognized } from "../../core/import-types.ts";
import {
  CDP_CONTRACT, COUTS_CONTRACT, JALONS_CONTRACT, PARAM_CONTRACT, PDC_CONTRACT, PROFILS_CONTRACT, PROJETS_CONTRACT,
  RDOM_CONTRACT, SP_CONTRACT,
} from "./contract.ts";
import type { AuditResult } from "./orchestrate.ts";
import type { FileInventoryEntry } from "./report.ts";

interface SourceSpec {
  source: ImportSource;
  label: string;
  /** The contracts whose files serve it (a retired one lands here as « écarté »). */
  contracts: readonly string[];
  /** What the load does without it. */
  missing: (sources: AuditResult["sources"]) => string;
}

const NO_PERIMETER = "aucun périmètre — chargement impossible";

const SPECS: readonly SourceSpec[] = [
  {
    source: "couts", label: "Coût prévisionnel (COUT PREV)", contracts: [COUTS_CONTRACT.id],
    missing: (s) => (s.projets === null ? NO_PERIMETER : "périmètre lu dans l’onglet Projets (ADR 030)"),
  },
  {
    source: "param", label: "PARAM", contracts: [PARAM_CONTRACT.id, RDOM_CONTRACT.id],
    missing: () => "responsables de domaine non exclus du chef de projet ; chemins d’organisation non traduits",
  },
  {
    source: "projets", label: "Projets", contracts: [PROJETS_CONTRACT.id],
    missing: (s) => (s.couts === null ? NO_PERIMETER : "facultatif — le périmètre est COUT PREV (pas de recoupement)"),
  },
  { source: "cdp", label: "ProjetsCdP", contracts: [CDP_CONTRACT.id], missing: () => "chefs de projet gardés" },
  {
    source: "jalons", label: "ProjetsJalons", contracts: [JALONS_CONTRACT.id],
    missing: () => "positions gardées (les nouvelles cartes entrent en première colonne)",
  },
  { source: "sp", label: "SP (exercice ou total)", contracts: [SP_CONTRACT.id], missing: () => "budgets gardés (estimé, engagé, réalisé k€)" },
  { source: "pdc", label: "Ressources_PdC", contracts: [PDC_CONTRACT.id], missing: () => "plan de charge et capacité gardés" },
  { source: "profils", label: "Ress.Profils", contracts: [PROFILS_CONTRACT.id], missing: () => "facultatif — rien ne change" },
];

// The role of a taken file when it is not the obvious one, and its
// tolerated header drift.
function takenNote(spec: SourceSpec, taken: FileInventoryEntry | undefined, sources: AuditResult["sources"], refused: boolean): string | null {
  const notes: string[] = [];
  if (spec.source === "projets" && sources.couts !== null) notes.push("recoupement seulement — le périmètre est COUT PREV");
  if (spec.source === "projets" && refused) notes.push("non utilisé comme périmètre : l’export Coût est refusé");
  if (spec.source === "cdp" && taken?.contractId === PROJETS_CONTRACT.id) notes.push("chefs de projet lus dans un export Projets");
  if (taken?.status === "recognized-with-deviations" && taken.detail !== undefined) notes.push(`en-têtes à écarts : ${folded(taken.detail)}`);
  return notes.length === 0 ? null : notes.join(" ; ");
}

// The same header deviation said once with its count (« colonne en trop
// « (colonne vide) » ×8 »).
function folded(detail: string): string {
  const counts = new Map<string, number>();
  for (const part of detail.split(" ; ")) counts.set(part, (counts.get(part) ?? 0) + 1);
  return [...counts].map(([part, n]) => (n === 1 ? part : `${part} ×${n}`)).join(" ; ");
}

// A source without a taken file: « douteux » when a near miss came,
// « écarté » when only an old format came, else « absent ».
function untaken(spec: SourceSpec, mine: FileInventoryEntry[], sources: AuditResult["sources"]): Pick<ImportFileEntry, "status" | "consequence"> {
  const near = mine.find((entry) => entry.status === "near-miss");
  const retired = mine.find((entry) => entry.status === "retired");
  const status: ImportFileStatus = near !== undefined ? "douteux" : retired !== undefined ? "écarté" : "absent";
  const why = near !== undefined ? ` — « ${near.name} » y ressemble mais n’a pas été lu (colonnes manquantes)`
    : retired !== undefined ? ` — « ${retired.name} » : ${retired.detail ?? "ancien format, non lu"}` : "";
  return { status, consequence: `${spec.missing(sources)}${why}` };
}

/**
 * One entry per expected source, in ImportSource order, and the received
 * files that serve none.
 * Input: the audit. Output: the files part of ImportChanges.
 * Failure modes: none.
 */
export function importFiles(audit: AuditResult): { files: ImportFileEntry[]; unrecognized: ImportUnrecognized[] } {
  const { inventory } = audit.report;
  const takenNames = new Set(Object.values(audit.sources).filter((name): name is string => name !== null));
  const coutsRefused = audit.blockers.some((b) => b.source === "couts");
  const files = SPECS.map((spec): ImportFileEntry => {
    const file = audit.sources[spec.source];
    const mine = inventory.filter((entry) => entry.contractId !== undefined && spec.contracts.includes(entry.contractId));
    const others = mine.filter((entry) => !takenNames.has(entry.name)).map((entry) => entry.name);
    const refusal = audit.blockers.filter((b) => b.source === spec.source);
    if (refusal.length > 0) {
      const named = [...new Set([...others, ...refusal.flatMap((b) => b.files)])];
      const consequence = `chargement refusé — ${refusal.map((b) => b.message).join(" ")}`;
      return { source: spec.source, label: spec.label, file: null, status: "douteux", consequence, others: named };
    }
    if (file === null) return { source: spec.source, label: spec.label, file, others, ...untaken(spec, mine, audit.sources) };
    const taken = inventory.find((entry) => entry.name === file);
    const consequence = takenNote(spec, taken, audit.sources, coutsRefused);
    return { source: spec.source, label: spec.label, file, status: "pris", consequence, others };
  });
  const served = new Set(SPECS.flatMap((spec) => spec.contracts));
  const unrecognized = inventory
    .filter((entry) => entry.contractId === undefined || !served.has(entry.contractId))
    .map((entry) => ({ file: entry.name, detail: entry.detail ?? unrecognizedDetail(entry.status) }));
  return { files, unrecognized };
}

function unrecognizedDetail(status: FileInventoryEntry["status"]): string {
  if (status === "not-csv") return "pas un fichier CSV";
  if (status === "unsupported") return "format non pris en charge";
  return "aucun fichier attendu ne lui correspond";
}
