// Card detail modal, read mode (design/modals.jsx CardDetail read branch).
// A projection of the folded card + its event history; edits flow up as
// patches (onPatch → editCard); block/unblock/comment/switch-to-edit are
// their own intents. No local board mutation.

import { useEffect, useState } from "react";
import type { BoardConfig, CardPatch, CardState } from "../../core/types.ts";
import { reconcileCardRefs } from "../../core/config.ts";
import type { HistoryEntry } from "../../core/history.ts";
import { TypeTag } from "./cardParts.tsx";
import { CustomKV, Tag } from "./modalParts.tsx";
import { CommentList, DocRow, HistoryList } from "./DetailSections.tsx";
import { ConstraintEditor, InlineEdit } from "./modalEditors.tsx";
import { ContentionSection, OwnerStrip, PlanDeCharge, RdrStrip } from "./DetailPlan.tsx";
import { BudgetGraph, RisksAlerts } from "./DetailRisk.tsx";

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
  /** Persists an inline field edit (design applyPatch → editCard). */
  onPatch: (patch: CardPatch) => void;
  onBlock: (reason: string) => void;
  onUnblock: () => void;
  onComment: (text: string) => void;
}

// Title and code projet, both inline-editable, plus the close button.
function TopBar({ card, onClose, onPatch }: { card: CardState; onClose: () => void; onPatch: (patch: CardPatch) => void }) {
  return (
    <div className="modal-top">
      <div>
        <h2 className="modal-name"><InlineEdit value={card.title} onCommit={(v) => { if (v.trim()) onPatch({ title: v.trim() }); }} /></h2>
        <span className="modal-code"><InlineEdit value={card.codename} placeholder="code" onCommit={(v) => onPatch({ codename: v.trim() })} /></span>
      </div>
      <button className="x" onClick={onClose}>✕</button>
    </div>
  );
}

// Tag row: type (big), domain, canal, colonne, nature, criticality crown/star,
// project-constraint tags and the + button opening the constraint editor.
// Stale config references are remapped for display only (never an event).
function TagRow({ card, config, onToggleConstraints }: { card: CardState; config: BoardConfig; onToggleConstraints: () => void }) {
  const refs = reconcileCardRefs(card, config);
  const domain = config.domains.find((entry) => entry.id === refs.domain)!;
  const lane = config.lanes.find((entry) => entry.id === refs.laneId)!;
  const column = config.columns.find((entry) => entry.id === refs.columnId)!;
  const type = refs.typeId === null ? null : (config.types.find((entry) => entry.id === refs.typeId) ?? null);
  const nature = config.natures[card.nature];
  return (
    <div className="tag-row">
      <TypeTag type={type} big />
      <Tag color={domain.color}>{domain.name}</Tag>
      <Tag color="#94a3b8">{lane.name}</Tag>
      <Tag color="#94a3b8">{column.name}</Tag>
      <Tag color={nature.fg}>{nature.label}</Tag>
      {card.criticality === "top" && <Tag color="#d4a017" solid>♛ TOP</Tag>}
      {card.criticality === "major" && <Tag color="#d4a017">★ MAJOR</Tag>}
      {card.projectConstraints.map((id) => {
        const pc = config.projectConstraints.find((entry) => entry.id === id);
        return pc ? <Tag key={id} color={pc.color}>{pc.name}</Tag> : null;
      })}
      <button className="tag-edit" title="Contraintes du projet" onClick={onToggleConstraints}>＋</button>
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

// The stacked detail sections (owner → risks) plus any custom fields.
function MidSections({ card, config, now, onPatch }: { card: CardState; config: BoardConfig; now: number; onPatch: (patch: CardPatch) => void }) {
  const hasCustom = config.fields.some((field) => {
    const value = card.custom[field.id];
    return value != null && value !== "" && value !== false;
  });
  return (
    <>
      <OwnerStrip card={card} config={config} now={now} onPatch={onPatch} />
      <RdrStrip card={card} now={now} onPatch={onPatch} />
      <PlanDeCharge key={"pc" + card.id} card={card} config={config} onPatch={onPatch} />
      <ContentionSection key={"co" + card.id} card={card} config={config} onPatch={onPatch} />
      <BudgetGraph card={card} onPatch={onPatch} />
      <RisksAlerts key={"ra" + card.id} card={card} config={config} now={now} onPatch={onPatch} />
      {hasCustom && (
        <div className="kv-grid">
          {config.fields.map((field) => <CustomKV key={field.id} field={field} value={card.custom[field.id]} />)}
        </div>
      )}
    </>
  );
}

// The project-constraint editor popover under the tag row.
function ConstraintPop({ card, config, onPatch, onClose }: { card: CardState; config: BoardConfig; onPatch: (patch: CardPatch) => void; onClose: () => void }) {
  return (
    <div className="constraint-pop">
      <span className="field-label" style={{ marginBottom: 6, display: "block" }}>Contraintes du projet</span>
      <ConstraintEditor config={config} constraints={card.projectConstraints}
        onSave={(ids) => { onPatch({ projectConstraints: ids }); onClose(); }} onCancel={onClose} />
    </div>
  );
}

/**
 * The card detail modal, read mode (second click of the two-stage click).
 * Inputs: CardDetailProps — the folded card, runtime config, shared ticker,
 * the card's history and the close/edit/patch/block/unblock/comment callbacks.
 * Output: overlay + modal; the bar is red when blocked, else the domain
 * color; clicking the overlay or ✕ closes (Escape is handled globally). The
 * per-section editors reset when the card changes (keyed by card.id).
 * Failure modes: none — stale config references fall back to first entries.
 */
export function CardDetail(props: CardDetailProps) {
  const { card, config, onPatch } = props;
  const [blockForm, setBlockForm] = useState(false);
  const [constraintEdit, setConstraintEdit] = useState(false);
  useEffect(() => { setBlockForm(false); setConstraintEdit(false); }, [card.id]);
  const refs = reconcileCardRefs(card, config);
  const domain = config.domains.find((entry) => entry.id === refs.domain)!;
  const column = config.columns.find((entry) => entry.id === refs.columnId)!;
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <span className="modal-bar" style={{ background: card.blocked ? "#b91c1c" : domain.color }} />
        <div className="modal-body">
          <TopBar card={card} onClose={props.onClose} onPatch={onPatch} />
          <TagRow card={card} config={config} onToggleConstraints={() => setConstraintEdit((open) => !open)} />
          {constraintEdit && <ConstraintPop card={card} config={config} onPatch={onPatch} onClose={() => setConstraintEdit(false)} />}
          {card.blocked && <BlockedAlert reason={card.blockedReason} onUnblock={props.onUnblock} />}
          <MidSections card={card} config={config} now={props.now} onPatch={onPatch} />
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
