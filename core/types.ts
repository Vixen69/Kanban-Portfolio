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
  /**
   * Domain id — see BoardConfig.domains. "" = no domain (ADR 061): an imported
   * project whose export resolves none waits for a hand assignment — never a default domain.
   */
  domain: string;
  /**
   * « Domaine à vérifier » (ADR 061): written by the import on a stored
   * card whose export resolves no domain while no human ever set it — the
   * domain it wears may be the old first-domain fallback. Recomputed at
   * each load; an `edited` event carrying a domain clears it in the fold.
   * Absent (never true) on every other card.
   */
  domainUnresolved?: boolean;
  /**
   * How the last load that POSITIONED this card placed it (ADR 060
   * amendment): true = a Sciforma done state sent it to the terminal
   * column (ADR 043), false = its jalons placed it. Written by the import
   * on the base card, kept by a load without position; it tells a done
   * state NEW since the previous import — the one position that takes a
   * card out of Pause — from a repeat. Absent on a card no load
   * positioned since the field exists, and on a hand-made card.
   */
  doneByState?: boolean;
  /**
   * Sub-domain id within `domain` (see Domain.subDomains), null when the
   * domain is not detailed or the card carries none (ADR 022).
   */
  subDomain: string | null;
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
  /**
   * The exercise (budget year) the card belongs to (ADR 035). Absent on
   * cards stored before: they belong to the current exercise, whatever it
   * is (core/exercise.ts exerciseOf).
   */
  exercise?: number;
}

/** Event types of the append-only `card_events` log. */
export type CardEventType =
  | "created"
  | "moved"
  | "blocked"
  | "unblocked"
  | "edited"
  | "commented"
  | "archived"
  | "unarchived"
  | "deleted"
  | "imported"
  | "decided"
  | "unlisted"
  | "relisted"
  /** The card's exercise became the current one (ADR 035): its aging clock starts now. */
  | "activated"
  /** Board-wide (cardId "*", ADR 042): the log is read again from payload.toSeq — a snapshot was restored. */
  | "restored";

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

/** Where a decision was taken — the paper fiche's bloc 1 (ADR 052). */
export type DecisionInstance = "revue" | "synchro";

/** A pause's kind (ADR 052, optional): tactique = rediscussed at the next synchro; parking = later. */
export type PauseKind = "tactique" | "parking";

/** What a decision frees or commits — bloc 4 of the fiche (ADR 052). */
export interface DecisionFrees {
  people: string;
  budget: string;
  capacity: string;
}

/** One decision on a card (D1–D6, ADR 026), projected from a "decided" event. */
export interface CardDecision {
  actor: string;
  /** ISO timestamp. */
  ts: string;
  decisionId: string;
  /** Grid terms (config decisionGrounds ids) the decision is motivated with. */
  grounds: string[];
  reason: string;
  /** Planned review, ISO day (YYYY-MM-DD); null when none. */
  reviewDate: string | null;
  // The fiche's other blocks (ADR 052) — empty on decisions recorded before it.
  instance: DecisionInstance | null;
  /** Options set aside, and why (bloc 3). */
  options: string;
  frees: DecisionFrees;
  /** What is expected to lift the pause (bloc 5). */
  liftCondition: string;
  pauseKind: PauseKind | null;
  /** What changed in the subject's nature (bloc 6), and the canal from → to. */
  natureChange: string;
  fromLaneId: string | null;
  toLaneId: string | null;
  architectValidated: boolean;
  /** The day the decision was taken when traced after the fact (YYYY-MM-DD). */
  decidedOn: string | null;
}

/**
 * A card with its event-derived runtime state: current position, blocked
 * state, archived flag, comments, and the timestamp it entered its current
 * column (drives aging). Cards with a "deleted" event are absent from
 * folded output; archived cards stay in it (the archive view lists them)
 * but leave the board and every count.
 */
export interface CardState extends Card {
  /** ISO timestamp the card entered its current column, from the event log. */
  enteredColumnAt: string;
  /** Comments in chronological order, from "commented" events. */
  comments: CardComment[];
  /** True after an "archived" event (reversible via "unarchived"). */
  archived: boolean;
  /** Decisions in chronological order, from "decided" events (ADR 026). */
  decisions: CardDecision[];
  /** ISO ts the card last LEFT Pause (ADR 052); absent = never left it. The pause in force is the last one decided after it. */
  pauseLeftAt?: string;
  /** ISO ts of the import that did not list the card (ADR 026); null when listed. */
  absentFromLastImport: string | null;
}

/**
 * The fields an "edited" event may change. Position (moved), blocked state
 * (blocked/unblocked) and comments (commented) have their own event types;
 * id, createdAt, source and sciformaId are immutable source data. Nature is
 * NOT editable (design v11): it is positional — carried by the canal.
 */
export type CardPatch = Partial<
  Pick<
    Card,
    | "title"
    | "owner"
    | "domain"
    | "subDomain"
    | "criticality"
    | "typeId"
    | "codename"
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
    | "exercise"
  >
>;

// The capacity snapshot types (persons, assignments, generic and COUT PREV
// demand — ADR 024/033/034) live in capacity-types.ts, re-exported here.
export type { Assignment, CapacitySnapshot, CoutsDemand, GenericDemand, Person } from "./capacity-types.ts";
