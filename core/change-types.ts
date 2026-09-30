// The shapes of the ONE change engine (ADR 053 + ADR 055): what differs
// between two boards, card by card. « Comparer avec maintenant » (a
// snapshot against the board now) and the import report (the board now
// against the board after the load) both speak these types, so the PMO
// reads one vocabulary. Figures travel as NUMBERS, never preformatted: the
// view formats them and shows the direction. Types and their fixed
// vocabulary only; no logic. Pure; no React, no Node.

/**
 * The kinds of change, in the order they are read:
 * - added / removed: the card is on one board only (removed = gone from the
 *   log's fold: deleted, or not in the snapshot's base cards);
 * - absent / back: the import marked the card absent (∅), or listed it again;
 * - moved: another column, or another canal past the canal-less intake;
 * - domain / type / title / owner / dateRdr: a text fact, from → to;
 * - figure: one money or effort figure (see FigureChange);
 * - plan: the plan de charge (see PlanChange);
 * - archived / unarchived.
 */
export type ChangeKind =
  | "added" | "absent" | "removed" | "back" | "moved" | "domain" | "type" | "title"
  | "owner" | "figure" | "dateRdr" | "plan" | "archived" | "unarchived";

/** The numeric facts of a card compared one by one — the card fields they read. */
export type FigureFact =
  | "budgetRdli" | "budgetEstimated" | "budgetEngaged" | "budgetConsumed" | "effortEstimated" | "effortConsumed";

/** The unit a figure is counted in. */
export type FigureUnit = "k€" | "j.h";

/**
 * The figures, in the order they are read, with their French words and
 * unit — the view and the CLI print these, never their own.
 */
export const FIGURE_FACTS: ReadonlyArray<{ fact: FigureFact; label: string; unit: FigureUnit }> = [
  { fact: "budgetRdli", label: "enveloppe RDLI", unit: "k€" },
  { fact: "budgetEstimated", label: "estimé", unit: "k€" },
  { fact: "budgetEngaged", label: "engagé", unit: "k€" },
  { fact: "budgetConsumed", label: "réalisé", unit: "k€" },
  { fact: "effortEstimated", label: "meilleur estimé", unit: "j.h" },
  { fact: "effortConsumed", label: "consommé", unit: "j.h" },
];

/**
 * One figure that changed. before / after: the value on each board, null
 * when the card carried none. delta: after − before rounded to the
 * hundredth, null when either side is null (positive = up).
 */
export interface FigureChange {
  fact: FigureFact;
  unit: FigureUnit;
  before: number | null;
  after: number | null;
  delta: number | null;
}

/** Planned, done and reste à faire, in j.h (one card, or one métier of it). */
export interface PlanFigures {
  /** Σ planned j.h of the plan de charge. */
  planned: number;
  /** Σ done j.h. */
  done: number;
  /**
   * Reste à faire (ADR 048): per métier max(0, planned − done), summed — the
   * arithmetic every board figure uses (core/raf-card.ts); never the card
   * effort. On a whole card only the config's métiers count.
   */
  raf: number;
}

/** A whole card's plan de charge on one board. */
export interface CardPlanFigures extends PlanFigures {
  /** False = no per-métier plan (« sans ventilation », counted 0). */
  breakdown: boolean;
}

/** One métier whose line of the plan de charge changed (planned, done or RAF). */
export interface ProfilePlanChange {
  /** The profile id (config.profiles). */
  profileId: string;
  before: PlanFigures;
  after: PlanFigures;
}

/**
 * The plan de charge of one card changed: the card totals before and after,
 * and the métiers that changed (largest RAF move first) for the expansion.
 */
export interface PlanChange {
  before: CardPlanFigures;
  after: CardPlanFigures;
  profiles: ProfilePlanChange[];
}

/** What every change says of its card (as it is on the later board). */
export interface ChangeBase {
  cardId: string;
  title: string;
  codename: string | null;
  exercise: number | null;
}

/**
 * One card's change between two boards. Every change carries from / to:
 * - moved: « column » or « column|lane » (the canal once past the intake);
 * - domain, type: config ids; title, owner: the texts; dateRdr: ISO days;
 * - the other kinds: null / null — a figure or plan change carries its
 *   numbers in `figure` or `plan` instead.
 */
export type CardChange =
  | (ChangeBase & { kind: Exclude<ChangeKind, "figure" | "plan">; from: string | null; to: string | null })
  | (ChangeBase & { kind: "figure"; from: null; to: null; figure: FigureChange })
  | (ChangeBase & { kind: "plan"; from: null; to: null; plan: PlanChange });
