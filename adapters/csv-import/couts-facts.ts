// The facts of one COUT PREV project — name, type, état, portefeuille,
// actif — read from ALL its rows, never from the first one (ADR 056: the
// row order of the export used to decide the perimeter, the domain and the
// title when an Id's rows disagreed). The exercise-year rows speak (the
// other years only when there is none); among them the most frequent
// value wins, a tie goes to the most recent « Date d'export », then to the
// string order — the same file read in any row order gives the same
// project. The « Projet.* » columns are the project's, repeated on every
// row of one extraction: rows that disagree, whatever their year, are
// worded for a douteux. Pure.

/** The project facts one row carries. */
export interface RowFacts {
  name: string;
  type: string;
  etat: string;
  portfolio: string;
  actif: string;
  /** « Date d'export » as an ISO date, null when absent or unreadable. */
  exportDate: string | null;
  /** True when the row is on the exercise year. */
  onYear: boolean;
}

/** The facts retained for a project, and what its rows disagreed on. */
export interface ProjectFacts {
  name: string;
  type: string;
  etat: string;
  portfolio: string;
  actif: string;
  /** Plain French, one fragment per disputed fact (« état « A » ×2 / « B » ×1 → « A » »); empty when the rows agree. */
  disagreements: string[];
  /** True when the facts come from exercise-year rows. */
  fromExercise: boolean;
}

type Fact = "name" | "type" | "etat" | "portfolio" | "actif";

/** The facts whose disagreement is worth a douteux (actif is information only). */
const DISPUTED: ReadonlyArray<[Fact, string]> = [["name", "nom"], ["type", "type"], ["etat", "état"], ["portfolio", "portefeuille"]];

interface Tally {
  count: number;
  /** The most recent « Date d'export » among the rows carrying the value ("" when none). */
  latest: string;
}

// Most frequent, then most recent export, then string order: the winner
// never depends on the order the rows came in.
function better(a: [string, Tally], b: [string, Tally]): boolean {
  if (a[1].count !== b[1].count) return a[1].count > b[1].count;
  if (a[1].latest !== b[1].latest) return a[1].latest > b[1].latest;
  return a[0] < b[0];
}

// One fact over the rows: the blank value only when every row is blank.
function resolveOne(rows: readonly RowFacts[], fact: Fact): { value: string; tallies: Array<[string, Tally]> } {
  const tallies = new Map<string, Tally>();
  for (const row of rows) {
    const value = row[fact];
    if (value === "") continue;
    const t = tallies.get(value) ?? { count: 0, latest: "" };
    t.count++;
    if ((row.exportDate ?? "") > t.latest) t.latest = row.exportDate ?? "";
    tallies.set(value, t);
  }
  const entries = [...tallies];
  let best: [string, Tally] | null = null;
  for (const entry of entries) if (best === null || better(entry, best)) best = entry;
  entries.sort((a, b) => (better(a, b) ? -1 : 1));
  return { value: best?.[0] ?? "", tallies: entries };
}

/**
 * Resolves a project's facts from its rows, independent of their order.
 * Input: the rows of one « Projet. Id » (at least one).
 * Output: the retained facts and the disagreements worded for a douteux.
 * Failure modes: none — an empty list yields blank facts.
 */
export function resolveFacts(rows: readonly RowFacts[]): ProjectFacts {
  const onYear = rows.filter((r) => r.onYear);
  const pool = onYear.length > 0 ? onYear : rows;
  const facts: ProjectFacts = {
    name: "", type: "", etat: "", portfolio: "", actif: "", disagreements: [], fromExercise: onYear.length > 0,
  };
  for (const fact of ["name", "type", "etat", "portfolio", "actif"] as const) {
    const value = resolveOne(pool, fact).value;
    facts[fact] = value;
    const label = DISPUTED.find(([f]) => f === fact)?.[1];
    const tallies = label === undefined ? [] : resolveOne(rows, fact).tallies;
    if (label === undefined || tallies.length < 2) continue;
    const values = tallies.map(([v, t]) => `« ${v} » ×${t.count}`).join(" / ");
    facts.disagreements.push(`${label} ${values} → « ${value} »`);
  }
  return facts;
}
