// Per-field validators of an "edited" patch, closed over the runtime config
// so referential fields (domain, typeId, profiles, risk types, project
// constraints) must point at existing topology. Split from middle/api.ts to
// respect the 300-line file cap; foldEvents re-checks types on read
// (core/state.ts), so this layer only keeps junk out of the permanent log.

import type { BoardConfig, Criticality, CustomValue } from "../core/types.ts";

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
// the caps mirror the creation route's (title 200, owner 120) and stay
// generous elsewhere.
const amountOrNull = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const boundedText = (max: number) => (v: unknown) =>
  typeof v === "string" && v.length <= max;
const boundedTextOrNull = (max: number) => (v: unknown) =>
  v === null || (typeof v === "string" && v.length <= max);
const stringArray = (v: unknown) =>
  Array.isArray(v) && v.length <= 100 && v.every((item) => typeof item === "string" && item.length <= 200);
const nonNegNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
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
    contentionNote: boundedText(2000),
    contentionProfiles: (v) => stringArray(v) && (v as string[]).every((id) => profileIds.has(id)),
    projectConstraints: (v) => stringArray(v) && (v as string[]).every((id) => constraintIds.has(id)),
    alerts: stringArray,
    dateRdr: boundedTextOrNull(40),
    chargeByProfile: (v) => Array.isArray(v) && v.length <= 100 && v.every((e) =>
      isPlainObj(e) && profileIds.has(e.profileId as string) && nonNegNumber(e.jh) && nonNegNumber(e.done)),
    risks: (v) => Array.isArray(v) && v.length <= 100 && v.every((r) =>
      isPlainObj(r) && riskIds.has(r.type as string) && boundedText(500)(r.desc)),
  };
}

/**
 * Per-field acceptance map for an "edited" patch, closed over the runtime
 * config. Input: the board config. Output: field name → predicate.
 * Failure: none.
 */
export function patchValidators(config: BoardConfig): Record<string, (value: unknown) => boolean> {
  const customValue = (v: unknown): v is CustomValue =>
    v === null || (typeof v === "string" && v.length <= 500) || typeof v === "boolean" ||
    (typeof v === "number" && Number.isFinite(v));
  return {
    title: (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 200,
    owner: boundedText(120),
    domain: (v) => typeof v === "string" && config.domains.some((d) => d.id === v),
    criticality: isCriticality,
    typeId: (v) => v === null || (typeof v === "string" && config.types.some((t) => t.id === v)),
    codename: boundedTextOrNull(40),
    tags: stringArray,
    effortEstimated: amountOrNull,
    effortConsumed: amountOrNull,
    budgetEstimated: amountOrNull,
    budgetConsumed: amountOrNull,
    loadPlan: boundedTextOrNull(200),
    resources: stringArray,
    notes: boundedText(5000),
    ...designV10Validators(config),
    custom: (v) =>
      typeof v === "object" && v !== null && !Array.isArray(v) &&
      Object.values(v).every(customValue),
  };
}
