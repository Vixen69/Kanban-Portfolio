// The admin panel's writes, App → store: each closes the panel on success
// and hands the French failure back to it otherwise (the panel stays open
// with its draft). Taking a snapshot keeps the panel open — its list
// refreshes in place (ADR 042).

import type { BoardConfig } from "../core/types.ts";
import type { BoardStore } from "./useBoardStore.ts";
import type { UiState } from "./useInteractions.ts";

/** The panel's write callbacks, each resolving null on success or the French message. */
export interface AdminWrites {
  onApply: (next: BoardConfig) => Promise<string | null>;
  onReset: () => Promise<string | null>;
  onSwitch: (year: number) => Promise<string | null>;
  onTakeSnapshot: (label: string) => Promise<string | null>;
  onRestoreSnapshot: (id: string) => Promise<string | null>;
}

/**
 * Builds the panel's write callbacks over the store.
 * Inputs: the store, the UI state (to close the panel), what to run after
 * a successful restore (the capacity refetch — a restore may change it).
 * Output: the AdminWrites. Failure modes: none.
 */
export function adminWrites(store: BoardStore, ui: UiState, afterRestore: () => void): AdminWrites {
  const closing = (write: Promise<string | null>) => write.then((failure) => {
    if (failure === null) ui.setAdmin(false);
    return failure;
  });
  return {
    onApply: (next) => closing(store.saveConfig(next)),
    onReset: () => closing(store.resetConfig()),
    onSwitch: (year) => closing(store.switchExercise(year)),
    onTakeSnapshot: (label) => store.takeSnapshot(label),
    onRestoreSnapshot: (id) => closing(store.restoreSnapshot(id).then((failure) => {
      if (failure === null) afterRestore();
      return failure;
    })),
  };
}
