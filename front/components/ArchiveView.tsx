// Archives overlay (design v11 modals.jsx ArchiveView): the archived
// subjects, searchable, with one-click « Désarchiver » and click-to-open
// rows. Archived cards stay in the fold (archived=true) but leave the
// board; both actions flow up to App (event intents, ADR 017).

import { useState } from "react";
import type { BoardConfig, CardState } from "../../core/types.ts";

/** Props of the archives overlay. All state and actions live in App. */
export interface ArchiveViewProps {
  /** The archived subset of the folded cards. */
  cards: CardState[];
  config: BoardConfig;
  onUnarchive: (id: string) => void;
  /** Opens the card detail (App closes the archive view first). */
  onOpen: (card: CardState) => void;
  onClose: () => void;
}

// One archive row: type badge + name + domain · canal · colonne, and the
// one-click restore button.
function ArchRow({ card, config, onOpen, onUnarchive }: {
  card: CardState;
  config: BoardConfig;
  onOpen: (card: CardState) => void;
  onUnarchive: (id: string) => void;
}) {
  const type = card.typeId === null ? null : config.types.find((t) => t.id === card.typeId) ?? null;
  const domain = config.domains.find((d) => d.id === card.domain);
  const lane = config.lanes.find((l) => l.id === card.laneId);
  const column = config.columns.find((c) => c.id === card.columnId);
  return (
    <div className="arch-row">
      <button className="arch-open" onClick={() => onOpen(card)} title="Ouvrir la fiche">
        {type && <span className="cpop-type" style={{ background: type.color }}>{type.short}</span>}
        <span className="arch-name">{card.title}</span>
        <span className="arch-meta">{domain?.short ?? card.domain} · {lane?.name ?? card.laneId} · {column?.name ?? card.columnId}</span>
      </button>
      <button className="btn ghost sm" onClick={() => onUnarchive(card.id)}>Désarchiver</button>
    </div>
  );
}

// Title + archived count + the search box (hidden while nothing is archived).
function ArchHead({ count, query, setQuery, onClose }: {
  count: number;
  query: string;
  setQuery: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="modal-top">
        <div>
          <h2 className="modal-name">Archives</h2>
          <span className="modal-code">{count} sujet{count > 1 ? "s" : ""} archivé{count > 1 ? "s" : ""}</span>
        </div>
        <button className="x" onClick={onClose}>✕</button>
      </div>
      {count > 0 && (
        <div className="arch-search-wrap">
          <input className="inp" placeholder="Rechercher dans les archives…" value={query}
            onChange={(event) => setQuery(event.target.value)} />
        </div>
      )}
    </>
  );
}

/**
 * The archives overlay: count, search box (title + codename), archived
 * rows, empty states (« Aucun sujet archivé » / « Aucun résultat. »).
 * Inputs: ArchiveViewProps. Output: overlay + modal (✕ or overlay click
 * closes; Escape is handled globally). Failure: none.
 */
export function ArchiveView({ cards, config, onUnarchive, onOpen, onClose }: ArchiveViewProps) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const list = cards.filter((card) =>
    needle === "" ||
    card.title.toLowerCase().includes(needle) ||
    (card.codename ?? "").toLowerCase().includes(needle));
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal archive-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-body">
          <ArchHead count={cards.length} query={query} setQuery={setQuery} onClose={onClose} />
          {cards.length === 0 ? (
            <div className="arch-empty">
              <div className="arch-empty-title">Aucun sujet archivé</div>
              <div className="arch-empty-sub">Archivez un sujet depuis sa fiche pour le retirer du tableau sans le supprimer.</div>
            </div>
          ) : list.length === 0 ? (
            <div className="cm-empty" style={{ padding: "18px 0" }}>Aucun résultat.</div>
          ) : (
            <div className="arch-list">
              {list.map((card) => (
                <ArchRow key={card.id} card={card} config={config} onOpen={onOpen} onUnarchive={onUnarchive} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
