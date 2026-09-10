// Per-domain capacity lines of the assembly read-out (ADR 029): for each
// board domain, how many nominative persons the plan de charge places in
// it, internal and external, their capacity, planned load, board demand,
// free days and overload — so a reader sees where a domain's headcount
// comes from without a single name leaving the machine.

import type { BoardConfig } from "../../core/types.ts";
import { loadByGroup } from "../../core/capacity.ts";
import type { GroupLoad } from "../../core/capacity.ts";
import type { CapacityBuild } from "./capacity.ts";
import { formatJh } from "./charges.ts";
import type { ImportReport } from "./report.ts";

/** Persons outside every board domain gather under this key. */
const OUTSIDE = "?";

function domainLine(g: GroupLoad): string {
  const capacity = `capacité ${formatJh(g.capacityJh)} j.h` +
    (g.withoutCapacity > 0 ? ` (${g.withoutCapacity} sans ligne « Disponible »)` : "");
  return `${g.persons} personne(s) (${g.internal.persons} interne(s) · ${g.external.persons} externe(s))` +
    ` · ${capacity} · projeté ${formatJh(g.plannedJh)} j.h · demande du tableau ${formatJh(g.demandJh)} j.h` +
    ` · libre ${formatJh(g.freeJh)} j.h · surcharge ${formatJh(g.overJh)} j.h`;
}

/**
 * Appends one « capacité · <domaine> » line per board domain that holds
 * persons (config order), then « sans domaine » when some remain.
 * Inputs: the report, the capacity build, the board config.
 * Outputs: none (mutates the report). Failure modes: none.
 */
export function emitCapacityByDomain(report: ImportReport, build: CapacityBuild, config: BoardConfig): void {
  const groups = new Map(loadByGroup(build.snapshot, (p) => p.domain ?? OUTSIDE).map((g) => [g.key, g]));
  const names: Array<[string, string]> = [...config.domains.map((d): [string, string] => [d.id, d.name]), [OUTSIDE, "sans domaine"]];
  for (const [id, name] of names) {
    const g = groups.get(id);
    if (g === undefined || g.persons === 0) continue;
    report.assembly.push({ subject: `capacité · ${name}`, status: domainLine(g) });
  }
}
