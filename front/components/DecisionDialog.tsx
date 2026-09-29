// The fiche « Décision et Raison » (ADR 052, the paper V0.1 as a window):
// it opens when a move IS a decision — into Pause, or a chosen canal
// changed — and holds the card until « Valider », which sends the move and
// its decisions together. « Annuler » (or Échap) writes nothing and the
// card stays where it was; a click beside does not close it (too easy in a
// séance). From the card's detail it also traces a pause decided on paper.

import { useCallback, useEffect, useState } from "react";
import type { BoardConfig } from "../../core/types.ts";
import { PAUSE_DECISION_ID, REQUALIFY_DECISION_ID } from "../../core/gesture.ts";
import { placeName } from "../../core/journal.ts";
import type { DecisionInput } from "../api.ts";
import type { PendingDecision } from "../useMoveGate.ts";
import { draftDecisions, draftProblems, emptyDraft, nextReview, type FicheDraft } from "../decisionDraft.ts";
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

// Échap cancels; the board's shortcuts (N, S, F, /, ← →) wait while the
// fiche is open — except inside its fields, where typing is typing.
function useFicheKeys(onCancel: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancel();
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (!typing) event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
}

function laneName(config: BoardConfig, laneId: string): string {
  return config.lanes.find((lane) => lane.id === laneId)?.name ?? laneId;
}

function FicheHead({ pending, config }: { pending: PendingDecision; config: BoardConfig }) {
  const { card, to } = pending;
  const chips = pending.required.map((id) => config.decisions.find((d) => d.id === id)).filter((d) => d !== undefined);
  return (
    <div className="fd-head">
      <span className="field-label">Fiche décision et raison</span>
      <div className="modal-name">{card.title}</div>
      {card.codename !== null && <span className="modal-code">{card.codename}</span>}
      <div className="fd-move">
        {to === null
          ? <>Pause décidée hors de l’outil — la tracer ({placeName(config, card.laneId, card.columnId)})</>
          : <>{placeName(config, card.laneId, card.columnId)} → <b>{placeName(config, to.laneId, to.columnId)}</b></>}
      </div>
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

/**
 * The fiche window.
 * Inputs: DecisionDialogProps. Output: the overlay with the numbered blocks
 * the decisions need (instance, reason, pause, requalification, the
 * optional part), what is still missing, and Annuler / Valider.
 * Failure: a refused « Valider » keeps the window open over the error.
 */
export function DecisionDialog({ pending, config, now, error, onConfirm, onCancel }: DecisionDialogProps) {
  const [draft, setDraft] = useState<FicheDraft>(() => emptyDraft(new Date(now)));
  const [busy, setBusy] = useState(false);
  const set = useCallback((patch: Partial<FicheDraft>) => setDraft((current) => ({ ...current, ...patch })), []);
  useFicheKeys(onCancel);
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
    <div className="overlay fd-overlay" role="dialog" aria-modal="true" aria-label="Fiche décision et raison">
      <HeldMark id={trace ? null : pending.card.id} />
      <div className="modal fd">
        <div className="modal-body">
          <FicheHead pending={pending} config={config} />
          <InstanceBlock draft={draft} set={set} trace={trace} />
          <ReasonBlock draft={draft} set={set} config={config} pause={pause} />
          {pause && <PauseBlock draft={draft} set={set} defaultReview={nextReview(new Date(now))} />}
          {requalify && <RequalifyBlock draft={draft} set={set} canals={canals} focus={!pause} />}
          <MoreBlock draft={draft} set={set} />
          {problems.length > 0 && <ul className="fd-miss">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
          {error !== null && <div className="fd-err" role="alert">{error}</div>}
          <div className="modal-actions">
            <span className="card-fill" />
            <button className="btn ghost" onClick={onCancel}>Annuler</button>
            <button className="btn primary" disabled={problems.length > 0 || busy} onClick={() => void submit()}>Valider la décision</button>
          </div>
        </div>
      </div>
    </div>
  );
}
