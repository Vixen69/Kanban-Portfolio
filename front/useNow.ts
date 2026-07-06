// The UI clock: age pills, stale markers and blocked durations re-render as
// time passes, even on a board left open on a wall display.

import { useEffect, useState } from "react";

/**
 * Current time in epoch milliseconds, refreshed on an interval.
 * Input: refresh interval in ms (default 1000 — one UI tick per second).
 * Output: Date.now() as of the latest tick. Failure: none.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
