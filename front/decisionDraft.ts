// The fiche « Décision et Raison » being filled (ADR 052): its draft, what
// is still missing before « Valider », and the decisions it sends. The same
// rules as the server (middle/decisions.ts) so the button says it first:
// a pause says why (a grid term or a sentence) and when it is reviewed —
// no date for a parking; a requalification says what changed in the
// subject's nature. No React here: node:test covers it.

import type { CardDecision, DecisionFrees, DecisionInstance, PauseKind } from "../core/types.ts";
import { PAUSE_DECISION_ID, REQUALIFY_DECISION_ID } from "../core/gesture.ts";
import type { DecisionInput } from "./api.ts";

/** The fiche as typed. Empty strings mean « not filled ». */
export interface FicheDraft {
  instance: DecisionInstance | null;
  grounds: string[];
  reason: string;
  options: string;
  frees: DecisionFrees;
  liftCondition: string;
  /** YYYY-MM-DD or "". */
  reviewDate: string;
  pauseKind: PauseKind | null;
  natureChange: string;
  architectValidated: boolean;
  /** YYYY-MM-DD — only when tracing a paper decision afterwards. */
  decidedOn: string;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The review day a pause starts with: one month on, the next synchro.
 * Input: now. Output: YYYY-MM-DD (clamped to the month's last day).
 * Failure: none.
 */
export function nextReview(now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return isoDay(new Date(Date.UTC(year, month, Math.min(now.getUTCDate(), last))));
}

/**
 * A blank fiche: review date one month on, decided today.
 * Input: now. Output: the FicheDraft. Failure: none.
 */
export function emptyDraft(now: Date): FicheDraft {
  return {
    instance: null, grounds: [], reason: "", options: "", frees: { people: "", budget: "", capacity: "" },
    liftCondition: "", reviewDate: nextReview(now), pauseKind: null, natureChange: "",
    architectValidated: false, decidedOn: isoDay(now),
  };
}

/**
 * What the fiche still lacks, in French, for the decisions it carries.
 * Inputs: the draft, the required decision ids. Output: messages (empty =
 * « Valider » may go). Failure: none.
 */
export function draftProblems(draft: FicheDraft, required: readonly string[]): string[] {
  const problems: string[] = [];
  if (required.includes(PAUSE_DECISION_ID)) {
    if (draft.grounds.length === 0 && draft.reason.trim() === "") problems.push("Pause : cocher un terme de la grille ou écrire la raison.");
    if (draft.pauseKind !== "parking" && draft.reviewDate === "") problems.push("Pause : fixer l’échéance du réexamen (ou choisir « parking »).");
  }
  if (required.includes(REQUALIFY_DECISION_ID) && draft.natureChange.trim() === "") {
    problems.push("Requalification : dire ce qui a changé dans la nature du sujet.");
  }
  return problems;
}

function shared(draft: FicheDraft, trace: boolean): Partial<DecisionInput> {
  return {
    reason: draft.reason.trim(),
    instance: draft.instance,
    options: draft.options.trim(),
    frees: { people: draft.frees.people.trim(), budget: draft.frees.budget.trim(), capacity: draft.frees.capacity.trim() },
    ...(trace && draft.decidedOn !== "" ? { decidedOn: draft.decidedOn } : {}),
  };
}

/**
 * The decisions the fiche sends: « Mettre en pause » with the grid terms
 * and the pause block, « Requalifier » with what changed; the reason, the
 * instance, the options set aside and what it frees go on each.
 * Inputs: the draft, the required ids (pause first), trace (a paper
 * decision traced afterwards: decidedOn is sent). Output: DecisionInput[].
 * Failure: none — call draftProblems first.
 */
export function draftDecisions(draft: FicheDraft, required: readonly string[], trace: boolean): DecisionInput[] {
  return required.map((decisionId): DecisionInput => {
    if (decisionId === PAUSE_DECISION_ID) {
      return {
        ...shared(draft, trace), decisionId, grounds: [...draft.grounds], reason: draft.reason.trim(),
        reviewDate: draft.pauseKind === "parking" || draft.reviewDate === "" ? null : draft.reviewDate,
        liftCondition: draft.liftCondition.trim(), pauseKind: draft.pauseKind,
      };
    }
    return {
      ...shared(draft, trace), decisionId, grounds: [], reason: draft.reason.trim(), reviewDate: null,
      natureChange: draft.natureChange.trim(), architectValidated: draft.architectValidated,
    };
  });
}

/**
 * The fiche of a renewal: the pause in force carried over — its terms,
 * reason, kind, instance and what lifts it — with a new review date and
 * today's decision day (« prolonger est une décision : nouvelle fiche »).
 * Inputs: the pause in force, now. Output: the FicheDraft. Failure: none.
 */
export function renewalDraft(previous: CardDecision, now: Date): FicheDraft {
  return {
    ...emptyDraft(now), instance: previous.instance, grounds: [...previous.grounds], reason: previous.reason,
    liftCondition: previous.liftCondition, pauseKind: previous.pauseKind,
    reviewDate: previous.pauseKind === "parking" ? "" : nextReview(now),
  };
}
