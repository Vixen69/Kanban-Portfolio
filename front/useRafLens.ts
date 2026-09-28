// The « Périmètre RAF » lens (ADR 048): which métiers the reste à faire
// counts, everywhere on the board at once — headers, canal labels, the
// board gutter. A SESSION state (author, 2026-09-28): it lives in memory,
// a reload returns to « tous métiers », Escape never clears it, nothing is
// written to the log nor to localStorage. The lens also carries the
// divisor of the persons figure: the working days left in the exercise.

import { useCallback, useMemo, useRef, useState } from "react";
import type { BoardConfig } from "../core/types.ts";
import { exerciseStatus, type ExerciseStatus } from "../core/exercise.ts";
import { countedIds, type RafScope } from "../core/raf-card.ts";
import type { LensRow } from "../core/raf.ts";
import { calendarDateOf, workingDaysLeft } from "../core/workdays.ts";

/** The lens as the board reads it. */
export interface BoardLens {
  /** null = every métier of the config (the default), else exactly these. */
  scope: RafScope;
  /** The profile ids counted (the config's métiers within the scope). */
  counted: ReadonlySet<string>;
  /** True while the scope narrows the métiers (the chip shows). */
  active: boolean;
  /**
   * The counted métiers while the lens narrows the board to at least one
   * métier, else null: what sinks the cards it does not concern to the
   * bottom of their cells, dims them, and turns a drop onto a card into a
   * plain move (« rien » partitions nothing — nothing would stay on top).
   */
  narrowing: ReadonlySet<string> | null;
  /** Checks or unchecks one métier. */
  toggle: (profileId: string) => void;
  /** « tout »: every métier again (the lens is off). */
  all: () => void;
  /** « rien »: no métier counted. */
  none: () => void;
  /** Working days left to 31/12 of the exercise shown; null away from the current one. */
  days: number | null;
  /** The exercise shown and its status against the current one. */
  year: number;
  status: ExerciseStatus;
}

// The scope after one métier is toggled: from « tous » the métier is
// removed from the whole list; a scope holding every métier is « tous ».
function toggled(current: RafScope, id: string, ids: readonly string[]): RafScope {
  const next = new Set(current ?? ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return ids.every((known) => next.has(known)) ? null : next;
}

/**
 * The board's lens: its scope, the métiers counted and the divisor.
 * Inputs: the config, the shared clock (epoch ms), the exercise shown.
 * Output: the BoardLens. Failure: none.
 */
export function useBoardLens(config: BoardConfig, nowMs: number, viewYear: number): BoardLens {
  const [scope, setScope] = useState<RafScope>(null);
  const ids = useMemo(() => config.profiles.map((profile) => profile.id), [config]);
  const toggle = useCallback((id: string) => setScope((current) => toggled(current, id, ids)), [ids]);
  const all = useCallback(() => setScope(null), []);
  const none = useCallback(() => setScope(new Set<string>()), []);
  const counted = useMemo(() => countedIds(scope, config), [scope, config]);
  const narrowing = scope !== null && counted.size > 0 ? counted : null;
  const status = exerciseStatus(viewYear, config.exercise.year);
  // Keyed on the local midnight: recomputed once a day, not on every one-minute tick.
  // Past the 31/12 (before the year switch) no day is left: no divisor at all.
  const midnight = new Date(nowMs).setHours(0, 0, 0, 0);
  const days = useMemo(() => {
    const left = status === "current" ? workingDaysLeft(calendarDateOf(midnight), viewYear) : 0;
    return left > 0 ? left : null;
  }, [midnight, status, viewYear]);
  return useMemo(
    () => ({ scope, counted, active: scope !== null, narrowing, toggle, all, none, days, year: viewYear, status }),
    [scope, counted, narrowing, toggle, all, none, days, viewYear, status],
  );
}

/** How a figure reads its reste à faire (ADR 048): the headers, the canals, the cards. */
export interface RafRead {
  /** The métiers counted. */
  counted: ReadonlySet<string>;
  /** True while the lens narrows the métiers. */
  active: boolean;
  /** The scope in words, the tooltip of a lensed value. */
  title: string;
}

/**
 * True when a card falls outside the lens: the lens narrows the board to
 * at least one métier and the card has no reste à faire on any of them.
 * Inputs: the card's RAF on the counted métiers, the read. Output: the
 * flag. Failure: none.
 */
export function outOfScope(raf: number, read: RafRead): boolean {
  return read.active && read.counted.size > 0 && raf <= 0;
}

/**
 * The métier rows in a stable order while the lens is on: the order seen
 * when the lens was switched on holds until « tout », so a card dragged
 * from Actifs to Pause never makes the rows jump under the operator's eyes.
 * Inputs: the rows (core lensRows order), whether the lens is on.
 * Output: the rows to render. Failure: none — a métier unknown to the
 * frozen order goes last.
 */
export function useFrozenOrder(rows: LensRow[], frozen: boolean): LensRow[] {
  const order = useRef<string[] | null>(null);
  if (!frozen) {
    order.current = null;
    return rows;
  }
  if (order.current === null) order.current = rows.map((row) => row.profile.id);
  const rank = new Map(order.current.map((id, index) => [id, index]));
  const last = rank.size;
  return [...rows].sort((a, b) => (rank.get(a.profile.id) ?? last) - (rank.get(b.profile.id) ?? last));
}
