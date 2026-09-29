// The last move, on screen and for screen readers (useMoveFlash). The
// outline is a rule keyed on the card's data-card-id, so the memoised
// radiator bars never re-render for it; the live zone is always in the
// page (visually hidden) so screen readers hear each new sentence.

import type { MoveFlashState } from "../useMoveFlash.ts";

/**
 * The outline rule of the moved card and the polite live zone.
 * Input: the current signal (null: nothing outlined, the zone empty).
 * Output: a style element and the live zone. Failure modes: none.
 */
export function MoveFlash({ current }: { current: MoveFlashState | null }) {
  const id = current === null ? null : CSS.escape(current.id);
  return (
    <>
      {id !== null && (
        <style>{`.mini[data-card-id="${id}"], .focus-card[data-card-id="${id}"] { outline: 2px solid #0f172a; outline-offset: -2px; }`}</style>
      )}
      <div className="sr-only" aria-live="polite" role="status">{current?.text ?? ""}</div>
    </>
  );
}
