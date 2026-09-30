// The card facts a form types as text (ADR 057): efforts, budgets, date
// RDR, plan de charge label, ressources — shared by « Modifier » (CardEdit)
// and the folded « Plus d'informations » block of « + Sujet » (QuickAdd),
// so both read and write them the same way. Pure: no React, no network.

import type { Card, CardPatch } from "../core/types.ts";
import { parseAmount } from "../core/card-input.ts";
import type { CreationFacts } from "./api.ts";

/** The effort / budget / date / plan / ressources inputs, as typed text. */
export interface EffortDraft {
  effortEstimated: string;
  effortConsumed: string;
  loadPlan: string;
  resourcesCsv: string;
  /** YYYY-MM-DD, as the date input gives it; "" = none. */
  dateRdr: string;
  budgetEstimated: string;
  budgetConsumed: string;
  budgetRdli: string;
  budgetEngaged: string;
}

/** The QuickAdd facts: the effort grid plus the code and the sub-domain. */
export interface FactsDraft extends EffortDraft {
  codename: string;
  /** "" = not detailed. */
  subDomain: string;
}

/** An untouched QuickAdd facts block: every input empty. */
export const EMPTY_FACTS: FactsDraft = {
  codename: "", subDomain: "", effortEstimated: "", effortConsumed: "", loadPlan: "", resourcesCsv: "",
  dateRdr: "", budgetEstimated: "", budgetConsumed: "", budgetRdli: "", budgetEngaged: "",
};

function numText(value: number | null): string {
  return value === null ? "" : String(value);
}

/**
 * The effort inputs of a card, as text. The date keeps its day only: an
 * older screen stored a full timestamp, the day is what the input edits.
 * Input: the card. Output: the EffortDraft. Failure: none.
 */
export function effortDraftOf(card: Card): EffortDraft {
  return {
    effortEstimated: numText(card.effortEstimated), effortConsumed: numText(card.effortConsumed),
    loadPlan: card.loadPlan ?? "", resourcesCsv: card.resources.join(", "),
    dateRdr: card.dateRdr === null ? "" : card.dateRdr.slice(0, 10),
    budgetEstimated: numText(card.budgetEstimated), budgetConsumed: numText(card.budgetConsumed),
    budgetRdli: numText(card.budgetRdli), budgetEngaged: numText(card.budgetEngaged),
  };
}

/**
 * The effort inputs as card fields: an emptied or unreadable amount is
 * null (never 0), the date is sent as its day YYYY-MM-DD (what the middle
 * accepts, ADR 057), the ressources are split on commas.
 * Input: the EffortDraft. Output: the matching CardPatch fields.
 * Failure: none.
 */
export function effortPatchOf(draft: EffortDraft): CardPatch {
  return {
    effortEstimated: parseAmount(draft.effortEstimated), effortConsumed: parseAmount(draft.effortConsumed),
    budgetEstimated: parseAmount(draft.budgetEstimated), budgetConsumed: parseAmount(draft.budgetConsumed),
    budgetRdli: parseAmount(draft.budgetRdli), budgetEngaged: parseAmount(draft.budgetEngaged),
    dateRdr: draft.dateRdr === "" ? null : draft.dateRdr.slice(0, 10),
    loadPlan: draft.loadPlan.trim() === "" ? null : draft.loadPlan.trim(),
    resources: draft.resourcesCsv.split(",").map((entry) => entry.trim()).filter(Boolean),
  };
}

/**
 * The facts a creation sends: only what was typed — an empty input is left
 * out, the server keeps its empty default (ADR 057).
 * Input: the FactsDraft. Output: the CreationFacts to spread into the
 * creation intent. Failure: none.
 */
export function creationFactsOf(draft: FactsDraft): CreationFacts {
  const facts: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(effortPatchOf(draft))) {
    if (value !== null && !(Array.isArray(value) && value.length === 0)) facts[key] = value;
  }
  if (draft.codename.trim() !== "") facts["codename"] = draft.codename.trim();
  if (draft.subDomain !== "") facts["subDomain"] = draft.subDomain;
  return facts as CreationFacts;
}
