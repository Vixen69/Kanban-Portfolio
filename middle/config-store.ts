// Runtime board-config store (ADR 013). The defaults live in config/board.json
// (versioned in git); the admin panel can persist a runtime override, kept at
// <dataDir>/config.json with an append-only history of every applied config at
// <dataDir>/config-history.jsonl. The override always wins when present; the
// defaults stay untouched on disk so "Réinitialiser le modèle" is always
// possible from the UI.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateBoardConfig } from "../core/config.ts";
import type { BoardConfig } from "../core/types.ts";

/** Access to the runtime board topology and its persisted override. */
export interface ConfigStore {
  /** The config the board runs with: the override when present, else defaults. */
  getRuntime(): BoardConfig;
  /** The pristine defaults (config/board.json as validated at startup). */
  getDefaults(): BoardConfig;
  /**
   * Persists a new runtime override and appends one history line. The
   * history line is written FIRST: if the override write then fails, the
   * audit trail carries at worst one extra entry — never an active override
   * that no history line accounts for (ADR 013).
   * Inputs: an already-validated config, the acting user.
   * Output: the stored config (now returned by getRuntime).
   * Failure: throws on I/O errors; neither memory nor the served config
   * change on failure.
   */
  setRuntime(config: BoardConfig, actor: string): BoardConfig;
}

// Reads and validates the override file, or null when absent. A file that
// exists but cannot be parsed or validated is a hard startup error: silently
// falling back to defaults would hide a corrupted admin configuration.
function loadOverride(path: string): BoardConfig | null {
  if (!existsSync(path)) return null;
  try {
    return validateBoardConfig(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Configuration d’exécution illisible (${path}) : ${detail} — corrigez ou supprimez ce fichier.`,
    );
  }
}

/**
 * Opens the config store rooted at dataDir (override read once at creation,
 * then kept in memory and updated on each setRuntime).
 * Inputs: the data directory (dirname of the storage data path) and the
 * validated default config.
 * Output: a ConfigStore.
 * Failure: throws Error (French) when an existing override file is unreadable
 * or invalid — fix or delete the file, then restart.
 */
export function createConfigStore(dataDir: string, defaults: BoardConfig): ConfigStore {
  const overridePath = join(dataDir, "config.json");
  const historyPath = join(dataDir, "config-history.jsonl");
  let runtime = loadOverride(overridePath) ?? defaults;
  return {
    getRuntime: () => runtime,
    getDefaults: () => defaults,
    setRuntime: (config: BoardConfig, actor: string): BoardConfig => {
      mkdirSync(dataDir, { recursive: true });
      // History first: a failure between the two writes leaves an extra
      // audit line, never an unaudited override that a restart would adopt.
      const line = JSON.stringify({ ts: new Date().toISOString(), actor, config });
      appendFileSync(historyPath, `${line}\n`, "utf8");
      writeFileSync(overridePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      runtime = config;
      return config;
    },
  };
}
