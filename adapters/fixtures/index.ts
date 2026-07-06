// The fixtures adapter: implements the PortfolioDataSource port over the
// deterministic 150-subject synthetic portfolio (design v9). The ONLY
// adapter ever used on the author's personal machine.

import type { BoardConfig } from "../../core/types.ts";
import type { PortfolioDataSource } from "../../core/ports.ts";
import type { CardEventInput } from "../../core/events.ts";
import { FIXTURES_SEED, generatePortfolio } from "./generate.ts";

/** The port implementation plus the fixtures-only event seed. */
export interface FixturesBundle {
  dataSource: PortfolioDataSource;
  /**
   * Backdated history to seed the event store. Fixtures-only: real
   * adapters never fabricate history, their imports ARE the history.
   */
  seedEvents: CardEventInput[];
}

/**
 * Creates the fixtures data source for a board topology.
 * Inputs: the validated board config (must contain the default NMO ids),
 * the current Date, an optional seed (default FIXTURES_SEED).
 * Output: a FixturesBundle (read-only data source + seed events). Both
 * accessors return deep copies — callers can never mutate the portfolio.
 * Failure: throws when the config lost an id the dataset targets.
 */
export function createFixtures(config: BoardConfig, now: Date, seed = FIXTURES_SEED): FixturesBundle {
  const portfolio = generatePortfolio(config, now, seed);
  return {
    dataSource: {
      listSubjects: () => portfolio.subjects.map((subject) => structuredClone(subject)),
      getFinancials: (subjectId) => {
        const financials = portfolio.financialsById.get(subjectId);
        return financials ? { ...financials } : null;
      },
    },
    seedEvents: portfolio.events,
  };
}
