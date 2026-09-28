// French wording of the reste à faire read-outs (ADR 048): the class of a
// column, the scope of the métier lens, the persons figure and its divisor,
// the « sans ventilation » note. Pure string building — the figures come
// from core/raf and core/workdays; fr-FR formatting stays in the front.

import type { BoardConfig } from "../core/types.ts";
import { columnsOfClass, type ColumnClass } from "../core/column-class.ts";
import type { RafScope } from "../core/raf-card.ts";
import type { RafSplit } from "../core/raf.ts";
import { fmtNum, fmtUnit } from "./format.ts";

/** The label of a column's reste à faire, by class (author, 2026-09-28). */
export const CLASS_LABEL: Record<ColumnClass, string> = {
  engaged: "RAF engagé",
  idle: "RAF non engagé",
  excluded: "RAF hors calcul",
};

/**
 * The persons figure: j.h ÷ working days, « ≈ 12 pers. » — one decimal
 * below ten persons (a métier's 0,4 must not read « 0 »).
 * Inputs: the reste à faire (j.h), the working days left (null = not the
 * current exercise). Output: the label, or null when there is no divisor.
 * Failure: none.
 */
export function personsLabel(raf: number, days: number | null): string | null {
  if (days === null || days <= 0) return null;
  const persons = raf / days;
  return `≈ ${persons >= 10 ? fmtUnit(persons) : fmtNum(persons)} pers.`;
}

/**
 * The divisor, said once under the headline.
 * Inputs: the working days left, the exercise year. Output: the sentence.
 * Failure: none.
 */
export function divisorLabel(days: number, year: number): string {
  return `j.h ÷ ${days} jours ouvrés restants au 31/12/${year} (fériés déduits, congés non)`;
}

/**
 * The legend of the classes: which columns count as engaged, non engaged,
 * out of count — read from the config, never hardcoded.
 * Input: the config. Output: one line per class holding columns. Failure: none.
 */
export function classLegend(config: BoardConfig): { cls: ColumnClass; text: string }[] {
  const words: Record<ColumnClass, string> = { engaged: "engagé", idle: "non engagé", excluded: "hors calcul" };
  const order: ColumnClass[] = ["engaged", "idle", "excluded"];
  return order
    .map((cls) => ({ cls, names: columnsOfClass(config, cls).map((column) => column.name) }))
    .filter((entry) => entry.names.length > 0)
    .map((entry) => ({ cls: entry.cls, text: `${words[entry.cls]} : ${entry.names.join(" · ")}` }));
}

// The names of the counted métiers, in config order.
function scopeNames(scope: ReadonlySet<string>, config: BoardConfig): string[] {
  return config.profiles.filter((profile) => scope.has(profile.id)).map((profile) => profile.name);
}

/**
 * The scope of the lens in a few words: « tous métiers », « aucun métier »,
 * up to three names in full (« A + B + C » — a supplier domain has three
 * métiers), beyond « A + B + 3 autres ».
 * Inputs: the scope (null = every métier), the config. Output: the label.
 * Failure: none.
 */
export function scopeLabel(scope: RafScope, config: BoardConfig): string {
  if (scope === null) return "tous métiers";
  const names = scopeNames(scope, config);
  if (names.length === 0) return "aucun métier";
  if (names.length <= 3) return names.join(" + ");
  const rest = names.length - 2;
  return `${names[0]} + ${names[1]} + ${rest} autre${rest > 1 ? "s" : ""}`;
}

/**
 * The full list of the counted métiers, for a tooltip.
 * Inputs: the scope, the config. Output: the sentence. Failure: none.
 */
export function scopeTitle(scope: RafScope, config: BoardConfig): string {
  if (scope === null) return "RAF compté sur tous les métiers";
  const names = scopeNames(scope, config);
  return names.length === 0 ? "Aucun métier compté" : `RAF compté sur : ${names.join(", ")}`;
}

/**
 * What a canal's reste à faire leaves out: the out-of-count columns.
 * Input: the config. Output: « RAF hors Terminé · En exploitation », or ""
 * when no column is out of count. Failure: none.
 */
export function laneRafNote(config: BoardConfig): string {
  const names = columnsOfClass(config, "excluded").map((column) => column.name);
  return names.length === 0 ? "" : `RAF hors ${names.join(" · ")}`;
}

/**
 * The « sans ventilation » note: the engaged cards without a per-métier
 * plan (they count in no reste à faire), then the others in a word.
 * Input: the split. Output: the note, or null when every card has a plan.
 * Failure: none.
 */
export function blindNote(split: RafSplit): string | null {
  const { blindEngaged: engaged, blindOther: other } = split;
  if (engaged === 0 && other === 0) return null;
  const s = engaged > 1 ? "s" : "";
  const head = `${engaged} sujet${s} engagé${s} sans ventilation par métier (non compté${s})`;
  return other === 0 ? head : `${head} · ${other} ailleurs`;
}
