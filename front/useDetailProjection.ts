// The fiche's projections from the log, memoised per card and per log:
// the Historique, the Délais, the stage anchors, and how many of the
// card's events a snapshot restore undid (ADR 042).

import { useMemo } from "react";
import type { BoardConfig, CardState } from "../core/types.ts";
import { flowTimes, resolveFlowAnchors, type FlowAnchors, type FlowTimes } from "../core/flow.ts";
import { cardHistory, type HistoryEntry } from "../core/history.ts";
import type { BoardStore } from "./useBoardStore.ts";

/** What the detail modal reads from the log. */
export interface DetailProjection {
  history: HistoryEntry[];
  flow: FlowTimes;
  anchors: FlowAnchors | null;
  undone: number;
}

/**
 * Projects the open card's history, flow times, anchors and undone count.
 * Inputs: the store, the config, the open card (null when none), the
 * shared clock in ms. Output: the DetailProjection (empty for no card).
 * Failure modes: none.
 */
export function useDetailProjection(store: BoardStore, config: BoardConfig, detailCard: CardState | null, nowMs: number): DetailProjection {
  const history = useMemo(
    () => (detailCard ? cardHistory(store.events, detailCard.id, config) : []),
    [store.events, detailCard, config],
  );
  const flow = useMemo(
    () => flowTimes(store.events, detailCard?.id ?? "", config, new Date(nowMs)),
    [store.events, detailCard, config, nowMs],
  );
  const anchors = useMemo(() => resolveFlowAnchors(config), [config]);
  const undone = useMemo(
    () => (detailCard ? store.undone.filter((event) => event.cardId === detailCard.id).length : 0),
    [store.undone, detailCard],
  );
  return { history, flow, anchors, undone };
}
