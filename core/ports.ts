// The ports of the hexagon (CLAUDE.md section 4).
// PortfolioDataSource — read-only PPM access, implemented by adapters/
// (fixtures, csv-import, sciforma, planisware later).
// BoardStorage — persistence, implemented by middle/storage/ drivers
// (JSONL now; PostgreSQL via pg later — ADR 008/009/011).

import type { Card, CardEvent, Financials } from "./types.ts";
import type { CardEventInput } from "./events.ts";

/**
 * A subject as delivered by a portfolio data source, before the event log
 * takes over. Identical to Card minus the financial fields (budget estimé /
 * consommé, k€), which are fetched separately through getFinancials — PPM
 * tools expose them separately. core/state.ts toCard() joins the two.
 */
export type Subject = Omit<Card, "budgetEstimated" | "budgetConsumed">;

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

/**
 * Persistent board storage: base card snapshots plus the append-only event
 * log (ADR 008). Implementations assign event ids "evt-<seq>" with a
 * strictly increasing integer seq that survives restarts — foldEvents
 * orders same-instant events by the numeric id suffix. Events are never
 * updated, never deleted. Timestamps, actor attribution and topology
 * validation belong to the caller, never to the storage.
 */
export interface BoardStorage {
  /**
   * Upserts base cards (by id) and appends their events in one atomic
   * batch — either everything is persisted, or nothing is. Used by the
   * seed script (Sprint 3) and the sync CLI (Sprint 5).
   * Failure: throws on storage errors; the whole batch is rolled back.
   */
  importCards(cards: Card[], events: CardEventInput[]): void;
  /**
   * Inserts one new base card together with its creation event, in one
   * atomic batch — the UI intake path (POST /api/cards). Either both are
   * persisted or neither is: a card must never exist without its "created"
   * trace in the append-only log (the log is the audit truth).
   * Inputs: the complete Card (the caller builds it, id included) and the
   * "created" CardEventInput to append with it.
   * Output: the stored event with its assigned id; the card becomes visible
   * through listBaseCards.
   * Failure: throws when a card with the same id already exists (never
   * overwrites — id allocation is the caller's job), or on storage errors;
   * on failure nothing is persisted.
   */
  insertCard(card: Card, created: CardEventInput): CardEvent;
  /**
   * Appends one event and returns the stored copy with its assigned id.
   * Failure: throws on storage errors (store closed, I/O); never partial.
   */
  appendEvent(input: CardEventInput): CardEvent;
  /**
   * Returns all events in append order (seq ascending).
   * Failure: throws on storage errors or an unreadable stored payload.
   */
  listEvents(): CardEvent[];
  /**
   * Returns the base card snapshots as imported — never event-derived
   * state: the current board is folded on read (ADR 002).
   * Failure: throws on storage errors.
   */
  listBaseCards(): Card[];
  /** Releases the underlying resources. Idempotent. Failure: none. */
  close(): void;
}
