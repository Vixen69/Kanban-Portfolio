// Explicit storage driver selection (ADR 008/011): the operator names the
// driver in the configuration; nothing is probed, nothing falls back silently.
// JSONL is the Node-22-safe driver used now; the PostgreSQL driver (`pg`)
// joins behind the same port once the tech lead authorizes `pg` (ADR 011).

import type { BoardStorage } from "../../core/ports.ts";
import { createJsonlStorage } from "./jsonl.ts";

/** Driver identifiers accepted by the configuration. */
export const STORAGE_DRIVERS = ["jsonl"] as const;

/** One of STORAGE_DRIVERS. "postgres" is reserved (pending `pg`, ADR 011). */
export type StorageDriverId = (typeof STORAGE_DRIVERS)[number];

/**
 * Creates the BoardStorage named by the configuration.
 * Inputs: the driver id as written in the config (unvalidated string),
 * the data file path handed to the driver.
 * Output: an open BoardStorage.
 * Failure: throws Error (French, operator-facing) when the driver is unknown,
 * or "postgres" before `pg` is authorized/implemented; propagates the driver's
 * own open errors.
 */
export function createStorage(driver: string, path: string): BoardStorage {
  if (driver === "jsonl") return createJsonlStorage(path);
  if (driver === "postgres") {
    throw new Error("Pilote « postgres » pas encore disponible : « pg » reste à autoriser (ADR 011).");
  }
  throw new Error(
    `Pilote de stockage inconnu : « ${driver} ». Pilotes disponibles : ${STORAGE_DRIVERS.join(", ")}.`,
  );
}
