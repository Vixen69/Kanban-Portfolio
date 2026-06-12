// The fixtures adapter: implements the PortfolioDataSource port over the
// deterministic synthetic portfolio. The ONLY adapter ever used on the
// author's personal machine.

import type { BoardConfig } from "../../core/types.ts";
import type { PortfolioDataSource } from "../../core/ports.ts";
import type { CardEventInput } from "../../core/events.ts";
import { FIXTURES_SEED, generatePortfolio } from "./generate.ts";

/** The port implementation plus the fixtures-only event seed. */
export interface FixturesBundle {
  dataSource: PortfolioDataSource;
  /**
   * Backdated history to seed the in-memory event store. Fixtures-only:
   * real adapters never fabricate history, their imports ARE the history.
   */
  seedEvents: CardEventInput[];
}

/**
 * Creates the fixtures data source for a board topology.
 * Inputs: the validated board config, the current Date, optional seed.
 * Output: a FixturesBundle (read-only data source + seed events).
 * Failure: none for a valid BoardConfig.
 */
export function createFixtures(config: BoardConfig, now: Date, seed = FIXTURES_SEED): FixturesBundle {
  const portfolio = generatePortfolio(config, now, seed);
  return {
    dataSource: {
      listSubjects: () => portfolio.subjects.map((subject) => ({ ...subject })),
      getFinancials: (subjectId) => portfolio.financialsById.get(subjectId) ?? null,
    },
    seedEvents: portfolio.events,
  };
}
