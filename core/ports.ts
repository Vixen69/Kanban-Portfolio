// The single port of the hexagon (CLAUDE.md section 4).
// Adapters: fixtures (Sprint 1), csv-import, sciforma, planisware (later).

import type { Card, Financials } from "./types.ts";

/**
 * A subject as delivered by a portfolio data source, before the event log
 * takes over. Identical to Card minus the financials, which are fetched
 * separately through getFinancials (PPM tools expose them separately).
 */
export type Subject = Omit<Card, "budget" | "consumed" | "remaining">;

/**
 * Read-only access to a portfolio source. Implementations must never write
 * to the source and must never be called from the web server process.
 */
export interface PortfolioDataSource {
  /** Lists every subject of the portfolio. Synchronous for fixtures/csv. */
  listSubjects(): Subject[];
  /** Financials for one subject, or null when the source has none. */
  getFinancials(subjectId: string): Financials | null;
}
