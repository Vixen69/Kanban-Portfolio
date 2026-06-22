// Small generic UI-state hooks used across the board chrome.

import { useCallback, useEffect, useState } from "react";

/**
 * The clock the aging visuals read. Re-reads the time periodically so a
 * board left on a wall display keeps darkening across day boundaries.
 * Input: refresh interval in ms (default one hour — day-level visuals
 * need no finer grain). Output: the current Date. Failure: none.
 */
export function useNow(intervalMs = 3_600_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Boolean UI state with stable actions (sidebar, codes, metrics panels).
 * Input: the initial value. Output: { on, toggle, setOn, setOff }.
 * Failure: none.
 */
export function useToggle(initial: boolean) {
  const [on, set] = useState(initial);
  const toggle = useCallback(() => set((value) => !value), []);
  const setOn = useCallback(() => set(true), []);
  const setOff = useCallback(() => set(false), []);
  return { on, toggle, setOn, setOff };
}
