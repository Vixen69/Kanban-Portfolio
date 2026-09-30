// An Id on several rows of ProjetsJalons (split from jalons.ts, 300-line
// cap). ADR 058: a milestone passed on ANY of its rows is passed — the most
// advanced stage wins, whatever the rows' order. ADR 062: when the rows
// read different stages, it is a « Doute à trancher »: the merge (the
// tool's proposal) or one row's own milestones. Pure.

import { askOrPropose } from "./doubt-book.ts";
import type { DoubtBook, DoubtOptionSpec } from "./doubt-book.ts";
import { doubt } from "./report.ts";
import type { ImportReport } from "./report.ts";

/** The stage a project reached, in the flow's own words. */
export type Stage = "done" | "actifs" | "etudes" | "entree";

/** The three milestones of one row. */
export interface Milestones {
  rdo: boolean;
  rdli: boolean;
  rdr: boolean;
}

/** One row of a duplicated Id: its milestones and its line. */
export interface JalonRow {
  milestones: Milestones;
  line: number;
}

/** The entry a duplicated Id settles (jalons.ts JalonEntry, the fields this module sets). */
export interface SettledEntry extends Milestones {
  id: string;
  name: string;
  normalizedName: string;
  stage: Stage;
  columnId: string;
}

/** What the settlement needs of the reader. */
export interface DuplicateJalons {
  report: ImportReport;
  fileName: string;
  stageColumns: Record<Stage, string>;
  columnNames: ReadonlyMap<string, string>;
  book: DoubtBook | undefined;
}

const STAGE_LABEL: Record<Stage, string> = { entree: "entrée", etudes: "Études", actifs: "Actifs", done: "Terminé" };

/**
 * The last milestone passed decides the stage (ordered rule).
 * Input: the milestones. Output: the stage. Failure modes: none.
 */
export function stageOf(m: Milestones): Stage {
  return m.rdr ? "done" : m.rdli ? "actifs" : m.rdo ? "etudes" : "entree";
}

const bits = (m: Milestones): string => [m.rdo, m.rdli, m.rdr].map((b) => (b ? "1" : "0")).join("");
const mark = (m: Milestones): string => `RDO ${m.rdo ? "✓" : "✗"}, RDLI ${m.rdli ? "✓" : "✗"}, RDR ${m.rdr ? "✓" : "✗"}`;

function merged(rows: readonly JalonRow[]): Milestones {
  return {
    rdo: rows.some((r) => r.milestones.rdo), rdli: rows.some((r) => r.milestones.rdli), rdr: rows.some((r) => r.milestones.rdr),
  };
}

function column(ctx: DuplicateJalons, m: Milestones): string {
  const id = ctx.stageColumns[stageOf(m)];
  return `carte en « ${ctx.columnNames.get(id) ?? id} »`;
}

// The options: the merge first, then each row whose milestones differ from it.
function options(ctx: DuplicateJalons, rows: readonly JalonRow[], fusion: Milestones): { specs: DoubtOptionSpec[]; byId: Map<string, Milestones> } {
  const byId = new Map<string, Milestones>([["fusion", fusion]]);
  const specs: DoubtOptionSpec[] = [{
    id: "fusion", label: `La plus avancée de ses lignes : ${STAGE_LABEL[stageOf(fusion)]} (${mark(fusion)})`, consequence: column(ctx, fusion),
  }];
  for (const row of [...rows].sort((a, b) => a.line - b.line)) {
    const id = `m:${bits(row.milestones)}`;
    if (byId.has(id) || bits(row.milestones) === bits(fusion)) continue;
    byId.set(id, row.milestones);
    specs.push({ id, label: `La ligne ${row.line} seule : ${STAGE_LABEL[stageOf(row.milestones)]} (${mark(row.milestones)})`, consequence: column(ctx, row.milestones) });
  }
  return { specs, byId };
}

/**
 * Settles one duplicated Id: the merge, or the row the PMO chose; the
 * entry's milestones, stage and column are set, and the douteux written.
 * Inputs: the reader's context, the entry (first row's), all its rows.
 * Output: none (mutates the entry and the report). Failure modes: none.
 */
export function settleDuplicate(ctx: DuplicateJalons, entry: SettledEntry, rows: readonly JalonRow[]): void {
  const fusion = merged(rows);
  const { specs, byId } = options(ctx, rows, fusion);
  const applied = askOrPropose(ctx.book, {
    kind: "duplicate-row", detail: "jalons", code: entry.id, name: entry.normalizedName, title: entry.name,
    why: `L'Id « ${entry.id} » est sur ${rows.length} lignes de ProjetsJalons qui ne lisent pas la même étape. ` +
      "L'outil retient la plus avancée (un jalon franchi sur une ligne est franchi).",
    options: specs, proposed: "fusion", joinKeys: [entry.id, entry.normalizedName],
  });
  const chosen = byId.get(applied) ?? fusion;
  Object.assign(entry, chosen);
  entry.stage = stageOf(chosen);
  entry.columnId = ctx.stageColumns[entry.stage];
  const read = [...new Set(rows.map((r) => stageOf(r.milestones)))].map((s) => STAGE_LABEL[s]).join(", ");
  const lines = rows.map((r) => r.line).sort((a, b) => a - b).join(", ");
  doubt(ctx.report, ctx.fileName,
    `Id « ${entry.id} » en double (lignes ${lines}) — étapes lues : ${read} — ` +
      (applied === "fusion" ? "la plus avancée retenue" : `tranché à l'import : ${specs.find((s) => s.id === applied)?.label ?? applied}`),
    { ref: { file: ctx.fileName, line: rows[rows.length - 1]?.line ?? 0 } });
}
