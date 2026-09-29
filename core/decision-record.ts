// A "decided" event read back as a CardDecision (ADR 026, ADR 052): every
// field of the paper fiche « Décision et Raison » is re-checked on read, so
// a malformed row can never corrupt the projection, and a decision recorded
// before ADR 052 reads with its extra blocks empty. Pure; no React, no Node.

import type { CardDecision, CardEvent, DecisionFrees, DecisionInstance, PauseKind } from "./types.ts";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function instanceOf(value: unknown): DecisionInstance | null {
  return value === "revue" || value === "synchro" ? value : null;
}

function pauseKindOf(value: unknown): PauseKind | null {
  return value === "tactique" || value === "parking" ? value : null;
}

function freesOf(value: unknown): DecisionFrees {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return { people: text(raw["people"]), budget: text(raw["budget"]), capacity: text(raw["capacity"]) };
}

/**
 * The decision a "decided" event records.
 * Input: the event (its payload is untrusted). Output: the CardDecision,
 * or null when the payload carries no decision id. Failure: none —
 * unknown or mistyped fields read as empty.
 */
export function readDecision(event: CardEvent): CardDecision | null {
  const payload = event.payload;
  const decisionId = payload["decisionId"];
  if (typeof decisionId !== "string") return null;
  const grounds = payload["grounds"];
  return {
    actor: event.actor, ts: event.ts, decisionId,
    grounds: Array.isArray(grounds) ? grounds.filter((g): g is string => typeof g === "string") : [],
    reason: text(payload["reason"]),
    reviewDate: textOrNull(payload["reviewDate"]),
    instance: instanceOf(payload["instance"]),
    options: text(payload["options"]),
    frees: freesOf(payload["frees"]),
    liftCondition: text(payload["liftCondition"]),
    pauseKind: pauseKindOf(payload["pauseKind"]),
    natureChange: text(payload["natureChange"]),
    fromLaneId: textOrNull(payload["fromLaneId"]),
    toLaneId: textOrNull(payload["toLaneId"]),
    architectValidated: payload["architectValidated"] === true,
    decidedOn: textOrNull(payload["decidedOn"]),
  };
}
