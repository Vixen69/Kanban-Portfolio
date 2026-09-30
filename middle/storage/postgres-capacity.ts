// The capacity side of the PostgreSQL driver (ADR 024/035/058), split from
// postgres.ts to respect the 300-line file cap. One row per exercise year
// (id = the year), replaced whole at each import; rows written before
// ADR 035 sit under id 'current' and are read as a fallback for their own
// year. A restore may clear a year (ADR 058): its row goes, and so does a
// legacy 'current' row of that year, or the fallback would bring it back.

import type { BoardStorage } from "../../core/ports.ts";
import type { CapacitySnapshot } from "../../core/types.ts";
import type { Tx } from "./postgres.ts";

/** What the reads need of the pool — pg itself stays confined to postgres.ts (ADR 016). */
export interface CapacityReader {
  query<R>(text: string, values: unknown[]): Promise<{ rows: R[] }>;
}

const UPSERT_CAPACITY =
  "INSERT INTO capacity (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data";
const LEGACY_CAPACITY_ID = "current";

async function pgGetCapacity(pool: CapacityReader, year: number): Promise<CapacitySnapshot | null> {
  const res = await pool.query<{ data: CapacitySnapshot }>("SELECT data FROM capacity WHERE id = $1", [String(year)]);
  const row = res.rows[0];
  if (row !== undefined) return row.data;
  const legacy = await pool.query<{ data: CapacitySnapshot }>("SELECT data FROM capacity WHERE id = $1", [LEGACY_CAPACITY_ID]);
  const old = legacy.rows[0];
  return old !== undefined && old.data.exerciseYear === year ? old.data : null;
}

/**
 * The capacity methods of the Postgres BoardStorage.
 * Inputs: the pool (reads), the transaction runner (writes), the
 * use-after-close guard. Output: importCapacity, getCapacity and
 * clearCapacity. Failure: each method rejects on database errors or once
 * the store is closed.
 */
export function pgCapacity(
  pool: CapacityReader, runTx: Tx, assertOpen: () => void,
): Pick<BoardStorage, "importCapacity" | "getCapacity" | "clearCapacity"> {
  return {
    async importCapacity(snapshot) {
      assertOpen();
      await runTx(async (client) => {
        await client.query(UPSERT_CAPACITY, [String(snapshot.exerciseYear), snapshot]);
      });
    },
    async getCapacity(year) {
      assertOpen();
      return pgGetCapacity(pool, year);
    },
    async clearCapacity(year) {
      assertOpen();
      await runTx(async (client) => {
        await client.query("DELETE FROM capacity WHERE id = $1", [String(year)]);
        await client.query(
          "DELETE FROM capacity WHERE id = $1 AND (data->>'exerciseYear')::int = $2", [LEGACY_CAPACITY_ID, year],
        );
      });
    },
  };
}
