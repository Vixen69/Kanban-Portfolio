// Card detail modal, read mode (design/modals.jsx CardDetail read branch).
// A projection of the folded card + its event history; every action —
// block, unblock, comment, switch to edit — is an intent surfaced to App,
// never a local mutation.

import { useEffect, useState } from "react";
import type { BoardConfig, CardState } from "../../core/types.ts";
import { daysInColumn } from "../../core/aging.ts";
import { reconcileCardRefs } from "../../core/config.ts";
import type { HistoryEntry } from "../../core/history.ts";
import { TypeTag } from "./cardParts.tsx";
import { CustomKV, Tag } from "./modalParts.tsx";
import { ChargeBox, CommentList, DocRow, HistoryList, ResourceChips } from "./DetailSections.tsx";

/** Props of the card detail modal — all intents flow up to App. */
export interface CardDetailProps {
  card: CardState;
  config: BoardConfig;
  /** Epoch milliseconds of the shared 1 s ticker. */
  now: number;
  /** Movement history of this card, most recent first (core/history). */
  history: HistoryEntry[];
  onClose: () => void;
  /** Switches App to the edit form (CardEdit). */
  onEdit: () => void;
  onBlock: (reason: string) => void;
  onUnblock: () => void;
  onComment: (text: string) => void;
}

// Title, code projet and the close button.
function TopBar({ card, onClose }: { card: CardState; onClose: () => void }) {
  return (
    <div className="modal-top">
      <div>
        <h2 className="modal-name">{card.title}</h2>
        {card.codename && <span className="modal-code">{card.codename}</span>}
      </div>
      <button className="x" onClick={onClose}>✕</button>
    </div>
  );
}

// Tag row: type (big), domain, canal, colonne, nature, TOP/MAJOR badge.
// Stale config references are remapped for display only (never an event).
function TagRow({ card, config }: { card: CardState; config: BoardConfig }) {
  const refs = reconcileCardRefs(card, config);
  const domain = config.domains.find((entry) => entry.id === refs.domain)!;
  const lane = config.lanes.find((entry) => entry.id === refs.laneId)!;
  const column = config.columns.find((entry) => entry.id === refs.columnId)!;
  const type = refs.typeId === null ? null : (config.types.find((entry) => entry.id === refs.typeId) ?? null);
  const nature = config.natures[card.nature];
  const crit = config.criticalities[card.criticality];
  return (
    <div className="tag-row">
      <TypeTag type={type} big />
      <Tag color={domain.color}>{domain.name}</Tag>
      <Tag color="#94a3b8">{lane.name}</Tag>
      <Tag color="#94a3b8">{column.name}</Tag>
      <Tag color={nature.fg}>{nature.label}</Tag>
      {card.criticality === "top" && crit.badge !== null && <Tag color="#eab308" solid>★ {crit.badge}</Tag>}
      {card.criticality === "major" && crit.badge !== null && <Tag color="#cbd5e1">{crit.badge}</Tag>}
    </div>
  );
}

// Blocked banner with the reason and the "Lever" action.
function BlockedAlert({ reason, onUnblock }: { reason: string | null; onUnblock: () => void }) {
  return (
    <div className="alert-box">
      <span className="blk-pulse" /> <b>Bloqué</b> — {reason || "raison non précisée"}
      <button className="lift-btn" onClick={onUnblock}>Lever</button>
    </div>
  );
}

// Key/value grid: owner, time in column (warm/hot past the config
// thresholds), plan de charge, movement count, then custom fields.
function KvGrid({ card, config, now, moves }: { card: CardState; config: BoardConfig; now: number; moves: number }) {
  const days = daysInColumn(card, new Date(now));
  const heat = days > config.age.agingMaxDays ? "hot" : days > config.age.recentMaxDays ? "warm" : "";
  return (
    <div className="kv-grid">
      <div className="kv"><span>Chef de projet</span><b>{card.owner || "—"}</b></div>
      <div className="kv"><span>Dans la colonne depuis</span><b className={heat}>{days} jours</b></div>
      <div className="kv"><span>Plan de charge</span><b>{card.loadPlan || "—"}</b></div>
      <div className="kv"><span>Mouvements</span><b>{moves}</b></div>
      {config.fields.map((field) => <CustomKV key={field.id} field={field} value={card.custom[field.id]} />)}
    </div>
  );
}

// Actions row; the block button hides while blocked or while the form shows.
function Actions({ blocked, blockForm, onOpenBlock, onClose, onEdit }: {
  blocked: boolean;
  blockForm: boolean;
  onOpenBlock: () => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="modal-actions">
      {!blocked && !blockForm && <button className="btn block-btn" onClick={onOpenBlock}>Signaler un blocage</button>}
      <span style={{ flex: 1 }} />
      <button className="btn ghost" onClick={onClose}>Fermer</button>
      <button className="btn primary" onClick={onEdit}>Modifier</button>
    </div>
  );
}

// Inline form to describe and signal a blockage (textarea autofocus).
function BlockForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="block-form">
      <span className="field-label">Décrire le blocage précisément</span>
      <textarea
        className="inp"
        rows={2}
        autoFocus
        placeholder="Ex. dépendance équipe Infra non livrée, attente arbitrage…"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="modal-actions">
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onCancel}>Annuler</button>
        <button className="btn danger" onClick={() => onSubmit(text.trim() || "Blocage signalé")}>Signaler le blocage</button>
      </div>
    </div>
  );
}

/**
 * The card detail modal, read mode (second click of the two-stage click).
 * Inputs: CardDetailProps — the folded card, the runtime config, the shared
 * ticker, the card's history and the close/edit/block/unblock/comment
 * callbacks.
 * Output: overlay + modal; the bar is red when blocked, else the domain
 * color; clicking the overlay or ✕ closes (Escape is handled globally).
 * Failure modes: none — stale config references fall back to first entries
 * for display via reconcileCardRefs.
 */
export function CardDetail(props: CardDetailProps) {
  const { card, config } = props;
  const [blockForm, setBlockForm] = useState(false);
  useEffect(() => { setBlockForm(false); }, [card.id]);
  const refs = reconcileCardRefs(card, config);
  const domain = config.domains.find((entry) => entry.id === refs.domain)!;
  const column = config.columns.find((entry) => entry.id === refs.columnId)!;
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <span className="modal-bar" style={{ background: card.blocked ? "#b91c1c" : domain.color }} />
        <div className="modal-body">
          <TopBar card={card} onClose={props.onClose} />
          <TagRow card={card} config={config} />
          {card.blocked && <BlockedAlert reason={card.blockedReason} onUnblock={props.onUnblock} />}
          <KvGrid card={card} config={config} now={props.now} moves={props.history.length} />
          <ChargeBox card={card} />
          <ResourceChips resources={card.resources} />
          <DocRow gate={column.gate} gateDef={column.gate === null ? null : config.gateDefs[column.gate]} />
          <CommentList key={card.id} comments={card.comments} onAdd={props.onComment} />
          <HistoryList entries={props.history} />
          {card.sciformaId && <div className="scf">Réf. Sciforma : {card.sciformaId}</div>}
          <Actions blocked={card.blocked} blockForm={blockForm} onOpenBlock={() => setBlockForm(true)} onClose={props.onClose} onEdit={props.onEdit} />
          {blockForm && (
            <BlockForm onCancel={() => setBlockForm(false)} onSubmit={(reason) => { props.onBlock(reason); setBlockForm(false); }} />
          )}
        </div>
      </div>
    </div>
  );
}
