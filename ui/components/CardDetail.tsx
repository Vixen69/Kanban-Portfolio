// Card detail modal (design P5: just enough to point at a card and make a
// 2-minute decision). Read-only projection of the card + its event-log
// history; the only actions are signaling and lifting a blockage — both
// appended to the event log, never mutations.

import { useState } from "react";
import type { BoardConfig, CardEvent, CardPatch, CardState } from "../../core/types.ts";
import { daysInColumn } from "../../core/aging.ts";
import { cardHistory, type HistoryEntry } from "../../core/history.ts";
import { CRITICALITY_LABELS, domainColor, natureColor, typeById } from "../domains.ts";
import { laneNatures } from "../../core/filters.ts";
import { TypeTag } from "./cardParts.tsx";
import { CardEdit } from "./CardEdit.tsx";

export interface CardDetailProps {
  card: CardState;
  config: BoardConfig;
  now: Date;
  events: CardEvent[];
  /** All cards, to resolve dependency ids into titles. */
  cards: CardState[];
  onClose: () => void;
  onBlock: (cardId: string, reason: string) => void;
  onUnblock: (cardId: string) => void;
  /** Appends one "edited" event with the whitelisted patch. */
  onEdit: (cardId: string, patch: CardPatch) => void;
}

function Tag({ color, solid, children }: { color: string; solid?: boolean; children: React.ReactNode }) {
  const style = solid
    ? { background: color, color: "#1a1505", borderColor: color }
    : { color: "#0f172a", borderColor: color, background: "#fff" };
  return <span className="dtag" style={style}>{children}</span>;
}

function DetailTags({ card, config }: { card: CardState; config: BoardConfig }) {
  const lane = config.lanes.find((l) => l.id === card.laneId);
  const column = config.columns.find((c) => c.id === card.columnId);
  return (
    <div className="tag-row">
      <TypeTag config={config} typeId={card.typeId} big />
      <Tag color={domainColor(config, card.domain)}>{card.domain}</Tag>
      <Tag color="#94a3b8">{lane?.name ?? card.laneId}</Tag>
      <Tag color="#94a3b8">{column?.name ?? card.columnId}</Tag>
      {lane?.nature && <Tag color={natureColor(laneNatures(config), lane.nature)}>{lane.nature}</Tag>}
      {card.criticality === "top" && <Tag color="#eab308" solid>★ TOP</Tag>}
      {card.criticality === "major" && <Tag color="#94a3b8">MAJOR</Tag>}
    </div>
  );
}

function DetailKv({ card, config, now, moves }: { card: CardState; config: BoardConfig; now: Date; moves: number }) {
  const days = daysInColumn(card, now);
  const heat = days > 60 ? "hot" : days > 28 ? "warm" : "";
  return (
    <div className="kv-grid">
      <div className="kv"><span>Responsable</span><b>{card.owner}</b></div>
      <div className="kv"><span>Dans la colonne depuis</span><b className={heat}>{days} jours</b></div>
      <div className="kv"><span>Mouvements</span><b>{moves}</b></div>
      <div className="kv"><span>Criticité</span><b>{CRITICALITY_LABELS[card.criticality]}</b></div>
      {config.types.length > 0 && (
        <div className="kv"><span>Type de projet</span><b>{typeById(config, card.typeId)?.name ?? "—"}</b></div>
      )}
      <div className="kv"><span>Source</span><b>{card.source}</b></div>
    </div>
  );
}

function DetailBudget({ card }: { card: CardState }) {
  if (card.budget === null) return null;
  const consumed = card.consumed ?? 0;
  const pct = card.budget > 0 ? Math.round((consumed / card.budget) * 100) : 0;
  const over = consumed > card.budget;
  return (
    <div className="charge-box">
      <div className="charge-head">
        <span className="field-label">Budget · k€</span>
        <span className={"charge-num" + (over ? " over" : "")}>
          {consumed} / {card.budget} k€{over ? " · dépassement" : ""}
        </span>
      </div>
      <div className="charge-track">
        <span
          className="charge-fill"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: over ? "var(--danger)" : pct >= 85 ? "var(--warn)" : "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}

function Dependencies({ card, cards }: { card: CardState; cards: CardState[] }) {
  if (card.dependencies.length === 0) return null;
  return (
    <div className="res-box">
      <span className="field-label">Dépendances</span>
      <div className="res-chips">
        {card.dependencies.map((id) => (
          <span key={id} className="res-chip" title={id}>
            {cards.find((other) => other.id === id)?.title ?? id}
          </span>
        ))}
      </div>
    </div>
  );
}

function historyText(entry: HistoryEntry): React.ReactNode {
  if (entry.kind === "moved") {
    return <>{entry.fromName} → <b>{entry.toName}</b></>;
  }
  if (entry.kind === "created") return <>Entrée → <b>{entry.toName ?? "?"}</b></>;
  if (entry.kind === "blocked") return <b>Bloqué{entry.reason ? ` — ${entry.reason}` : ""}</b>;
  return <b>Débloqué</b>;
}

function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="history">
      <span className="field-label">Historique</span>
      <div className="hist-list">
        {entries.map((entry, index) => (
          <div className="hist" key={index}>
            <span className={"hist-dot" + (entry.kind === "blocked" ? " danger" : "")} />
            <span className="hist-move">{historyText(entry)}</span>
            <span className="hist-meta">
              {new Date(entry.ts).toLocaleDateString("fr-FR")} · {entry.actor}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="block-form">
      <span className="field-label">Décrire le blocage précisément</span>
      <textarea
        className="inp"
        rows={2}
        autoFocus
        placeholder="Ex. dépendance équipe Infra non livrée, attente arbitrage…"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="modal-actions">
        <span className="spacer" />
        <button className="btn ghost" onClick={onCancel}>Annuler</button>
        <button className="btn danger" onClick={() => onSubmit(reason.trim() || "Blocage signalé")}>
          Signaler le blocage
        </button>
      </div>
    </div>
  );
}

function DetailRead({ props, onEditStart }: { props: CardDetailProps; onEditStart: () => void }) {
  const { card, config } = props;
  const [blockForm, setBlockForm] = useState(false);
  const history = cardHistory(props.events, card.id, config);
  const moves = history.filter((entry) => entry.kind === "moved").length;
  return (
    <div className="modal-body">
      <div className="modal-top">
        <div>
          <h2 className="modal-name">{card.title}</h2>
          {card.codename && <span className="modal-code">{card.codename}</span>}
        </div>
        <button className="x" onClick={props.onClose}>✕</button>
      </div>
      <DetailTags card={card} config={config} />
      {card.blocked && (
        <div className="alert-box">
          <span className="blk-dot" /> <b>Bloqué</b> — {card.blockedReason ?? "raison non précisée"}
          <button className="lift-btn" onClick={() => props.onUnblock(card.id)}>Lever</button>
        </div>
      )}
      <DetailKv card={card} config={config} now={props.now} moves={moves} />
      <DetailBudget card={card} />
      <Dependencies card={card} cards={props.cards} />
      <HistoryList entries={history} />
      <DetailActions
        props={props}
        blockForm={blockForm}
        onOpenBlockForm={() => setBlockForm(true)}
        onCloseBlockForm={() => setBlockForm(false)}
        onEditStart={onEditStart}
      />
    </div>
  );
}

/**
 * The card detail modal (second click of the two-stage card click).
 * Read mode by default, toggles to the edit form ("Modifier").
 * Inputs: CardDetailProps (card, config, now, event log, all cards,
 * close/block/unblock/edit callbacks).
 * Output: the overlay + modal; clicking the overlay or ✕ closes (Escape
 * is handled globally). Failure: none.
 */
export function CardDetail(props: CardDetailProps) {
  const { card, config } = props;
  const [edit, setEdit] = useState(false);
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <span className="modal-bar" style={{ background: card.blocked ? "#b91c1c" : domainColor(config, card.domain) }} />
        {edit ? (
          <CardEdit
            card={card}
            config={config}
            onCancel={() => setEdit(false)}
            onSave={(patch) => {
              props.onEdit(card.id, patch);
              setEdit(false);
            }}
          />
        ) : (
          <DetailRead props={props} onEditStart={() => setEdit(true)} />
        )}
      </div>
    </div>
  );
}

function DetailActions({
  props,
  blockForm,
  onOpenBlockForm,
  onCloseBlockForm,
  onEditStart,
}: {
  props: CardDetailProps;
  blockForm: boolean;
  onOpenBlockForm: () => void;
  onCloseBlockForm: () => void;
  onEditStart: () => void;
}) {
  const { card } = props;
  return (
    <>
      <div className="modal-actions">
        {!card.blocked && !blockForm && (
          <button className="btn block-btn" onClick={onOpenBlockForm}>Signaler un blocage</button>
        )}
        <span className="spacer" />
        <button className="btn ghost" onClick={props.onClose}>Fermer</button>
        <button className="btn primary" onClick={onEditStart}>Modifier</button>
      </div>
      {blockForm && (
        <BlockForm
          onCancel={onCloseBlockForm}
          onSubmit={(reason) => {
            props.onBlock(card.id, reason);
            onCloseBlockForm();
          }}
        />
      )}
    </>
  );
}
