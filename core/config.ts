// Validation of the board topology and vocabulary (config/board.json and the
// runtime overrides applied from the admin panel, ADR 013). Topology,
// vocabulary and thresholds are the ONLY configurable surface; behavior
// stays hard-coded.

import type {
  AgeThresholds, BoardConfig, Card, Column, CriticalityStyle, Domain,
  FieldDef, FieldOption, FieldType, GateCode, GateDef, Lane, NatureStyle,
} from "./types.ts";

/**
 * Raised when a board config is structurally invalid.
 * The message is a French sentence naming the first offending field.
 */
export class ConfigError extends Error {}

const NATURE_KEYS = ["simple", "complicated", "complex"] as const;
const CRITICALITY_KEYS = ["top", "major", "normal"] as const;
const GATE_CODES: readonly GateCode[] = ["DoR", "DoD"];
const FIELD_TYPES: readonly FieldType[] = ["text", "number", "date", "select", "checkbox", "person"];
const AGE_KEYS = ["freshMaxDays", "recentMaxDays", "agingMaxDays"] as const;

function fail(message: string): never {
  throw new ConfigError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A required, non-empty string (ids, names, short codes, colors, labels).
function requireText(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${path} doit être une chaîne non vide`);
  }
  return value;
}

// Display-only text: must be a string when present; absent means "".
function optionalText(value: unknown, path: string): string {
  if (value === undefined) return "";
  if (typeof value !== "string") fail(`${path} doit être une chaîne`);
  return value;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${path} doit être un objet`);
  return value;
}

// An object holding exactly the given keys — no more, no fewer.
function requireExactKeys(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  const record = requireRecord(value, path);
  for (const key of keys) {
    if (!(key in record)) fail(`${path}.${key} manquant`);
  }
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) fail(`${path} : clé inattendue « ${key} »`);
  }
  return record;
}

// Parses an object with exactly the given keys, one sub-parse per key.
function parseKeyed<T>(
  value: unknown, path: string, keys: readonly string[],
  parseOne: (item: unknown, itemPath: string) => T,
): Record<string, T> {
  const record = requireExactKeys(value, path, keys);
  return Object.fromEntries(keys.map((key) => [key, parseOne(record[key], `${path}.${key}`)]));
}

function parseNonEmptyArray<T>(value: unknown, kind: string, parseItem: (item: unknown, index: number) => T): T[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${kind} doit être un tableau non vide`);
  return value.map(parseItem);
}

function uniqueIds(items: { id: string }[], kind: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) fail(`${kind} : id dupliqué « ${item.id} »`);
    seen.add(item.id);
  }
}

function parseLane(value: unknown, index: number): Lane {
  const record = requireRecord(value, `lanes[${index}]`);
  return {
    id: requireText(record.id, `lanes[${index}].id`),
    name: requireText(record.name, `lanes[${index}].name`),
    nature: optionalText(record.nature, `lanes[${index}].nature`),
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
    age: parseAge(raw.age),
    andonThresholdDays: andon,
  };
}

// Keeps an id when it still exists in the collection, else first entry.
function keepOrFirst(id: string, items: readonly { id: string }[]): string {
  return items.some((item) => item.id === id) ? id : (items[0] as { id: string }).id;
}

/**
 * Remaps a card's config references for display after an admin edit removed
 * the lane, column, domain or type the card pointed at.
 * Input: any object carrying the card's laneId/columnId/domain/typeId, plus
 * a validated BoardConfig (all four collections non-empty).
 * Output: { laneId, columnId, domain, typeId } — each kept as-is when still
 * present in the config, otherwise remapped to the config's first entry
 * (a null typeId stays null: it references nothing).
 * Failure: none. Display-level fallback only — NEVER writes events.
 */
export function reconcileCardRefs(
  card: Pick<Card, "laneId" | "columnId" | "domain" | "typeId">,
  config: BoardConfig,
): Pick<Card, "laneId" | "columnId" | "domain" | "typeId"> {
  return {
    laneId: keepOrFirst(card.laneId, config.lanes),
    columnId: keepOrFirst(card.columnId, config.columns),
    domain: keepOrFirst(card.domain, config.domains),
    typeId: card.typeId === null ? null : keepOrFirst(card.typeId, config.types),
  };
}
