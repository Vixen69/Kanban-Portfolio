// Verbatim design/data.jsx distribution tables driving the deterministic
// 150-subject portfolio (split from generate.ts for the 300-line file cap).
// Every table is data only; generate.ts consumes them in the design's exact
// RNG order.

import type { NatureKey } from "../../core/types.ts";

/** One canal quota: lane, its nature mapping and criticality counts. */
export interface CanalSpec {
  laneId: string;
  nature: NatureKey;
  top: number;
  major: number;
  normal: number;
}

/** Canal fills (sum 150); nature is fixed per canal (design step 1). */
export const CANALS: CanalSpec[] = [
  { laneId: "projets", nature: "complicated", top: 7, major: 14, normal: 29 },
  { laneId: "petits_projets", nature: "simple", top: 1, major: 8, normal: 51 },
  { laneId: "projets_complexes", nature: "complex", top: 2, major: 8, normal: 30 },
];

/** Column fills (sum 150); "pause" starts empty. */
export const COLUMN_FILL: [string, number][] = [
  ["demandes", 23], ["qualification", 18], ["etudes", 27], ["prets", 12],
  ["actifs", 37], ["done", 15], ["exploitation", 18],
];

/** Domain (RDOM) fills, ingenierie…cyber (sum 150). */
export const DOMAIN_FILL: [string, number][] = [
  ["ingenierie", 23], ["soutien", 15], ["industrie", 15], ["corporate", 21],
  ["erp", 18], ["plm", 15], ["infra", 18], ["archi_dev", 15], ["cyber", 10],
];

/** Project-type fills (sum 150). */
export const TYPE_FILL: [string, number][] = [["mise_en_oeuvre", 40], ["evolution_tma", 35],
  ["etude", 25], ["obsolescence", 20], ["tma_corrective", 18], ["achat", 12]];

/** Blocked-card quotas per column, applied in this order (design step 3). */
export const BLOCKED_FILL: [string, number][] =
  [["qualification", 3], ["etudes", 4], ["actifs", 9], ["done", 2]];

/**
 * Day-in-column range per stage (design AGE_PROFILE) — active/study stages
 * skew older. Blocked cards get at least rand(35, hi) days (rand(35, 28)
 * degenerates to 29–35 for "done"). Exported so the event tests can assert
 * the seeded aging texture band by band. Failure: none (data table).
 */
export const AGE_PROFILE: Record<string, [number, number]> = {
  demandes: [1, 22], qualification: [4, 48], etudes: [18, 95], prets: [1, 26],
  actifs: [12, 130], done: [3, 28], exploitation: [8, 80],
};

/** Days spent in a prior stage when reconstructing the path backwards. */
export const STEP_DAYS: Record<string, [number, number]> = {
  demandes: [2, 18], qualification: [3, 20], etudes: [10, 45], prets: [1, 14],
  actifs: [15, 70], done: [3, 16], exploitation: [10, 60],
};

/** Consumed/estimated effort ratio band per stage (nothing before Actifs). */
export const CONSUMED_RATIO: Record<string, [number, number]> = {
  demandes: [0, 0], qualification: [0, 0.05], etudes: [0, 0.12], prets: [0, 0.05],
  actifs: [0.15, 0.85], done: [0.85, 1.1], exploitation: [0.9, 1.15],
};

/** Best-estimate band (jours-homme) per canal. */
export const EFFORT_BAND: Record<string, [number, number]> = {
  petits_projets: [10, 60], projets: [60, 320], projets_complexes: [40, 260],
};

/** The pull-flow path; "pause" is a parking column, never on the path. */
export const FLOW_ORDER =
  ["demandes", "qualification", "etudes", "prets", "actifs", "done", "exploitation"];
