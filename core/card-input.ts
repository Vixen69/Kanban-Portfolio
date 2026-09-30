// What a hand may enter on a card (ADR 057): the text caps the middle
// enforces and the form inputs mirror (maxLength), the decimal reading of
// a typed day count, and the check of a custom field value against its
// declaration. One source for both sides, so a value the form lets
// through is a value the server accepts. Pure: no React, no Node APIs.

import { isIsoDate } from "./decisions.ts";
import type { FieldDef } from "./config-types.ts";

/**
 * Length caps of the card's free-text fields. The card_events log is
 * permanent, so every text is bounded; the forms carry the same caps as
 * maxLength so an over-long value can never make a whole save fail.
 */
export const CARD_TEXT_LIMITS = {
  title: 200,
  owner: 120,
  codename: 40,
  loadPlan: 200,
  notes: 5000,
  /** One entry of a list field (resources, tags, alerts). */
  listItem: 200,
  customText: 500,
  riskDesc: 500,
  contentionNote: 2000,
  blockReason: 500,
  comment: 2000,
} as const;

/**
 * Reads a typed amount (j.h or k€), accepting a comma or a dot as the
 * decimal separator.
 * Input: the raw text. Output: the finite number ≥ 0, or null when the
 * text is blank, not a number, or negative. Failure: none.
 */
export function parseAmount(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Whether a value fits a declared custom field: a number field takes a
 * finite number, a select one of its option labels, a date a real
 * YYYY-MM-DD day, a checkbox a boolean, a text or person field a string
 * of at most 500 characters. null (emptied) always fits.
 * Inputs: the field declaration, the value. Output: true when it fits.
 * Failure: none.
 */
export function customValueFits(field: FieldDef, value: unknown): boolean {
  if (value === null) return true;
  switch (field.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "select":
      return typeof value === "string" && (field.options ?? []).some((option) => option.label === value);
    case "date":
      return typeof value === "string" && isIsoDate(value);
    case "checkbox":
      return typeof value === "boolean";
    default:
      return typeof value === "string" && value.length <= CARD_TEXT_LIMITS.customText;
  }
}
