// Domain types shared by core/, adapters/, middle/ and front/.
// Mirrors the data model of CLAUDE.md section 4 (camelCase in TS), extended
// to the validated design v9 (ADR 012: richer card model, comment/delete
// events; ADR 013: runtime board configuration).
//
// The board topology & vocabulary types (Lane, Column, BoardConfig, the
// typologies…) live in ./config-types.ts and are re-exported below, so every
// consumer keeps importing all domain types from "./types.ts".

export type * from "./config-types.ts";

/** Where a card's data originally came from. "manual" = created in the UI. */
export type CardSource = "fixtures" | "csv" | "sciforma" | "manual";

/** Work nature detected at RDO. Keys are fixed; labels come from config. */
export type NatureKey = "simple" | "complicated" | "complex";

/** Card criticality — fixed vocabulary, hard-coded product opinion. */
export type Criticality = "top" | "major" | "normal";

/** Age buckets derived from days-in-column and BoardConfig.age thresholds. */
export type AgeCategory = "fresh" | "recent" | "aging" | "stale";

/** Values a custom field may hold (shallow scalars only). */
export type CustomValue = string | number | boolean | null;

/** Financial snapshot of a subject (PortfolioDataSource port, CLAUDE.md §4). */
export interface Financials {
  budget: number | null;
  consumed: number | null;
  remaining: number | null;
}

/** One profile's share of a card's plan de charge, in jours-homme. */
export interface ChargeEntry {
  /** Profile id (see BoardConfig.profiles). */
  profileId: string;
  /** Charge planifiée, jours-homme. */
  jh: number;
  /** Consommé, jours-homme (0 ≤ done ≤ jh). */
  done: number;
}

/** One retained risk on a card: bearing entity (type) + free description. */
export interface Risk {
  /** Risk type id (see BoardConfig.riskTypes). */
  type: string;
  /** Free-text description of the risk. */
  desc: string;
}

/**
 * A portfolio card: one row of the `cards` table. Position and blocked state
 * are the values at import time; the event log is the truth for anything
 * that happened since (see core/state.ts).
 */
export interface Card {
  id: string;
  title: string;
  /** Domain (RDOM) id — see BoardConfig.domains. */
  domain: string;
  laneId: string;
  columnId: string;
  /** Chef de projet. */
  owner: string;
  criticality: Criticality;
  /** Project type id (see BoardConfig.types), null when untyped. */
  typeId: string | null;
  /** Code projet (e.g. "PX4520155") — searchable, maskable on cards. */
  codename: string | null;
  /** Work nature detected at RDO; initialized from the lane, then per-card. */
  nature: NatureKey;
  tags: string[];
  dependencies: string[];
  blocked: boolean;
  blockedReason: string | null;
  /** ISO timestamp of when the card became blocked, null when not blocked. */
  blockedSince: string | null;
  /** Meilleur estimé, jours-homme. */
  effortEstimated: number | null;
  /** Consommé, jours-homme. */
  effortConsumed: number | null;
  /** Budget estimé, k€. */
  budgetEstimated: number | null;
  /** Budget consommé, k€. */
  budgetConsumed: number | null;
  /** Plan de charge (free label, e.g. "1,5 ETP"). */
  loadPlan: string | null;
  /** Ressources clés (roles/teams engaged). */
  resources: string[];
  notes: string;
  /** Budget engagé (commandes/contrats), k€, null si inconnu. */
  budgetEngaged: number | null;
  /** Enveloppe RDLI arbitrée (référence d'arbitrage budgétaire), k€, null si inconnu. */
  budgetRdli: number | null;
  /** Plan de charge détaillé : j.h par profil DSI. */
  chargeByProfile: ChargeEntry[];
  /** Profils en tension (risque de contention) — profile ids. */
  contentionProfiles: string[];
  /** Note libre sur la contention (partage, disponibilité, conflits). */
  contentionNote: string;
  /** Risques retenus (par entité porteuse). */
  risks: Risk[];
  /** Contraintes projet cochées — project-constraint ids. */
  projectConstraints: string[];
  /** Alertes libres (texte), multiples. */
  alerts: string[];
  /** Date de livraison (RDR) projetée, ISO date, null si non planifiée. */
  dateRdr: string | null;
  /** Read-only reference to the source PPM record, null when unlinked. */
  sciformaId: string | null;
  /** Values of admin-defined custom fields, keyed by FieldDef.id. */
  custom: Record<string, CustomValue>;
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
  | "commented"
  | "deleted"
  | "imported";

/**
 * One row of the append-only `card_events` log: audit trail AND the single
 * source for all flow metrics. Never updated, never deleted. A card's
 * deletion is itself an event ("deleted"); the log keeps everything.
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

/** One comment on a card, projected from a "commented" event. */
export interface CardComment {
  actor: string;
  /** ISO timestamp. */
  ts: string;
  text: string;
}

/**
 * A card with its event-derived runtime state: current position, blocked
 * state, comments, and the timestamp it entered its current column (drives
 * aging). Cards with a "deleted" event are absent from folded output.
 */
export interface CardState extends Card {
  /** ISO timestamp the card entered its current column, from the event log. */
  enteredColumnAt: string;
  /** Comments in chronological order, from "commented" events. */
  comments: CardComment[];
}

/**
 * The fields an "edited" event may change. Position (moved), blocked state
 * (blocked/unblocked) and comments (commented) have their own event types;
 * id, createdAt, source and sciformaId are immutable source data.
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
    | "nature"
    | "tags"
    | "effortEstimated"
    | "effortConsumed"
    | "budgetEstimated"
    | "budgetConsumed"
    | "loadPlan"
    | "resources"
    | "notes"
    | "budgetEngaged"
    | "budgetRdli"
    | "chargeByProfile"
    | "contentionProfiles"
    | "contentionNote"
    | "risks"
    | "projectConstraints"
    | "alerts"
    | "dateRdr"
    | "custom"
  >
>;
