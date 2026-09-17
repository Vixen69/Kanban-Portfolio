// The capacity snapshot of the exercise shown, fetched once for the app
// (ADR 041): the sidebar's « Ressources embarquées » filter reads it, and
// the analytics' Capacité tab shows it. It changes at import only, so it
// stays out of the per-action refresh: `version` is bumped by an import.

import { useEffect, useMemo, useReducer, useState } from "react";
import type { BoardConfig, CapacitySnapshot } from "../core/types.ts";
import { resourceDrawByDomain, type ResourceDraw } from "../core/resource-draw.ts";
import { fetchCapacity } from "./api.ts";

/** The fetch state of the snapshot. */
export type CapacityFetch =
  | { status: "loading" }
  | { status: "ready"; snapshot: CapacitySnapshot | null }
  | { status: "error"; message: string };

/**
 * Fetches the capacity snapshot of one exercise year, again when the year
 * or the version changes.
 * Inputs: the year, a version counter (bumped after an import).
 * Output: the fetch state. Failure modes: none — an unreachable API lands
 * in the error state with its French message.
 */
export function useCapacitySnapshot(year: number, version: number): CapacityFetch {
  const [state, setState] = useState<CapacityFetch>({ status: "loading" });
  useEffect(() => {
    let active = true;
    fetchCapacity(year)
      .then((snapshot) => { if (active) setState({ status: "ready", snapshot }); })
      .catch((cause: unknown) => {
        if (!active) return;
        setState({ status: "error", message: cause instanceof Error ? cause.message : "Erreur inconnue." });
      });
    return () => { active = false; };
  }, [year, version]);
  return state;
}

/**
 * The app's capacity reading of the exercise shown: the fetch state, the
 * cards drawing on each transverse domain (the sidebar filter, ADR 041)
 * and the bump that refetches after an import.
 * Inputs: the year shown, the config. Output: { capacity, draw, bumpCapacity }.
 * Failure modes: none — without a snapshot the draw holds empty sets.
 */
export function useResourceDraw(year: number, config: BoardConfig): { capacity: CapacityFetch; draw: ResourceDraw; bumpCapacity: () => void } {
  const [version, bumpCapacity] = useReducer((n: number) => n + 1, 0);
  const capacity = useCapacitySnapshot(year, version);
  const draw = useMemo(
    () => resourceDrawByDomain(capacity.status === "ready" ? capacity.snapshot : null, config),
    [capacity, config],
  );
  return { capacity, draw, bumpCapacity };
}
