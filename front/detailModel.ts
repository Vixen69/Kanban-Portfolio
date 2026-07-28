// Pure derivations for the card detail modal (design/modals.jsx computed
// block): the budget cross-graph rows, the projected RDR date state, and
// the plan-de-charge profile rows. No React, no network.

import type { BoardConfig, CardState } from "../core/types.ts";

const DAY_MS = 86_400_000;

/** Column display name (falls back to the id, then "Entrée"). */
export function colLabel(config: BoardConfig, id: string): string {
  return config.columns.find((column) => column.id === id)?.name ?? id ?? "Entrée";
}

/** One bar of the budget cross-graph. `ref` marks the RDLI envelope. */
export interface BudgetRow {
  key: "rdli" | "est" | "eng" | "real";
  /** The Card field an inline edit of this bar patches. */
  field: "budgetRdli" | "budgetEstimated" | "budgetEngaged" | "budgetConsumed";
  label: string;
  val: number;
  color: string;
  ref?: boolean;
}

/** The budget cross-graph model: RDLI · estimé · engagé · réalisé. */
export function budgetModel(card: CardState): { rows: BudgetRow[]; bMax: number; bRdli: number; bReal: number } {
  const bReal = card.budgetConsumed ?? 0;
  const bEst = card.budgetEstimated ?? 0;
  const bRdli = card.budgetRdli ?? Math.round(bEst * 1.05);
  const bEng = card.budgetEngaged ?? Math.round(bReal + (Math.max(bEst, bReal) - bReal) * 0.5);
  const bMax = Math.max(bRdli, bEst, bEng, bReal, 1) * 1.04;
  const rows: BudgetRow[] = [
    { key: "rdli", field: "budgetRdli", label: "Enveloppe RDLI", val: bRdli, color: "#94a3b8", ref: true },
    { key: "est", field: "budgetEstimated", label: "Meilleur estimé", val: bEst, color: "var(--accent)" },
    { key: "eng", field: "budgetEngaged", label: "Engagé", val: bEng, color: "#b45309" },
    { key: "real", field: "budgetConsumed", label: "Réalisé", val: bReal, color: bReal > bRdli ? "var(--danger)" : "var(--ok)" },
  ];
  return { rows, bMax, bRdli, bReal };
}

/** Projected RDR (delivery) date state and labels. */
export interface RdrModel {
  state: "" | "soon" | "past";
  formatted: string;
  sub: string;
}

export function rdrModel(card: CardState, now: number): RdrModel {
  const ms = card.dateRdr ? Date.parse(card.dateRdr) : null;
  if (ms === null || Number.isNaN(ms)) return { state: "", formatted: "—", sub: "non planifiée" };
  const days = Math.round((ms - now) / DAY_MS);
  const formatted = new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  const state = days < 0 ? "past" : days <= 30 ? "soon" : "";
  const sub = days < 0 ? `échue depuis ${Math.abs(days)} j` : `dans ${days} j`;
  return { state, formatted, sub };
}

/** One plan-de-charge row, resolved to its profile display + remainder. */
export interface ProfileRow {
  profileId: string;
  jh: number;
  done: number;
  name: string;
  color: string;
  raf: number;
}

/**
 * Plan-de-charge rows sorted by descending j.h, plus max/total for the bars
 * and the summed per-profile consumed (design v11 « consommés » subtitle).
 */
export function profileRows(card: CardState, config: BoardConfig): { rows: ProfileRow[]; max: number; total: number; done: number } {
  const rows = card.chargeByProfile.map((entry) => {
    const profile = config.profiles.find((p) => p.id === entry.profileId);
    return {
      profileId: entry.profileId,
      jh: entry.jh,
      done: entry.done ?? 0,
      name: profile?.name ?? entry.profileId,
      color: profile?.color ?? "#64748b",
      raf: Math.max(0, entry.jh - (entry.done ?? 0)),
    };
  }).sort((a, b) => b.jh - a.jh);
  const max = Math.max(1, ...rows.map((row) => row.jh));
  const total = rows.reduce((sum, row) => sum + row.jh, 0);
  const done = rows.reduce((sum, row) => sum + row.done, 0);
  return { rows, max, total, done };
}
