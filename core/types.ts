// Domain types shared by core/, adapters/, middle/ and front/.
// Mirrors the data model of CLAUDE.md section 4 (camelCase in TS), extended
// to the validated design v9 (ADR 012: richer card model, comment/delete
// events; ADR 013: runtime board configuration).

/** Where a card's data originally came from. "manual" = created in the UI. */
export type CardSource = "fixtures" | "csv" | "sciforma" | "manual";

/** Work nature detected at RDO. Keys are fixed; labels come from config. */
export type NatureKey = "simple" | "complicated" | "complex";

/** Card criticality — fixed vocabulary, hard-coded product opinion. */
export type Criticality = "top" | "major" | "normal";

/** Quality gates. Human decisions at governance — never enforced in software. */
export type GateCode = "DoR" | "DoD";

/** Age buckets derived from days-in-column and BoardConfig.age thresholds. */
export type AgeCategory = "fresh" | "recent" | "aging" | "stale";

/** One swimlane ("canal"). nature/detail are free display text from config. */
export interface Lane {
  id: string;
  name: string;
  /** Subtitle under the lane name (e.g. "Compliqué"). Display as-is. */
  nature: string;
  /** One-line description of the canal's governance (tooltips/admin). */
  detail: string;
}

/** One column (flow stage). wip null = no limit; a set WIP warns, never blocks. */
export interface Column {
  id: string;
  name: string;
  wip: number | null;
  /** Gate at the entry of this column, or null. Rendered as a badge + line. */
  gate: GateCode | null;
  /** Short functional note shown under the column name. */
  note: string;
  /** Declarative marker (design: Actifs). No behavior attached today. */
  hasBlockedZone?: boolean;
}

/** A responsible domain (RDOM) with its display color and 3-letter code. */
export interface Domain {
  id: string;
  name: string;
  short: string;
  color: string;
}

/** A project type ("Achat", "Étude"…) — more visible than the domain on cards. */
export interface ProjectType {
  id: string;
  name: string;
  short: string;
  color: string;
}

/** Display style of one nature (label is renamable in config, key is not). */
export interface NatureStyle {
  label: string;
  bg: string;
  fg: string;
}

/** Display style of one criticality. badge null = no badge (normal). */
export interface CriticalityStyle {
  label: string;
  badge: string | null;
  bg?: string;
  fg?: string;
}

/** Definition of a quality gate (full name + color). */
export interface GateDef {
  name: string;
  color: string;
}

/** Input kinds a custom card field can take. */
export type FieldType = "text" | "number" | "date" | "select" | "checkbox" | "person";

/** One option of a "select" custom field. */
export interface FieldOption {
  label: string;
  color: string;
}

/** An admin-defined custom card field (detail panel; optional card badge). */
export interface FieldDef {
  id: string;
  name: string;
  type: FieldType;
  /** Show the value as a badge on the expanded (focus) card. */
  showOnCard: boolean;
  /** Only for type "select". */
  options?: FieldOption[];
}

/** Day thresholds separating fresh / recent / aging / stale. */
export interface AgeThresholds {
  freshMaxDays: number;
  recentMaxDays: number;
  agingMaxDays: number;
}

/**
 * Versioned board topology. Defaults live in config/board.json; a runtime
 * override applied from the admin panel is persisted by the middle with an
 * append-only history (ADR 013). Behavior stays hard-coded — only topology,
 * vocabulary and thresholds live here.
 */
export interface BoardConfig {
  lanes: Lane[];
  columns: Column[];
  domains: Domain[];
  types: ProjectType[];
  natures: Record<NatureKey, NatureStyle>;
  criticalities: Record<Criticality, CriticalityStyle>;
  gateDefs: Record<GateCode, GateDef>;
  fields: FieldDef[];
  age: AgeThresholds;
  /** Blocked longer than this many days gets the static escalation marker. */
  andonThresholdDays: number;
}

/** Values a custom field may hold (shallow scalars only). */
export type CustomValue = string | number | boolean | null;

/** Financial snapshot of a subject (PortfolioDataSource port, CLAUDE.md §4). */
export interface Financials {
  budget: number | null;
  consumed: number | null;
  remaining: number | null;
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
    | "custom"
  >
>;
