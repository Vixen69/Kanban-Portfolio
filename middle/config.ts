// Middle runtime configuration (ADR 010/011). Non-secret settings only — host,
// port, storage driver and file paths — read from the environment with safe
// local defaults. Secrets never live here nor in committed env (CLAUDE.md §6).

/** Resolved settings the middle process runs with. */
export interface ServerConfig {
  host: string;
  port: number;
  storageDriver: string;
  dataPath: string;
  boardConfigPath: string;
}

const DEFAULTS: ServerConfig = {
  host: "127.0.0.1",
  port: 8787,
  storageDriver: "jsonl",
  dataPath: "data/board.jsonl",
  boardConfigPath: "config/board.json",
};

// Parses a port from the environment, rejecting anything outside 1-65535.
function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`KANBAN_PORT invalide : « ${raw} » (entier 1-65535 attendu).`);
  }
  return port;
}

/**
 * Builds the middle configuration from environment variables.
 * Inputs: an environment map (process.env). Recognized keys: KANBAN_HOST,
 * KANBAN_PORT, KANBAN_STORAGE_DRIVER, KANBAN_DATA_PATH, KANBAN_CONFIG_PATH.
 * Output: a complete ServerConfig; absent keys fall back to local defaults
 * (127.0.0.1, 8787, jsonl, data/board.jsonl, config/board.json).
 * Failure: throws Error (French) when KANBAN_PORT is set but not a valid port.
 */
export function loadServerConfig(env: Record<string, string | undefined>): ServerConfig {
  return {
    host: env["KANBAN_HOST"] ?? DEFAULTS.host,
    port: parsePort(env["KANBAN_PORT"], DEFAULTS.port),
    storageDriver: env["KANBAN_STORAGE_DRIVER"] ?? DEFAULTS.storageDriver,
    dataPath: env["KANBAN_DATA_PATH"] ?? DEFAULTS.dataPath,
    boardConfigPath: env["KANBAN_CONFIG_PATH"] ?? DEFAULTS.boardConfigPath,
  };
}
