// Explicit storage driver selection (ADR 008/011/016): the operator names the
// driver in the configuration; nothing is probed, nothing falls back silently.
// PostgreSQL is the delivery back end; JSONL stays as a zero-dependency,
// single-writer file store for local/simple deployments. Both satisfy the same
// BoardStorage contract (storage/conformance).

import type { BoardStorage } from "../../core/ports.ts";
import { createJsonlStorage } from "./jsonl.ts";
import { createPostgresStorage } from "./postgres.ts";

/** Driver identifiers accepted by the configuration. */
export const STORAGE_DRIVERS = ["jsonl", "postgres"] as const;

/** One of STORAGE_DRIVERS. */
export type StorageDriverId = (typeof STORAGE_DRIVERS)[number];

/**
 * Creates the BoardStorage named by the configuration.
 * Inputs: the driver id as written in the config (unvalidated string), and a
 * target — a data file path for "jsonl"; ignored for "postgres", which reads
 * its connection from DATABASE_URL (else the standard PG* env vars).
 * Output: a Promise of an open BoardStorage.
 * Failure: rejects when the driver is unknown; propagates the driver's own
 * open errors (a torn/foreign JSONL file, an unreachable database).
 */
export async function createStorage(driver: string, path: string): Promise<BoardStorage> {
  if (driver === "jsonl") return createJsonlStorage(path);
  if (driver === "postgres") {
    // Append-only log is enforced by default; KANBAN_PG_APPEND_ONLY=0 drops the
    // guard for demo/dev so the DB can be hand-edited (see ADR 016).
    const appendOnly = process.env["KANBAN_PG_APPEND_ONLY"] !== "0";
    return createPostgresStorage(process.env["DATABASE_URL"], appendOnly);
  }
  throw new Error(
    `Pilote de stockage inconnu : « ${driver} ». Pilotes disponibles : ${STORAGE_DRIVERS.join(", ")}.`,
  );
}
