// Per-field validators of an "edited" patch, closed over the runtime config
// so referential fields (domain, typeId, profiles, risk types, project
// constraints) must point at existing topology. Split from middle/api.ts to
// respect the 300-line file cap; foldEvents re-checks types on read
// (core/state.ts), so this layer only keeps junk out of the permanent log.
// The same checks screen the optional facts of a creation (ADR 057).

import type { BoardConfig, Criticality, CustomValue } from "../core/types.ts";
import { CARD_TEXT_LIMITS as CAP, customValueFits } from "../core/card-input.ts";
import { isIsoDate } from "../core/decisions.ts";
import { EDITABLE_FIELDS } from "../core/state.ts";
import { BadRequest } from "./errors.ts";

/**
 * True when the value is one of the fixed criticality keys.
 * Input: any value. Output: a Criticality type guard result. Failure: none.
 */
export function isCriticality(value: unknown): value is Criticality {
  return value === "top" || value === "major" || value === "normal";
}

// Small structural predicates reused across the patch validators. Every
// free-text field is capped: the card_events log is permanent (never
// updated, never deleted), so unbounded strings would poison it forever —
// the caps are core/card-input.ts's, mirrored by the forms' maxLength
// (ADR 057).
const amountOrNull = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const boundedText = (max: number) => (v: unknown) =>
  typeof v === "string" && v.length <= max;
const boundedTextOrNull = (max: number) => (v: unknown) =>
  v === null || (typeof v === "string" && v.length <= max);
const stringArray = (v: unknown) =>
  Array.isArray(v) && v.length <= 100 && v.every((item) => typeof item === "string" && item.length <= CAP.listItem);
const nonNegNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
// A calendar day YYYY-MM-DD, as the import writes it (ADR 057); the fold
// still reads the full timestamps older screens stored.
const isoDayOrNull = (v: unknown) => v === null || (typeof v === "string" && isIsoDate(v));
const isPlainObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Config-aware validators for the design-v10 detail fields: referential ids
// (profiles, risk types, project constraints) must point at existing topology.
function designV10Validators(config: BoardConfig): Record<string, (v: unknown) => boolean> {
  const profileIds = new Set(config.profiles.map((p) => p.id));
  const riskIds = new Set(config.riskTypes.map((r) => r.id));
  const constraintIds = new Set(config.projectConstraints.map((c) => c.id));
  return {
    budgetEngaged: amountOrNull,
    budgetRdli: amountOrNull,
    contentionNote: boundedText(CAP.contentionNote),
    contentionProfiles: (v) => stringArray(v) && (v as string[]).every((id) => profileIds.has(id)),
    projectConstraints: (v) => stringArray(v) && (v as string[]).every((id) => constraintIds.has(id)),
    alerts: stringArray,
    dateRdr: isoDayOrNull,
    chargeByProfile: (v) => Array.isArray(v) && v.length <= 100 && v.every((e) =>
      isPlainObj(e) && profileIds.has(e.profileId as string) && nonNegNumber(e.jh) && nonNegNumber(e.done)),
    risks: (v) => Array.isArray(v) && v.length <= 100 && v.every((r) =>
      isPlainObj(r) && riskIds.has(r.type as string) && boundedText(CAP.riskDesc)(r.desc)),
  };
}

/**
 * Per-field acceptance map for an "edited" patch, closed over the runtime
 * config. Input: the board config. Output: field name → predicate.
 * Failure: none.
 */
export function patchValidators(config: BoardConfig): Record<string, (value: unknown) => boolean> {
  const customValue = (v: unknown): v is CustomValue =>
    v === null || (typeof v === "string" && v.length <= CAP.customText) || typeof v === "boolean" ||
    (typeof v === "number" && Number.isFinite(v));
  return {
    title: (v) => typeof v === "string" && v.trim().length > 0 && v.length <= CAP.title,
    owner: boundedText(CAP.owner),
    domain: (v) => typeof v === "string" && config.domains.some((d) => d.id === v),
    // Any declared sub-domain id passes here; validatePatch then checks it
    // against the card's OWN domain (ADR 057). The fold keeps a sub-domain
    // only while its (current) domain declares it (config-derive, ADR 022).
    subDomain: (v) => v === null || (typeof v === "string" &&
      config.domains.some((d) => (d.subDomains ?? []).some((s) => s.id === v))),
    criticality: isCriticality,
    typeId: (v) => v === null || (typeof v === "string" && config.types.some((t) => t.id === v)),
    codename: boundedTextOrNull(CAP.codename),
    exercise: (v) => typeof v === "number" && Number.isInteger(v) && v >= 2000 && v <= 2100,
    tags: stringArray,
    effortEstimated: amountOrNull,
    effortConsumed: amountOrNull,
    budgetEstimated: amountOrNull,
    budgetConsumed: amountOrNull,
    loadPlan: boundedTextOrNull(CAP.loadPlan),
    resources: stringArray,
    notes: boundedText(CAP.notes),
    ...designV10Validators(config),
    custom: (v) =>
      typeof v === "object" && v !== null && !Array.isArray(v) &&
      Object.values(v).every(customValue),
  };
}

/** What a patch is checked against: the card's domain and custom values before it (none at creation). */
export interface PatchContext {
  domain: string;
  custom: Record<string, CustomValue>;
}

// A sub-domain must belong to the card's own domain — the patched one when
// the same patch changes it (ADR 057; before, any declared id passed).
function checkSubDomain(config: BoardConfig, fields: Record<string, unknown>, card: PatchContext): void {
  const sub = fields["subDomain"];
  if (typeof sub !== "string") return;
  const domainId = typeof fields["domain"] === "string" ? fields["domain"] : card.domain;
  const domain = config.domains.find((d) => d.id === domainId);
  if (!(domain?.subDomains ?? []).some((s) => s.id === sub)) {
    throw new BadRequest(`Sous-domaine « ${sub} » hors du domaine « ${domain?.name ?? domainId} ».`);
  }
}

// Every custom entry must be a declared field holding a value of its type
// (core/card-input.ts customValueFits). An entry the card already holds
// unchanged passes as it is — a field removed from the config, or a value
// typed before this check existed, must not make an unrelated save fail.
function checkCustom(config: BoardConfig, fields: Record<string, unknown>, card: PatchContext): void {
  const custom = fields["custom"];
  if (!isPlainObj(custom)) return;
  for (const [key, value] of Object.entries(custom)) {
    if (Object.prototype.hasOwnProperty.call(card.custom, key) && card.custom[key] === value) continue;
    const field = config.fields.find((f) => f.id === key);
    if (!field) throw new BadRequest(`Champ personnalisé inconnu : « ${key} ».`);
    if (!customValueFits(field, value)) throw new BadRequest(`Valeur invalide pour le champ « ${field.name} ».`);
  }
}

/**
 * Screens a patch of card fields — an "edited" intent, or the optional
 * facts of a creation (ADR 057): whitelisted keys only, each value valid
 * for its field, the sub-domain inside the card's own domain, the custom
 * values declared and typed per config.fields.
 * Inputs: the runtime config, the patch fields, the card context, the
 * French words that open a refusal of an unknown key.
 * Output: none. Failure: throws BadRequest (French) at the first refusal.
 */
export function validatePatch(
  config: BoardConfig,
  fields: Record<string, unknown>,
  card: PatchContext,
  refusal: string,
): void {
  const allowed = new Set(EDITABLE_FIELDS);
  const validators = patchValidators(config);
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key)) throw new BadRequest(`${refusal} : « ${key} ».`);
    const accepts = validators[key];
    if (!accepts || !accepts(fields[key])) {
      throw new BadRequest(`Valeur invalide pour le champ « ${key} ».`);
    }
  }
  checkSubDomain(config, fields, card);
  checkCustom(config, fields, card);
}

/**
 * The exercise year a request names (body field or query string), or the
 * current one when absent (ADR 035).
 * Inputs: the raw value (number, numeric string, or undefined/empty), the
 * runtime config. Output: the year. Failure: BadRequest (French) when the
 * value is not a whole year between 2000 and 2100.
 */
export function exerciseOrCurrent(raw: unknown, config: BoardConfig): number {
  if (raw === undefined || raw === null || raw === "") return config.exercise.year;
  const year = typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : raw;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new BadRequest("Exercice invalide.");
  }
  return year;
}
