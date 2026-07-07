// Generic structural-validation primitives shared by the board-config parsers.
// Split from config.ts to respect the 300-line file cap. Pure, dependency-free.

/**
 * Raised when a board config is structurally invalid.
 * The message is a French sentence naming the first offending field.
 */
export class ConfigError extends Error {}

/** Throws a ConfigError with the given French message. Never returns. */
export function fail(message: string): never {
  throw new ConfigError(message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A required, non-empty string (ids, names, short codes, colors, labels).
export function requireText(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${path} doit être une chaîne non vide`);
  }
  return value;
}

// Display-only text: must be a string when present; absent means "".
export function optionalText(value: unknown, path: string): string {
  if (value === undefined) return "";
  if (typeof value !== "string") fail(`${path} doit être une chaîne`);
  return value;
}

export function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${path} doit être un objet`);
  return value;
}

// An object holding exactly the given keys — no more, no fewer.
export function requireExactKeys(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
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
export function parseKeyed<T>(
  value: unknown, path: string, keys: readonly string[],
  parseOne: (item: unknown, itemPath: string) => T,
): Record<string, T> {
  const record = requireExactKeys(value, path, keys);
  return Object.fromEntries(keys.map((key) => [key, parseOne(record[key], `${path}.${key}`)]));
}

export function parseNonEmptyArray<T>(value: unknown, kind: string, parseItem: (item: unknown, index: number) => T): T[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${kind} doit être un tableau non vide`);
  return value.map(parseItem);
}

export function uniqueIds(items: { id: string }[], kind: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) fail(`${kind} : id dupliqué « ${item.id} »`);
    seen.add(item.id);
  }
}
