// The header's full-screen button (author, 2026-09-29): four corners
// pointing out to fill the screen, pointing in to leave it. Drawn inline —
// no icon library.

// Corner brackets on a 24-unit grid: outward (enter) or inward (leave).
const EXPAND = "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5";
const COMPRESS = "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5";

/**
 * The full-screen switch.
 * Inputs: whether the page is full screen, the toggle. Output: the icon
 * button. Failure modes: none.
 */
export function FullscreenButton({ full, onToggle }: { full: boolean; onToggle: () => void }) {
  const label = full ? "Quitter le plein écran (F ou Échap)" : "Plein écran (F) — en plein écran, fermer une fiche par ✕ ou un clic à côté : Échap quitte d'abord le plein écran";
  return (
    <button className={"icon-btn fullscreen-btn" + (full ? " on" : "")} onClick={onToggle} title={label} aria-label={label} aria-pressed={full}>
      <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
        <path d={full ? COMPRESS : EXPAND} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
