// Full screen for the meeting room (author, 2026-09-29: « un mode où tu me
// prends tout l'écran », the cursor and every control kept): the browser's
// Fullscreen API on the whole page — the address bar and tabs go, the
// board keeps its height. Escape (the browser's own) or F leaves it.

import { useCallback, useEffect, useState } from "react";

/** The full-screen state and its switch. */
export interface Fullscreen {
  /** True while the page fills the screen. */
  full: boolean;
  /** False when the browser refuses full screen (the button then hides). */
  supported: boolean;
  toggle: () => void;
}

/**
 * The page's full-screen state, kept in step with the browser (Escape,
 * F11 or the browser's own controls may leave it too).
 * Output: the Fullscreen. Failure: a refused request (policy, iframe) is
 * swallowed — the page simply stays as it was.
 */
export function useFullscreen(): Fullscreen {
  const [full, setFull] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = useCallback(() => {
    const request = document.fullscreenElement !== null
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    request.catch(() => undefined);
  }, []);
  return { full, supported: document.fullscreenEnabled, toggle };
}
