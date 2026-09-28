// The « Périmètre RAF » lens (ADR 048): which métiers the reste à faire
// counts, everywhere on the board at once — headers, canal labels, the
// board gutter — and, while it counts at least one métier, it FILTERS the
// board: the projects without reste à faire on those métiers disappear
// like with any other filter (author, 2026-09-28, ADR 031). A SESSION
// state: it lives in memory, a reload returns to « tous métiers », Escape
// never clears it, nothing is written to the log nor to localStorage.

import { useCallback, useMemo, useRef, useState } from "react";
import type { BoardConfig } from "../core/types.ts";
import { exerciseStatus, type ExerciseStatus } from "../core/exercise.ts";
import { countedIds, type RafScope } from "../core/raf-card.ts";
import type { LensRow } from "../core/raf.ts";

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
   * métier, else null: the cards without reste à faire on them are then
   * hidden like by any filter (« rien » hides nothing — it would empty the
   * board).
   */
  narrowing: ReadonlySet<string> | null;
  /** Checks or unchecks one métier. */
  toggle: (profileId: string) => void;
  /** « tout »: every métier again (the lens is off). */
  all: () => void;
  /** « rien »: no métier counted. */
  none: () => void;
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
 * The board's lens: its scope and the métiers counted.
 * Inputs: the config, the exercise shown. Output: the BoardLens.
 * Failure: none.
 */
export function useBoardLens(config: BoardConfig, viewYear: number): BoardLens {
  const [scope, setScope] = useState<RafScope>(null);
  const ids = useMemo(() => config.profiles.map((profile) => profile.id), [config]);
  const toggle = useCallback((id: string) => setScope((current) => toggled(current, id, ids)), [ids]);
  const all = useCallback(() => setScope(null), []);
  const none = useCallback(() => setScope(new Set<string>()), []);
  const counted = useMemo(() => countedIds(scope, config), [scope, config]);
  const narrowing = scope !== null && counted.size > 0 ? counted : null;
  const status = exerciseStatus(viewYear, config.exercise.year);
  return useMemo(
    () => ({ scope, counted, active: scope !== null, narrowing, toggle, all, none, year: viewYear, status }),
    [scope, counted, narrowing, toggle, all, none, viewYear, status],
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
 * The métier rows in a stable order while the lens is on: the order seen
 * when the lens was switched on holds until « tout », so a card moved
 * between columns never makes the rows jump under the operator's eyes.
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
