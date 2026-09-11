// Capacity snapshot types (ADR 024/028/029/033/034) — the fact table an
// import replaces as a whole. Split from types.ts to respect the 300-line
// file cap; re-exported by types.ts, so consumers keep importing every
// domain type from "./types.ts".

/**
 * One person of the DSI (Ress.Profils), pseudonymized for the tool (ADR
 * 024): an opaque id derived from the matricule, a display name, the Orga
 * domain / sub-domain and the DSI profile. Email and cost never enter the
 * tool; the event log only ever carries the opaque id.
 */
export interface Person {
  id: string;
  name: string;
  domain: string | null;
  subDomain: string | null;
  /** DSI profile id (BoardConfig.profiles), null when the métier is unresolved. */
  profileId: string | null;
  /** Raw métier label of the source (vocabulary, kept for the read-out). */
  metier: string;
  external: boolean;
  /** Capacity for the exercise year, jours-homme — the person's own « Disponible » line; null when unknown. */
  capacityJh: number | null;
  /** Planned load over the WHOLE plan de charge (every project, on the board
   * or not), j.h — the real engagement (ADR 028); null when absent from it. */
  plannedJh: number | null;
  /** Done over the whole plan de charge, j.h; null when absent from it. */
  doneJh: number | null;
  /** Where the capacity was read: the plan de charge's own « Disponible
   * ressource » line (ADR 029) or Ress.Profils; absent when unknown. */
  capacitySource?: "pdc" | "profils";
  /** "profils" = from Ress.Profils; "pdc" = stub built from an assignment without a profils row. */
  source: "profils" | "pdc";
}

/** One person's planned / actual load on one card for the exercise year (j.h). */
export interface Assignment {
  personId: string;
  cardId: string;
  jh: number;
  done: number;
}

/**
 * Demand carried by no named person (ADR 033): a generic, « zz » or
 * « PE22 » row of the plan de charge, aggregated by métier — the « à
 * pourvoir » of the capacity view. cardId names the board card its project
 * joined, null when the project is outside the board.
 */
export interface GenericDemand {
  /** « Métier » label as exported ("" when absent). */
  metier: string;
  domain: string | null;
  cardId: string | null;
  jh: number;
  done: number;
}

/**
 * The demand the COUT PREV export declares for one card and one cost centre
 * (its « Charge » rows: the PDSI macro's « appel de charges », ADR 034) —
 * the second reading of the same load, cross-checked against the plan de
 * charge. The cost centre speaks the plan de charge's métier vocabulary.
 */
export interface CoutsDemand {
  centre: string;
  cardId: string | null;
  jh: number;
  done: number;
}

/**
 * The capacity snapshot an import replaces as a whole — a fact table, never
 * event-sourced (ADR 024): persons, their assignments, the exercise year,
 * the generic demand by métier (ADR 033) and the COUT PREV demand by cost
 * centre (ADR 034).
 */
export interface CapacitySnapshot {
  exerciseYear: number;
  persons: Person[];
  assignments: Assignment[];
  /** Absent on snapshots stored before ADR 033 (read as empty). */
  generic?: GenericDemand[];
  /** Absent on snapshots stored before ADR 034, or without a COUT PREV file. */
  coutsDemand?: CoutsDemand[];
}
