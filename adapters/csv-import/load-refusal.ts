// Why a load of the audited files would be refused — ONE rule for the
// tool's audit, the tool's load and the CLI, so an audit never previews as
// loadable a load that would then be refused (the preview used to read
// « rien ne changera » for the files of another year, then the load
// answered 400). Pure.

import type { AuditResult } from "./orchestrate.ts";

/**
 * The reason a load into one exercise would be refused, in plain French,
 * or null when it may write: a closed exercise (below the current one,
 * ADR 035), files that block (ADR 056: two files of one kind, one name
 * twice, a Coût-like file not recognized), no perimeter at all, or no
 * project retained on that year — the files of another exercise. An empty
 * deck is refused BEFORE anything could be marked absent.
 * Inputs: the audit (its blockers and assembled cards), the exercise year
 * loaded, the current exercise year. Output: the reason or null.
 * Failure modes: none.
 */
export function loadRefusal(audit: Pick<AuditResult, "blockers" | "cards">, year: number, currentYear: number): string | null {
  if (year < currentYear) return `Exercice ${year} clos : chargement refusé.`;
  if (audit.blockers.length > 0) return `Chargement refusé : ${audit.blockers.map((b) => b.message).join(" ")}`;
  if (audit.cards === null) return "Chargement refusé : aucune carte assemblée (le fichier « projets » manque ?).";
  if (audit.cards.cards.length === 0) {
    return `Chargement refusé : aucun projet retenu pour l’exercice ${year} (fichiers d’une autre année ?).`;
  }
  return null;
}
