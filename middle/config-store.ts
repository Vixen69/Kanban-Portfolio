// Runtime board-config store (ADR 013 / ADR 038). The defaults live in
// config/board.json (versioned in git); the admin panel can persist a
// runtime override at <dataDir>/config.json with an append-only history of
// every applied config at <dataDir>/config-history.jsonl. The override
// wins over the defaults ONLY while the defaults it was applied on are the
// ones running (ADR 038, author 2026-09-16: while the developers are
// there, a fix to the versioned model must pass before the config applied
// on the VM): a changed board.json supersedes the applied config — set
// aside into the history, file removed, said on the console. The CURRENT
// EXERCISE YEAR lives apart, in <dataDir>/exercise.json (ADR 035/038): the
// year switch must survive every config change, versioned or applied.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateBoardConfig } from "../core/config.ts";
import type { BoardConfig } from "../core/types.ts";

/** Access to the runtime board topology, its persisted override and the current exercise. */
export interface ConfigStore {
  /** The config the board runs with: the adopted override (else the defaults), with the current exercise year. */
  getRuntime(): BoardConfig;
  /** The pristine defaults (config/board.json as validated at startup). */
  getDefaults(): BoardConfig;
  /**
   * Persists a new runtime override, stamped with the defaults it was
   * applied on, and appends one history line. The history line is written
   * FIRST: if the override write then fails, the audit trail carries at
   * worst one extra entry — never an active override that no history line
   * accounts for (ADR 013).
   * Inputs: an already-validated config, the acting user.
   * Output: the runtime config (now returned by getRuntime).
   * Failure: throws on I/O errors; neither memory nor the served config
   * change on failure.
   */
  setRuntime(config: BoardConfig, actor: string): BoardConfig;
  /** The applied override as adopted, null when the versioned model runs. */
  getOverride(): BoardConfig | null;
  /**
   * Puts an override back — or removes it (null) — the restore of a
   * snapshot (ADR 042): one history line either way, noted as a restore.
   * Inputs: the override to run with (already validated when applied), the
   * acting user. Output: the runtime config. Failure: throws on I/O errors.
   */
  restoreOverride(config: BoardConfig | null, actor: string): BoardConfig;
  /** The current exercise year: exercise.json when present, else the defaults'. */
  getExerciseYear(): number;
  /**
   * Records a new current exercise year (the switch, ADR 035): one history
   * line in exercise-history.jsonl, then exercise.json.
   * Inputs: the year, the acting user. Output: the runtime config.
   * Failure: throws on I/O errors.
   */
  setExerciseYear(year: number, actor: string): BoardConfig;
}

interface OverrideFile {
  /** The hash of the defaults the config was applied on; null for files written before ADR 038. */
  defaultsHash: string | null;
  config: BoardConfig;
}

function hashOf(config: BoardConfig): string {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

function unreadable(path: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`Configuration d’exécution illisible (${path}) : ${detail} — corrigez ou supprimez ce fichier.`);
}

// Reads and validates the override file, or null when absent. Two shapes:
// { defaultsHash, config } (ADR 038) and the bare config of before (no
// stamp: superseded once, then rewritten stamped by the next apply). A file
// that exists but cannot be parsed or validated is a hard startup error:
// silently falling back to defaults would hide a corrupted admin config.
function loadOverride(path: string): OverrideFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const stamped = typeof raw["defaultsHash"] === "string" && typeof raw["config"] === "object" && raw["config"] !== null;
    return { defaultsHash: stamped ? (raw["defaultsHash"] as string) : null, config: validateBoardConfig(stamped ? raw["config"] : raw) };
  } catch (error) {
    throw unreadable(path, error);
  }
}

// The current exercise file ({ year, actor, ts }), or null when absent.
function loadExerciseYear(path: string): number | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { year?: unknown };
    if (typeof raw.year !== "number" || !Number.isInteger(raw.year) || raw.year < 2000 || raw.year > 2100) {
      throw new Error("« year » doit être une année entière");
    }
    return raw.year;
  } catch (error) {
    throw unreadable(path, error);
  }
}

// An applied config is adopted only when the defaults it was applied on
// are the ones running now (ADR 038); otherwise it is set aside — one
// history line keeps it, the file goes, the console says so.
function adopt(found: OverrideFile | null, defaults: BoardConfig, defaultsHash: string, paths: { override: string; history: string }): BoardConfig {
  if (found === null) return defaults;
  if (found.defaultsHash === defaultsHash) return found.config;
  const ts = new Date().toISOString();
  const note = "configuration appliquée écartée : le modèle versionné (config/board.json) a changé et fait foi (ADR 038)";
  appendFileSync(paths.history, `${JSON.stringify({ ts, actor: "modèle versionné", note, config: found.config })}\n`, "utf8");
  rmSync(paths.override);
  console.log(`${ts} config : ${note}`);
  return defaults;
}

/**
 * Opens the config store rooted at dataDir (override and exercise read once
 * at creation, then kept in memory and updated on each write).
 * Inputs: the data directory (dirname of the storage data path) and the
 * validated default config.
 * Output: a ConfigStore.
 * Failure: throws Error (French) when an existing override or exercise
 * file is unreadable or invalid — fix or delete the file, then restart.
 */
export function createConfigStore(dataDir: string, defaults: BoardConfig): ConfigStore {
  const paths: Paths = {
    override: join(dataDir, "config.json"), history: join(dataDir, "config-history.jsonl"),
    exercise: join(dataDir, "exercise.json"), exerciseHistory: join(dataDir, "exercise-history.jsonl"),
  };
  const defaultsHash = hashOf(defaults);
  const adopted = adopt(loadOverride(paths.override), defaults, defaultsHash, paths);
  let override: BoardConfig | null = adopted === defaults ? null : adopted;
  let year = loadExerciseYear(paths.exercise) ?? defaults.exercise.year;
  const runtime = (): BoardConfig => {
    const base = override ?? defaults;
    return base.exercise.year === year ? base : { ...base, exercise: { ...base.exercise, year } };
  };
  return {
    getRuntime: runtime,
    getDefaults: () => defaults,
    setRuntime: (config, actor) => {
      persistOverride(dataDir, paths, defaultsHash, config, actor);
      override = config;
      return runtime();
    },
    getOverride: () => override,
    restoreOverride: (config, actor) => {
      persistOverride(dataDir, paths, defaultsHash, config, actor, RESTORE_NOTE);
      override = config;
      return runtime();
    },
    getExerciseYear: () => year,
    setExerciseYear: (next, actor) => {
      persistExerciseYear(dataDir, paths, year, next, actor);
      year = next;
      return runtime();
    },
  };
}

interface Paths {
  override: string;
  history: string;
  exercise: string;
  exerciseHistory: string;
}

const RESTORE_NOTE = "restauration d’instantané (ADR 042)";

// Persists an override — or its removal (config null). The history line
// comes FIRST: a failure between the two writes leaves an extra audit
// line, never an unaudited override that a restart would adopt.
function persistOverride(
  dataDir: string, paths: Paths, defaultsHash: string, config: BoardConfig | null, actor: string, note?: string,
): void {
  mkdirSync(dataDir, { recursive: true });
  const ts = new Date().toISOString();
  const entry = note === undefined ? { ts, actor, config } : { ts, actor, note, config };
  appendFileSync(paths.history, `${JSON.stringify(entry)}\n`, "utf8");
  if (config === null) {
    if (existsSync(paths.override)) rmSync(paths.override);
  } else {
    writeFileSync(paths.override, `${JSON.stringify({ defaultsHash, config }, null, 2)}\n`, "utf8");
  }
}

// Records the switch: one history line, then exercise.json.
function persistExerciseYear(dataDir: string, paths: Paths, from: number, next: number, actor: string): void {
  mkdirSync(dataDir, { recursive: true });
  const ts = new Date().toISOString();
  appendFileSync(paths.exerciseHistory, `${JSON.stringify({ ts, actor, from, year: next })}\n`, "utf8");
  writeFileSync(paths.exercise, `${JSON.stringify({ year: next, actor, ts }, null, 2)}\n`, "utf8");
}
