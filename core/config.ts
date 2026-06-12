// Validation of the board topology (config/board.json).
// Topology is the ONLY configurable surface; everything else is hard-coded.

import type { BoardConfig, Column, Lane, ProjectType } from "./types.ts";

/** Raised when a board config file is structurally invalid. */
export class ConfigError extends Error {}

function fail(message: string): never {
  throw new ConfigError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNamed(value: unknown, kind: string, index: number): Lane {
  if (!isRecord(value)) fail(`${kind}[${index}] doit être un objet`);
  const { id, name } = value;
  if (typeof id !== "string" || id.length === 0) fail(`${kind}[${index}].id invalide`);
  if (typeof name !== "string" || name.length === 0) fail(`${kind}[${index}].name invalide`);
  return { id, name };
}

function parseLane(value: unknown, index: number): Lane {
  const base = parseNamed(value, "lanes", index);
  const nature = (value as Record<string, unknown>)["nature"];
  if (nature === undefined) return base;
  if (typeof nature !== "string" || nature.length === 0) {
    fail(`lanes[${index}].nature doit être une chaîne non vide`);
  }
  return { ...base, nature };
}

function parseType(value: unknown, index: number): ProjectType {
  const base = parseNamed(value, "types", index);
  const short = (value as Record<string, unknown>)["short"];
  if (typeof short !== "string" || short.length === 0) {
    fail(`types[${index}].short doit être une chaîne non vide`);
  }
  return { ...base, short };
}

function parseColumn(value: unknown, index: number): Column {
  const base = parseNamed(value, "columns", index);
  const wip = (value as Record<string, unknown>).wipLimit;
  if (wip !== null && (typeof wip !== "number" || !Number.isInteger(wip) || wip < 1)) {
    fail(`columns[${index}].wipLimit doit être null ou un entier >= 1`);
  }
  return { ...base, wipLimit: wip === null ? null : (wip as number) };
}

function uniqueIds(items: { id: string }[], kind: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) fail(`${kind}: id dupliqué "${item.id}"`);
    seen.add(item.id);
  }
}

function parseAgingSteps(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) fail("agingStepsDays doit être un tableau non vide");
  const steps = value.map((step, i) => {
    if (typeof step !== "number" || !Number.isFinite(step) || step <= 0) {
      fail(`agingStepsDays[${i}] doit être un nombre > 0`);
    }
    return step;
  });
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1] as number;
    if ((steps[i] as number) <= prev) fail("agingStepsDays doit être strictement croissant");
  }
  return steps;
}

/**
 * Validates a parsed board.json into a BoardConfig.
 * Input: the unknown value produced by JSON.parse.
 * Output: a structurally valid BoardConfig (display names kept as-is,
 * diacritics included).
 * Failure: throws ConfigError with a French message naming the first
 * offending field; never returns a partially valid config.
 */
export function validateBoardConfig(raw: unknown): BoardConfig {
  if (!isRecord(raw)) fail("la configuration doit être un objet JSON");
  if (!Array.isArray(raw.lanes) || raw.lanes.length === 0) fail("lanes doit être un tableau non vide");
  if (!Array.isArray(raw.columns) || raw.columns.length === 0) fail("columns doit être un tableau non vide");
  if (!Array.isArray(raw.domains) || raw.domains.length === 0) fail("domains doit être un tableau non vide");

  const lanes = raw.lanes.map((lane, i) => parseLane(lane, i));
  const columns = raw.columns.map((column, i) => parseColumn(column, i));
  uniqueIds(lanes, "lanes");
  uniqueIds(columns, "columns");

  if (raw.types !== undefined && !Array.isArray(raw.types)) fail("types doit être un tableau");
  const types = ((raw.types as unknown[]) ?? []).map((type, i) => parseType(type, i));
  uniqueIds(types, "types");

  const domains = raw.domains.map((domain, i) => {
    if (typeof domain !== "string" || domain.length === 0) fail(`domains[${i}] doit être une chaîne non vide`);
    return domain;
  });
  if (new Set(domains).size !== domains.length) fail("domains: doublon détecté");

  const andon = raw.andonThresholdDays;
  if (typeof andon !== "number" || !Number.isFinite(andon) || andon <= 0) {
    fail("andonThresholdDays doit être un nombre > 0");
  }

  return {
    lanes,
    columns,
    domains,
    types,
    agingStepsDays: parseAgingSteps(raw.agingStepsDays),
    andonThresholdDays: andon,
  };
}
