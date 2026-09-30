// The fiche « Décision et Raison » (ADR 052, the paper V0.1 as a window):
// it opens when a move IS a decision — into Pause, or a chosen canal
// changed — and holds the card until « Valider », which sends the move and
// its decisions together. « Annuler » (or Échap) writes nothing and the
// card stays where it was; a click beside does not close it (too easy in a
// séance). From the card's detail it also traces a pause decided on paper,
// or renews the pause in force (a new fiche, prefilled).

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardConfig, CardDecision } from "../../core/types.ts";
import { PAUSE_DECISION_ID, REQUALIFY_DECISION_ID } from "../../core/gesture.ts";
import { pauseStatus } from "../../core/decisions.ts";
import { placeName } from "../../core/journal.ts";
import type { DecisionInput } from "../api.ts";
import type { PendingDecision } from "../useMoveGate.ts";
import { draftDecisions, draftProblems, emptyDraft, nextReview, renewalDraft, type FicheDraft } from "../decisionDraft.ts";
import { InstanceBlock, MoreBlock, PauseBlock, ReasonBlock, RequalifyBlock } from "./decisionBlocks.tsx";

/** Props of the fiche window. */
export interface DecisionDialogProps {
  pending: PendingDecision;
  config: BoardConfig;
  /** Epoch ms (App's clock): the default review and decision days. */
  now: number;
  /** The server's refusal of the last « Valider », if any. */
  error: string | null;
  onConfirm: (decisions: DecisionInput[]) => Promise<void>;
  onCancel: () => void;
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex='-1'])";

// Tab and Shift+Tab stay inside the fiche (the board behind is inert).
function trapTab(event: KeyboardEvent, box: HTMLElement): void {
  const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) return;
  const inside = box.contains(document.activeElement);
  if (!inside || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

// Échap cancels (not while « Valider » is on its way); Tab stays inside;
// the board's shortcuts (N, S, F, /, ← →) wait — except in the fields,
// where typing is typing.
function useFicheKeys(box: React.RefObject<HTMLDivElement>, onCancel: () => void, busy: boolean): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busy) onCancel();
        return;
      }
      if (event.key === "Tab" && box.current !== null) return trapTab(event, box.current);
      const target = event.target as HTMLElement | null;
      const typing = target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (!typing) event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [box, onCancel, busy]);
}

function laneName(config: BoardConfig, laneId: string): string {
  return config.lanes.find((lane) => lane.id === laneId)?.name ?? laneId;
}

function moveLine(pending: PendingDecision, config: BoardConfig, renewing: boolean) {
  const { card, to } = pending;
  if (to !== null) return <>{placeName(config, card.laneId, card.columnId)} → <b>{placeName(config, to.laneId, to.columnId)}</b></>;
  const where = placeName(config, card.laneId, card.columnId);
  return renewing
    ? <>Reconduire la pause ({where}) — une nouvelle fiche ; la précédente reste au journal</>
    : <>Pause décidée hors de l’outil — la tracer ({where})</>;
}

function FicheHead({ pending, config, renewing }: { pending: PendingDecision; config: BoardConfig; renewing: boolean }) {
  const chips = pending.required.map((id) => config.decisions.find((d) => d.id === id)).filter((d) => d !== undefined);
  return (
    <div className="fd-head">
      <span className="field-label">Fiche Décision et Raison</span>
      <div className="modal-name">{pending.card.title}</div>
      {pending.card.codename !== null && <span className="modal-code">{pending.card.codename}</span>}
      <div className="fd-move">{moveLine(pending, config, renewing)}</div>
      <div className="fd-row">
        {chips.map((decision) => <span key={decision.id} className="fd-chip" style={{ background: decision.color }}>{decision.name}</span>)}
      </div>
    </div>
  );
}

// The dashed outline of the held card (the move waits for « Valider »).
function HeldMark({ id }: { id: string | null }) {
  if (id === null) return null;
  const sel = CSS.escape(id);
  return <style>{`.mini[data-card-id="${sel}"], .focus-card[data-card-id="${sel}"] { outline: 2px dashed #7c3aed; outline-offset: -2px; }`}</style>;
}

// The pause in force when the fiche renews it from the card's detail.
function renewedPause(pending: PendingDecision, now: number): CardDecision | null {
  return pending.to === null ? (pauseStatus(pending.card, new Date(now))?.entry ?? null) : null;
}

/**
 * The fiche window.
 * Inputs: DecisionDialogProps. Output: the overlay with the numbered blocks
 * the decisions need (instance, reason, pause, requalification, the
 * optional part), what is still missing, and Annuler / Valider.
 * Failure: a refused « Valider » keeps the window open over the error.
 */
export function DecisionDialog({ pending, config, now, error, onConfirm, onCancel }: DecisionDialogProps) {
  const previous = renewedPause(pending, now);
  const [draft, setDraft] = useState<FicheDraft>(() => (previous !== null ? renewalDraft(previous, new Date(now)) : emptyDraft(new Date(now))));
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const set = useCallback((patch: Partial<FicheDraft>) => setDraft((current) => ({ ...current, ...patch })), []);
  useFicheKeys(box, onCancel, busy);
  const trace = pending.to === null;
  const pause = pending.required.includes(PAUSE_DECISION_ID);
  const requalify = pending.required.includes(REQUALIFY_DECISION_ID);
  const problems = draftProblems(draft, pending.required);
  const canals = pending.to === null ? "" : `${laneName(config, pending.card.laneId)} → ${laneName(config, pending.to.laneId)}`;
  const submit = async () => {
    setBusy(true);
    await onConfirm(draftDecisions(draft, pending.required, trace));
    setBusy(false);
  };
  return (
    <div className="overlay fd-overlay" role="dialog" aria-modal="true" aria-label="Fiche Décision et Raison">
      <HeldMark id={trace ? null : pending.card.id} />
      <div className="modal fd" ref={box}>
        <div className="modal-body">
          <FicheHead pending={pending} config={config} renewing={previous !== null} />
          <InstanceBlock draft={draft} set={set} trace={trace} />
          <ReasonBlock draft={draft} set={set} config={config} pause={pause} />
          {pause && <PauseBlock draft={draft} set={set} defaultReview={nextReview(new Date(now))} />}
          {requalify && <RequalifyBlock draft={draft} set={set} canals={canals} focus={!pause} />}
          <MoreBlock draft={draft} set={set} />
          {problems.length > 0 && <ul className="fd-miss">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
          {error !== null && <div className="fd-err" role="alert">{error}</div>}
          <div className="modal-actions">
            <span className="card-fill" />
            <button className="btn ghost" disabled={busy} onClick={onCancel}>Annuler</button>
            <button className="btn primary" disabled={problems.length > 0 || busy} onClick={() => void submit()}>Valider la décision</button>
          </div>
        </div>
      </div>
    </div>
  );
}
