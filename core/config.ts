// Validation of the board topology and vocabulary (config/board.json and the
// runtime overrides applied from the admin panel, ADR 013). Topology,
// vocabulary and thresholds are the ONLY configurable surface; behavior
// stays hard-coded.

import type {
  AgeThresholds, BoardConfig, Column, CriticalityStyle, Domain,
  FieldDef, FieldOption, FieldType, GateCode, GateDef, Lane, NatureKey,
  NatureStyle, RiskSeverityStyle, RoleFamily,
} from "./types.ts";
import {
  fail, isRecord, optionalText, parseKeyed, parseNonEmptyArray,
  requireExactKeys, requireRecord, requireText, uniqueIds,
} from "./config-parse.ts";

export { ConfigError } from "./config-parse.ts";
export { laneNature, reconcileCardRefs } from "./config-derive.ts";

const NATURE_KEYS = ["simple", "complicated", "complex"] as const;
const CRITICALITY_KEYS = ["top", "major", "normal"] as const;
const GATE_CODES: readonly GateCode[] = ["DoR", "DoD"];
const FIELD_TYPES: readonly FieldType[] = ["text", "number", "date", "select", "checkbox", "person"];
const AGE_KEYS = ["freshMaxDays", "recentMaxDays", "agingMaxDays"] as const;
const RISK_SEVERITY_KEYS = ["faible", "moyen", "eleve"] as const;

// natureKey: one of the three fixed keys; absent defaults to "complicated"
// (back-compat with runtime overrides stored before design v11).
function parseNatureKey(value: unknown, path: string): NatureKey {
  if (value === undefined) return "complicated";
  if (value === "simple" || value === "complicated" || value === "complex") return value;
  fail(`${path} doit valoir "simple", "complicated" ou "complex"`);
}

function parseLane(value: unknown, index: number): Lane {
  const record = requireRecord(value, `lanes[${index}]`);
  return {
    id: requireText(record.id, `lanes[${index}].id`),
    name: requireText(record.name, `lanes[${index}].name`),
    nature: optionalText(record.nature, `lanes[${index}].nature`),
    natureKey: parseNatureKey(record.natureKey, `lanes[${index}].natureKey`),
    detail: optionalText(record.detail, `lanes[${index}].detail`),
  };
}

function parseWip(value: unknown, path: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    fail(`${path} doit être null ou un entier ≥ 1`);
  }
  return value;
}

function parseGate(value: unknown, path: string): GateCode | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !(GATE_CODES as readonly string[]).includes(value)) {
    fail(`${path} doit être « DoR », « DoD » ou null`);
  }
  return value as GateCode;
}

function parseColumn(value: unknown, index: number): Column {
  const record = requireRecord(value, `columns[${index}]`);
  const column: Column = {
    id: requireText(record.id, `columns[${index}].id`),
    name: requireText(record.name, `columns[${index}].name`),
    wip: parseWip(record.wip, `columns[${index}].wip`),
    gate: parseGate(record.gate, `columns[${index}].gate`),
    note: optionalText(record.note, `columns[${index}].note`),
  };
  if (record.hasBlockedZone !== undefined) {
    if (typeof record.hasBlockedZone !== "boolean") {
      fail(`columns[${index}].hasBlockedZone doit être un booléen`);
    }
    column.hasBlockedZone = record.hasBlockedZone;
  }
  return column;
}

// Domains and project types share the same shape (id/name/short/color).
function parseColored(value: unknown, kind: string, index: number): Domain {
  const record = requireRecord(value, `${kind}[${index}]`);
  return {
    id: requireText(record.id, `${kind}[${index}].id`),
    name: requireText(record.name, `${kind}[${index}].name`),
    short: requireText(record.short, `${kind}[${index}].short`),
    color: requireText(record.color, `${kind}[${index}].color`),
  };
}

// Role families and profiles share the same shape (id/name/color, no short).
function parseIdNameColor(value: unknown, kind: string, index: number): RoleFamily {
  const record = requireRecord(value, `${kind}[${index}]`);
  return {
    id: requireText(record.id, `${kind}[${index}].id`),
    name: requireText(record.name, `${kind}[${index}].name`),
    color: requireText(record.color, `${kind}[${index}].color`),
  };
}

// The resource → role-family map. Every value must name a known role family.
function parseRoleOf(value: unknown, familyIds: Set<string>): Record<string, string> {
  const record = requireRecord(value, "roleOf");
  const out: Record<string, string> = {};
  for (const [resource, familyId] of Object.entries(record)) {
    if (typeof familyId !== "string" || !familyIds.has(familyId)) {
      fail(`roleOf[« ${resource} »] doit référencer une famille de rôle connue`);
    }
    out[resource] = familyId;
  }
  return out;
}

function parseRiskSeverityStyle(value: unknown, path: string): RiskSeverityStyle {
  const record = requireRecord(value, path);
  const rank = record.rank;
  if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 1) {
    fail(`${path}.rank doit être un entier ≥ 1`);
  }
  return {
    label: requireText(record.label, `${path}.label`),
    color: requireText(record.color, `${path}.color`),
    rank,
  };
}

function parseNatureStyle(value: unknown, path: string): NatureStyle {
  const record = requireRecord(value, path);
  return {
    label: requireText(record.label, `${path}.label`),
    bg: requireText(record.bg, `${path}.bg`),
    fg: requireText(record.fg, `${path}.fg`),
  };
}

function parseCriticalityStyle(value: unknown, path: string): CriticalityStyle {
  const record = requireRecord(value, path);
  const badge = record.badge;
  if (badge !== null && typeof badge !== "string") {
    fail(`${path}.badge doit être une chaîne ou null`);
  }
  const style: CriticalityStyle = {
    label: requireText(record.label, `${path}.label`),
    badge,
  };
  if (record.bg !== undefined) style.bg = requireText(record.bg, `${path}.bg`);
  if (record.fg !== undefined) style.fg = requireText(record.fg, `${path}.fg`);
  return style;
}

function parseGateDef(value: unknown, path: string): GateDef {
  const record = requireRecord(value, path);
  return {
    name: requireText(record.name, `${path}.name`),
    color: requireText(record.color, `${path}.color`),
  };
}

function parseFieldOptions(value: unknown, path: string): FieldOption[] {
  if (!Array.isArray(value)) fail(`${path} doit être un tableau (champ « select »)`);
  return value.map((option, index) => {
    const record = requireRecord(option, `${path}[${index}]`);
    if (typeof record.label !== "string") fail(`${path}[${index}].label doit être une chaîne`);
    if (typeof record.color !== "string") fail(`${path}[${index}].color doit être une chaîne`);
    return { label: record.label, color: record.color };
  });
}

function parseField(value: unknown, index: number): FieldDef {
  const record = requireRecord(value, `fields[${index}]`);
  const type = record.type;
  if (typeof type !== "string" || !(FIELD_TYPES as readonly string[]).includes(type)) {
    fail(`fields[${index}].type doit être l’un de : ${FIELD_TYPES.join(", ")}`);
  }
  const showOnCard = record.showOnCard === undefined ? false : record.showOnCard;
  if (typeof showOnCard !== "boolean") {
    fail(`fields[${index}].showOnCard doit être un booléen`);
  }
  const field: FieldDef = {
    id: requireText(record.id, `fields[${index}].id`),
    name: requireText(record.name, `fields[${index}].name`),
    type: type as FieldType,
    showOnCard,
  };
  if (type === "select") {
    field.options = parseFieldOptions(record.options, `fields[${index}].options`);
  }
  return field;
}

function parseFields(value: unknown): FieldDef[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("fields doit être un tableau");
  const fields = value.map(parseField);
  uniqueIds(fields, "fields");
  return fields;
}

function requireDays(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail(`${path} doit être un nombre > 0`);
  }
  return value;
}

function parseAge(value: unknown): AgeThresholds {
  const record = requireExactKeys(value, "age", AGE_KEYS);
  const age: AgeThresholds = {
    freshMaxDays: requireDays(record.freshMaxDays, "age.freshMaxDays"),
    recentMaxDays: requireDays(record.recentMaxDays, "age.recentMaxDays"),
    agingMaxDays: requireDays(record.agingMaxDays, "age.agingMaxDays"),
  };
  if (!(age.freshMaxDays < age.recentMaxDays && age.recentMaxDays < age.agingMaxDays)) {
    fail("age : les seuils doivent être strictement croissants (freshMaxDays < recentMaxDays < agingMaxDays)");
  }
  return age;
}

/**
 * Validates a parsed board config (board.json or a runtime override) into a
 * BoardConfig.
 * Input: the unknown value produced by JSON.parse.
 * Output: a structurally valid BoardConfig. Display strings are kept as-is
 * (diacritics and typographic apostrophes included). Normalizations: purely
 * visual text (column note, lane nature/detail) defaults to "" when absent;
 * a missing column wip or gate defaults to null; a missing fields array
 * defaults to []; a missing showOnCard defaults to false; options are kept
 * only on "select" fields.
 * Failure: throws ConfigError with a French message naming the first
 * offending field; never returns a partially valid config.
 */
// design-v10 typologies; roleOf values must reference a declared role family.
type Vocabularies = Pick<BoardConfig,
  "roleFamilies" | "profiles" | "roleOf" | "riskTypes" | "projectConstraints" | "riskSeverity">;

function parseVocabularies(raw: Record<string, unknown>): Vocabularies {
  const roleFamilies = parseNonEmptyArray(raw.roleFamilies, "roleFamilies", (v, i) => parseIdNameColor(v, "roleFamilies", i));
  const profiles = parseNonEmptyArray(raw.profiles, "profiles", (v, i) => parseIdNameColor(v, "profiles", i));
  const riskTypes = parseNonEmptyArray(raw.riskTypes, "riskTypes", (v, i) => parseColored(v, "riskTypes", i));
  const projectConstraints = parseNonEmptyArray(raw.projectConstraints, "projectConstraints", (v, i) => parseColored(v, "projectConstraints", i));
  uniqueIds(roleFamilies, "roleFamilies");
  uniqueIds(profiles, "profiles");
  uniqueIds(riskTypes, "riskTypes");
  uniqueIds(projectConstraints, "projectConstraints");
  return {
    roleFamilies,
    profiles,
    roleOf: parseRoleOf(raw.roleOf, new Set(roleFamilies.map((r) => r.id))),
    riskTypes,
    projectConstraints,
    riskSeverity: parseKeyed(raw.riskSeverity, "riskSeverity", RISK_SEVERITY_KEYS, parseRiskSeverityStyle) as BoardConfig["riskSeverity"],
  };
}

export function validateBoardConfig(raw: unknown): BoardConfig {
  if (!isRecord(raw)) fail("la configuration doit être un objet JSON");
  const lanes = parseNonEmptyArray(raw.lanes, "lanes", parseLane);
  const columns = parseNonEmptyArray(raw.columns, "columns", parseColumn);
  const domains = parseNonEmptyArray(raw.domains, "domains", (v, i) => parseColored(v, "domains", i));
  const types = parseNonEmptyArray(raw.types, "types", (v, i) => parseColored(v, "types", i));
  uniqueIds(lanes, "lanes");
  uniqueIds(columns, "columns");
  uniqueIds(domains, "domains");
  uniqueIds(types, "types");
  const andon = raw.andonThresholdDays;
  if (typeof andon !== "number" || !Number.isFinite(andon) || andon < 1) {
    fail("andonThresholdDays doit être un nombre ≥ 1");
  }
  return {
    lanes,
    columns,
    domains,
    types,
    natures: parseKeyed(raw.natures, "natures", NATURE_KEYS, parseNatureStyle) as BoardConfig["natures"],
    criticalities: parseKeyed(raw.criticalities, "criticalities", CRITICALITY_KEYS, parseCriticalityStyle) as BoardConfig["criticalities"],
    gateDefs: parseKeyed(raw.gateDefs, "gateDefs", GATE_CODES, parseGateDef) as BoardConfig["gateDefs"],
    fields: parseFields(raw.fields),
    ...parseVocabularies(raw),
    age: parseAge(raw.age),
    andonThresholdDays: andon,
  };
}

