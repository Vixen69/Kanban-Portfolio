// Sticky view preferences (design v12): the two Σ toggles that unfold the
// per-column and per-canal totals. These are pure view preferences of ONE
// operator's browser — not portfolio data, not topology — so they live in
// localStorage rather than in the board config or the event log (ADR 020).
//
// This is the first and only client-side storage in the product: it holds
// two booleans, never card data, and every access is guarded so a browser
// with storage disabled (or a private window) degrades to the defaults
// instead of throwing. Nothing here may ever reach core/ — core stays
// DOM-free and dependency-free.

import { useCallback, useState } from "react";

// Reads a "1"/"0" flag. Any failure (disabled storage, quota, SecurityError
// behind a strict privacy setting) falls back to the default silently: a
// missing preference must never break the board.
function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

// Best-effort persist. A failure is deliberately swallowed — the toggle
// still works for the session, it just will not be remembered.
function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage unavailable: keep the in-memory state, drop the persistence.
  }
}

/**
 * A boolean view preference remembered across reloads.
 * Inputs: the localStorage key, the default used when nothing is stored or
 * storage is unavailable.
 * Output: the current value and a toggle that flips and persists it.
 * Failure: none — storage errors degrade to session-only state.
 */
export function useStoredFlag(key: string, fallback: boolean): [boolean, () => void] {
  const [value, setValue] = useState(() => readFlag(key, fallback));
  const toggle = useCallback(() => {
    setValue((current) => {
      const next = !current;
      writeFlag(key, next);
      return next;
    });
  }, [key]);
  return [value, toggle];
}

/**
 * localStorage key of the per-column totals toggle. FOLDED by default —
 * the mockup shipped it unfolded, but a 5-row block plus a 19-profile list
 * makes a 230px column header and breaks the one-screen criterion (§5).
 * Compact is the state the criterion is measured in; unfolding is a
 * deliberate zoom that may scroll (ADR 020).
 */
export const COLUMN_TOTALS_KEY = "nmo_totals_open";
/** localStorage key of the per-canal totals toggle (folded by default). */
export const LANE_TOTALS_KEY = "nmo_lane_totals_open";
