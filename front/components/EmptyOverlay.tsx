// Overlay shown when the filters/search dim every card (design v9
// app.jsx): the board structure stays visible underneath — only the cards
// are masked — with a one-click way back to the full portfolio.

/**
 * The "no match" overlay: title, explanation and a reset button. Rendered
 * by App over the board area when the visible count drops to zero.
 * Inputs: onReset — clears the search and re-enables every filter.
 * Output: the overlay element. Failure: none.
 */
export function EmptyOverlay({ onReset }: { onReset: () => void }) {
  return (
    <div className="empty-overlay">
      <div className="empty-card">
        <div className="empty-title">Aucun sujet ne correspond</div>
        <div className="empty-sub">La structure du tableau reste visible — seules les cartes sont masquées.</div>
        <button className="btn primary" onClick={onReset}>Réinitialiser les filtres</button>
      </div>
    </div>
  );
}
