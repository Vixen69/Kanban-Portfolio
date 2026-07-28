// Card detail modal, read mode (design/modals.jsx CardDetail read branch).
// A projection of the folded card + its event history; edits flow up as
// patches (onPatch → editCard); block/unblock/comment/switch-to-edit are
// their own intents. No local board mutation. Blocking is governed by the
// BLOCAGE section (design v11): mandatory reason, « Lever » to lift.

import { useEffect, useState } from "react";
import type { BoardConfig, CardPatch, CardState } from "../../core/types.ts";
import { reconcileCardRefs } from "../../core/config.ts";
import type { HistoryEntry } from "../../core/history.ts";
import type { FlowAnchors, FlowTimes } from "../../core/flow.ts";
import { TypeTag } from "./cardParts.tsx";
import { CustomKV, Tag } from "./modalParts.tsx";
import { CommentList, DelaysSection, HistoryList } from "./DetailSections.tsx";
import { ConstraintEditor, InlineEdit } from "./modalEditors.tsx";
import { ContentionSection, OwnerStrip, PlanDeCharge, RdrStrip } from "./DetailPlan.tsx";
import { BudgetGraph, RisksSection } from "./DetailRisk.tsx";

/** Props of the card detail modal — all intents flow up to App. */
export interface CardDetailProps {
  card: CardState;
  config: BoardConfig;
  /** Epoch milliseconds of the shared 1 s ticker. */
  now: number;
  /** History of this card (movements + blockages), most recent first. */
  history: HistoryEntry[];
  /** Flow times of this card, projected from the event log (core/flow). */
  flow: FlowTimes;
  /** Stage anchors resolved from the config (labels of the Délais grid). */
  anchors: FlowAnchors | null;
  onClose: () => void;
  /** Switches App to the edit form (CardEdit). */
  onEdit: () => void;
  /** Persists an inline field edit (design applyPatch → editCard). */
  onPatch: (patch: CardPatch) => void;
  onBlock: (reason: string) => void;
  onUnblock: () => void;
  onComment: (text: string) => void;
  /** Archives the subject (event intent) and closes the modal. */
  onArchive: () => void;
  /** Restores an archived subject to the board (fiche opened from Archives). */
  onUnarchive: () => void;
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

// Tag row: type (big), domain, colonne, criticality crown/star,
// project-constraint tags and the + button opening the constraint editor.
// No nature tag and, since design v12, no canal tag either: the canal IS
// the nature and it is already read spatially from the board row, so the
// tag was restating the card's position. Stale config references are
// remapped for display only (never an event).
function TagRow({ card, config, onToggleConstraints }: { card: CardState; config: BoardConfig; onToggleConstraints: () => void }) {
  const refs = reconcileCardRefs(card, config);
  const domain = config.domains.find((entry) => entry.id === refs.domain)!;
  const column = config.columns.find((entry) => entry.id === refs.columnId)!;
  const type = refs.typeId === null ? null : (config.types.find((entry) => entry.id === refs.typeId) ?? null);
  return (
    <div className="tag-row">
      <TypeTag type={type} big />
      <Tag color={domain.color}>{domain.name}</Tag>
      <Tag color="#94a3b8">{column.name}</Tag>
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

// Mandatory-reason form of the BLOCAGE section: the confirm button stays
// disabled until a motif is typed (design v11 — no default reason). Escape
// cancels the FORM only (contained — it must not bubble into the global
// unwind and close the whole fiche while a motif is being typed).
function BlockForm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="block-form">
      <span className="field-label">Motif du blocage (obligatoire)</span>
      <textarea
        className="inp"
        rows={2}
        autoFocus
        placeholder="Ex. dépendance équipe Infra non livrée, attente arbitrage…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); onCancel(); }
        }}
      />
      <div className="modal-actions">
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onCancel}>Annuler</button>
        <button className="btn danger" disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>Confirmer le blocage</button>
      </div>
    </div>
  );
}

// BLOCAGE section, right under Risques — the single place blocking is
// governed (design v11): banner + « Lever » when blocked, otherwise the
// full-width « Signaler un blocage » button opening the mandatory form.
function BlockSection({ blocked, reason, onBlock, onUnblock }: {
  blocked: boolean;
  reason: string | null;
  onBlock: (reason: string) => void;
  onUnblock: () => void;
}) {
  const [form, setForm] = useState(false);
  if (blocked) {
    return (
      <div className="sec block-sec on">
        <div className="blocked-banner">
          <span className="blk-pulse" />
          <span className="bb-text"><b>Bloqué</b> — {reason || "raison non précisée"}</span>
          <button className="lift-btn" onClick={onUnblock}>Lever</button>
        </div>
      </div>
    );
  }
  return (
    <div className="sec block-sec">
      {form
        ? <BlockForm onCancel={() => setForm(false)} onConfirm={(text) => { onBlock(text); setForm(false); }} />
        : <button className="btn block-btn full" onClick={() => setForm(true)}>Signaler un blocage</button>}
    </div>
  );
}

// Footer actions of the read mode (design v11: Archiver on the left). An
// archived fiche (opened from the Archives view) offers « Désarchiver »
// instead — re-archiving would only earn a 400.
function Actions({ archived, onArchive, onUnarchive, onClose, onEdit }: {
  archived: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="modal-actions">
      {archived
        ? <button className="btn ghost sm" onClick={onUnarchive} title="Rendre ce sujet au tableau">Désarchiver</button>
        : <button className="btn ghost sm" onClick={onArchive} title="Archiver ce sujet">Archiver</button>}
      <span style={{ flex: 1 }} />
      <button className="btn ghost" onClick={onClose}>Fermer</button>
      <button className="btn primary" onClick={onEdit}>Modifier</button>
    </div>
  );
}

// The stacked detail sections in design-v11 order (budget before plan de
// charge, BLOCAGE after Risques) plus any custom fields.
function MidSections({ card, config, now, onPatch, onBlock, onUnblock }: {
  card: CardState;
  config: BoardConfig;
  now: number;
  onPatch: (patch: CardPatch) => void;
  onBlock: (reason: string) => void;
  onUnblock: () => void;
}) {
  const hasCustom = config.fields.some((field) => {
    const value = card.custom[field.id];
    return value != null && value !== "" && value !== false;
  });
  return (
    <>
      <OwnerStrip card={card} config={config} now={now} onPatch={onPatch} />
      <RdrStrip card={card} now={now} onPatch={onPatch} />
      <BudgetGraph card={card} onPatch={onPatch} />
      <PlanDeCharge key={"pc" + card.id} card={card} config={config} onPatch={onPatch} />
      <ContentionSection key={"co" + card.id} card={card} config={config} onPatch={onPatch} />
      <RisksSection key={"ra" + card.id} card={card} config={config} onPatch={onPatch} />
      <BlockSection key={"bk" + card.id} blocked={card.blocked} reason={card.blockedReason} onBlock={onBlock} onUnblock={onUnblock} />
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
  const [constraintEdit, setConstraintEdit] = useState(false);
  useEffect(() => { setConstraintEdit(false); }, [card.id]);
  const refs = reconcileCardRefs(card, config);
  const domain = config.domains.find((entry) => entry.id === refs.domain)!;
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <span className="modal-bar" style={{ background: card.blocked ? "#b91c1c" : domain.color }} />
        <div className="modal-body">
          <TopBar card={card} onClose={props.onClose} onPatch={onPatch} />
          <TagRow card={card} config={config} onToggleConstraints={() => setConstraintEdit((open) => !open)} />
          {constraintEdit && <ConstraintPop card={card} config={config} onPatch={onPatch} onClose={() => setConstraintEdit(false)} />}
          <MidSections card={card} config={config} now={props.now} onPatch={onPatch}
            onBlock={props.onBlock} onUnblock={props.onUnblock} />
          <CommentList key={card.id} comments={card.comments} onAdd={props.onComment} />
          <DelaysSection key={"dl" + card.id} flow={props.flow} anchors={props.anchors} />
          <HistoryList key={"hi" + card.id} entries={props.history} />
          {card.sciformaId && <div className="scf">Réf. Sciforma : {card.sciformaId}</div>}
          <Actions archived={card.archived} onArchive={props.onArchive} onUnarchive={props.onUnarchive}
            onClose={props.onClose} onEdit={props.onEdit} />
        </div>
      </div>
    </div>
  );
}
