// Domain types shared by core/, adapters/ and ui/.
// Mirrors the SQLite data model of CLAUDE.md section 4 (camelCase in TS).

/** Where a card's data originally came from. */
export type CardSource = "fixtures" | "csv" | "sciforma";

/** One swimlane of the board (topology only — behavior is hard-coded). */
export interface Lane {
  id: string;
  name: string;
  /** Work nature of the lane ("Clair", "Compliqué", "Complexe"), display
   *  as-is. Cards inherit their lane's nature. Optional. */
  nature?: string;
}

/** One column (flow stage). wipLimit null = "non defini", enforces nothing. */
export interface Column {
  id: string;
  name: string;
  wipLimit: number | null;
}

/** A project type ("Achat", "Étude"…) — the client's vocabulary. */
export interface ProjectType {
  id: string;
  name: string;
  /** Compact label shown on radiator bars (e.g. "MEP"). */
  short: string;
}

/** Versioned board topology, loaded from config/board.json. */
export interface BoardConfig {
  lanes: Lane[];
  columns: Column[];
  domains: string[];
  /** Project types; may be empty when the client does not use them. */
  types: ProjectType[];
  /** Ascending day thresholds; cards darken one step per threshold crossed. */
  agingStepsDays: number[];
  /** Blocked longer than this many days gets the static escalation marker. */
  andonThresholdDays: number;
}

/** Card criticality — fixed vocabulary, hard-coded product opinion. */
export type Criticality = "top" | "major" | "normal";

/** Financial snapshot of a subject (port contract, CLAUDE.md section 4). */
export interface Financials {
  budget: number | null;
  consumed: number | null;
  remaining: number | null;
}

/**
 * A portfolio card: one row of the future `cards` table.
 * Position and blocked state are the values at import time; the event log
 * is the truth for anything that happened since (see core/state.ts).
 */
export interface Card {
  id: string;
  title: string;
  domain: string;
  laneId: string;
  columnId: string;
  owner: string;
  /** Criticality marker: top = gold star, major = slate pip. */
  criticality: Criticality;
  /** Project type id (see BoardConfig.types), null when untyped. */
  typeId: string | null;
  /** Code projet (e.g. "PX4520155") — searchable, maskable on cards. */
  codename: string | null;
  tags: string[];
  dependencies: string[];
  blocked: boolean;
  blockedReason: string | null;
  /** ISO timestamp of when the card became blocked, null when not blocked. */
  blockedSince: string | null;
  budget: number | null;
  consumed: number | null;
  remaining: number | null;
  /** ISO timestamp. */
  createdAt: string;
  source: CardSource;
}

/** Event types of the append-only `card_events` log. */
export type CardEventType =
  | "created"
  | "moved"
  | "blocked"
  | "unblocked"
  | "edited"
  | "imported";

/**
 * One row of the append-only `card_events` log: audit trail AND the single
 * source for all flow metrics. Never updated, never deleted.
 */
export interface CardEvent {
  id: string;
  /** ISO timestamp. */
  ts: string;
  actor: string;
  cardId: string;
  type: CardEventType;
  fromColumn: string | null;
  toColumn: string | null;
  payload: Record<string, unknown>;
}

/**
 * A card with its event-derived runtime state: current position, blocked
 * state and the timestamp it entered its current column (drives aging).
 */
export interface CardState extends Card {
  /** ISO timestamp the card entered its current column, from the event log. */
  enteredColumnAt: string;
}

/**
 * The fields an "edited" event may change. Position and blocked state
 * have their own event types; everything else on the card is immutable
 * source data (id, createdAt, source, dependencies).
 */
export type CardPatch = Partial<
  Pick<
    Card,
    | "title"
    | "owner"
    | "domain"
    | "criticality"
    | "typeId"
    | "codename"
    | "tags"
    | "budget"
    | "consumed"
    | "remaining"
  >
>;
