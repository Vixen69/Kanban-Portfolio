// Board topology & vocabulary types (the configurable surface — CLAUDE.md §4).
// Split from types.ts to respect the 300-line file cap. Re-exported by
// types.ts, so consumers keep importing every domain type from "./types.ts".

import type { Criticality, NatureKey } from "./types.ts";

/** Quality gates. Human decisions at governance — never enforced in software. */
export type GateCode = "DoR" | "DoD";

/** One swimlane ("canal"). nature/detail are free display text from config. */
export interface Lane {
  id: string;
  name: string;
  /** Subtitle under the lane name (e.g. "Compliqué"). Display as-is. */
  nature: string;
  /**
   * The nature this canal confers to its cards (design v11: nature is
   * positional — a card's nature IS its canal; requalifying a subject means
   * moving it to another canal, never editing a tag).
   */
  natureKey: NatureKey;
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

/** A sub-domain of a domain (ADR 022) — vocabulary only, no color of its own. */
export interface SubDomain {
  id: string;
  name: string;
}

/**
 * A domain (the client's « Domaine (Orga) » vocabulary) with its display
 * color and 3-letter code. `subDomains` is only declared on the domains the
 * PMO wants detailed (ADR 022: A&D and CORPORATE); absent elsewhere, where
 * the sub-domain is folded into the domain.
 */
export interface Domain {
  id: string;
  name: string;
  short: string;
  color: string;
  subDomains?: SubDomain[];
  /**
   * A shared-resource domain (ADR 024: Architecture & Développement,
   * Infrastructure) — every subject draws on it, so its capacity is the
   * portfolio's binding constraint and the arbitration read-outs single it out.
   */
  transverse?: boolean;
  /**
   * Export labels the import reads this domain from (« INFRASTRUCTURE »,
   * « GROUPE ») — matched as whole words inside a « Domaine (Orga) » label
   * or a Sciforma portfolio segment (ADR 030).
   */
  aliases?: string[];
}

/** A project type ("Achat", "Étude"…) — more visible than the domain on cards. */
export interface ProjectType {
  id: string;
  name: string;
  short: string;
  color: string;
  /** Export labels the import reads this type from when they differ from the
   * name (« Projet de gestion d’obsolescence » shown as « Obsolescence »). */
  aliases?: string[];
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

/** A resource role family ("Architecture", "Développement"…), for grouping. */
export interface RoleFamily {
  id: string;
  name: string;
  color: string;
}

/** A DSI staffing profile — the unit of plan de charge (j.h) and contention. */
export interface Profile {
  id: string;
  name: string;
  color: string;
}

/** A risk typology entry (the entity/métier bearing the risk). */
export interface RiskType {
  id: string;
  name: string;
  short: string;
  color: string;
}

/** A checkable project constraint ("Légale / réglementaire", "Groupe"). */
export interface ProjectConstraint {
  id: string;
  name: string;
  short: string;
  color: string;
}

/** Fixed risk-severity keys — labels/colors/rank come from config. */
export type RiskSeverityKey = "faible" | "moyen" | "eleve";

/** Display style and comparison rank of one risk severity. */
export interface RiskSeverityStyle {
  label: string;
  color: string;
  rank: number;
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

/** The exercise (budget year) the board reads: charges, costs and capacity are that year's. */
export interface ExerciseConfig {
  year: number;
  /**
   * The Sciforma process states that keep a project in the perimeter read
   * from the COUT PREV export (ADR 030); absent = no state filter (the
   * import says so in its report).
   */
  states?: string[];
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
/** Family of a grid term (ADR 026): what protects a subject, what pauses it. */
export type DecisionGroundFamily = "proteger" | "pause";

/** One of the portfolio decisions (Référentiel V3.1 D1–D6, ADR 026). */
export interface DecisionType {
  id: string;
  name: string;
  short: string;
  color: string;
  /** The reason (grid terms or text) is mandatory — « non tracée = non prise ». */
  traced: boolean;
}

/** One term of the arbitration grid a decision is motivated with. */
export interface DecisionGround {
  id: string;
  name: string;
  family: DecisionGroundFamily;
}

export interface BoardConfig {
  lanes: Lane[];
  columns: Column[];
  domains: Domain[];
  types: ProjectType[];
  natures: Record<NatureKey, NatureStyle>;
  criticalities: Record<Criticality, CriticalityStyle>;
  gateDefs: Record<GateCode, GateDef>;
  fields: FieldDef[];
  /** Resource role families (group the Ressources view; read contention by métier). */
  roleFamilies: RoleFamily[];
  /** DSI staffing profiles (plan de charge j.h + contention checklists). */
  profiles: Profile[];
  /** Maps a key resource name to its role-family id (Ressources grouping). */
  roleOf: Record<string, string>;
  /** Risk typology (par entité porteuse). */
  riskTypes: RiskType[];
  /** Checkable project constraints (Légale, Groupe…). */
  projectConstraints: ProjectConstraint[];
  /** Risk-severity styles keyed by the fixed severity key. */
  riskSeverity: Record<RiskSeverityKey, RiskSeverityStyle>;
  age: AgeThresholds;
  /** Blocked longer than this many days gets the static escalation marker. */
  andonThresholdDays: number;
  /** The exercise year (ADR 024) — the PdC / SP window the import reads. */
  exercise: ExerciseConfig;
  /** The portfolio decisions D1–D6 (ADR 026). */
  decisions: DecisionType[];
  /** The arbitration grid's terms (ADR 026). */
  decisionGrounds: DecisionGround[];
}
