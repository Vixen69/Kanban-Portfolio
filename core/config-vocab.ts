// Parsers of the colored vocabulary entries of a board config (domains and
// their sub-domains, project types, role families, profiles, risk types,
// project constraints). Split from config.ts to respect the 300-line file
// cap; config.ts composes them into validateBoardConfig.

import type { Domain, RoleFamily, SubDomain } from "./types.ts";
import { fail, requireRecord, requireText, uniqueIds } from "./config-parse.ts";

/**
 * Parses one id/name/short/color entry (domains, types, risk types,
 * project constraints share the shape).
 * Inputs: the raw value, the collection name (for messages), its index.
 * Output: the entry. Failure: ConfigError naming the first bad field.
 */
export function parseColored(value: unknown, kind: string, index: number): Domain {
  const record = requireRecord(value, `${kind}[${index}]`);
  return {
    id: requireText(record.id, `${kind}[${index}].id`),
    name: requireText(record.name, `${kind}[${index}].name`),
    short: requireText(record.short, `${kind}[${index}].short`),
    color: requireText(record.color, `${kind}[${index}].color`),
  };
}

/**
 * Parses one id/name/color entry (role families and profiles, no short).
 * Inputs: the raw value, the collection name, its index.
 * Output: the entry. Failure: ConfigError naming the first bad field.
 */
export function parseIdNameColor(value: unknown, kind: string, index: number): RoleFamily {
  const record = requireRecord(value, `${kind}[${index}]`);
  return {
    id: requireText(record.id, `${kind}[${index}].id`),
    name: requireText(record.name, `${kind}[${index}].name`),
    color: requireText(record.color, `${kind}[${index}].color`),
  };
}

// The optional sub-domain list of a domain (ADR 022): absent = the domain
// is not detailed; present = a non-empty array of {id, name}, ids unique
// within the domain. An empty array is refused — declare nothing instead.
function parseSubDomains(value: unknown, path: string): SubDomain[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${path} doit être absent ou un tableau non vide`);
  }
  const subDomains = value.map((item, index): SubDomain => {
    const record = requireRecord(item, `${path}[${index}]`);
    return {
      id: requireText(record.id, `${path}[${index}].id`),
      name: requireText(record.name, `${path}[${index}].name`),
    };
  });
  uniqueIds(subDomains, path);
  return subDomains;
}

/**
 * Parses one domain: the colored entry plus its optional sub-domains.
 * Inputs: the raw value, its index in `domains`.
 * Output: a Domain (subDomains present only when declared).
 * Failure: ConfigError naming the first bad field.
 */
export function parseDomain(value: unknown, index: number): Domain {
  const domain = parseColored(value, "domains", index);
  const record = value as Record<string, unknown>;
  const subDomains = parseSubDomains(record.subDomains, `domains[${index}].subDomains`);
  if (subDomains !== undefined) domain.subDomains = subDomains;
  return domain;
}
