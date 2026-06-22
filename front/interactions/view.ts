// View-mode state and the global keyboard shortcuts that drive it.

import { useCallback, useEffect, useState } from "react";

/** The three keyboard-switchable view modes of CLAUDE.md section 5. */
export type ViewMode = "normal" | "radiator" | "focus";

/**
 * View-mode state: normal/radiator as the base, focus overlays it.
 * Inputs: enterFocus/clearFocus from useFocusCell, whether focus is active.
 * Output: baseMode, the effective mode, and the mode-switch action.
 * Failure: none.
 */
export function useViewMode(enterFocus: () => void, clearFocus: () => void, focusActive: boolean) {
  const [baseMode, setBaseMode] = useState<"normal" | "radiator">("radiator");
  const onMode = useCallback(
    (next: ViewMode) => {
      if (next === "focus") {
        enterFocus();
        return;
      }
      clearFocus();
      setBaseMode(next);
    },
    [enterFocus, clearFocus],
  );
  const mode: ViewMode = focusActive ? "focus" : baseMode;
  return { baseMode, mode, onMode };
}

/**
 * Global shortcuts: 1 normal, 2 radiateur, 3 focus, S sidebar, M metrics,
 * / search, Escape unwinds (the caller decides what Escape closes first —
 * it works even while typing, so the search box can be left with the
 * keyboard). Other keys are ignored while typing or with a modifier held
 * (Ctrl+1 must stay a browser shortcut). Inputs: the mode-switch action,
 * the Escape action, the sidebar toggle, the search-focus action and the
 * metrics toggle. Output: none (effect only). Failure: none.
 */
export function useModeShortcuts(
  onMode: (mode: ViewMode) => void,
  onEscape: () => void,
  onToggleSidebar: () => void,
  onSlash: () => void,
  onMetrics: () => void,
) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === "Escape") {
        onEscape();
        return;
      }
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase() ?? "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === "1") onMode("normal");
      else if (event.key === "2") onMode("radiator");
      else if (event.key === "3") onMode("focus");
      else if (event.key.toLowerCase() === "s") onToggleSidebar();
      else if (event.key.toLowerCase() === "m") onMetrics();
      else if (event.key === "/") {
        event.preventDefault();
        onSlash();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onMode, onEscape, onToggleSidebar, onSlash, onMetrics]);
}
