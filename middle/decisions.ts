// The "decided" intent (ADR 026): a portfolio decision D1–D6 recorded on a
// card with its reason in the grid's terms and an optional review date.
// Screening here keeps junk out of the permanent log; the fold re-checks
// types on read (core/state.ts). Traced decisions (config `traced`, the
// referential's D4/D5/D6) refuse an empty reason: « non tracée = non prise ».

import type { BoardConfig, CardState } from "../core/types.ts";
import type { CardEventInput } from "../core/events.ts";
import { lifecycleEvent } from "../core/events.ts";
import { isIsoDate } from "../core/decisions.ts";
import { BadRequest } from "./errors.ts";

const REASON_MAX = 1000;

// The grid terms: an optional array of known ground ids, deduplicated in
// config order.
function parseGrounds(config: BoardConfig, raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string")) {
    throw new BadRequest("Termes de la grille invalides.");
  }
  const wanted = new Set(raw as string[]);
  const known = config.decisionGrounds.filter((ground) => wanted.has(ground.id)).map((ground) => ground.id);
  if (known.length !== wanted.size) throw new BadRequest("Terme de la grille inconnu.");
  return known;
}

function parseReviewDate(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !isIsoDate(raw)) throw new BadRequest("Date de réexamen invalide (AAAA-MM-JJ).");
  return raw;
}

/**
 * Builds the "decided" event from a client intent.
 * Inputs: the config (decision types and grid terms), the card's folded
 * state, the request body ({ decisionId, grounds?, reason?, reviewDate? }),
 * the server timestamp and actor.
 * Output: the CardEventInput carrying { decisionId, grounds, reason,
 * reviewDate }. Failure: BadRequest (French) on an archived card, an
 * unknown decision or term, a reason over 1000 characters, an invalid
 * date, or a traced decision without any reason.
 */
export function buildDecided(
  config: BoardConfig, state: CardState, body: Record<string, unknown>, ts: string, actor: string,
): CardEventInput {
  if (state.archived) throw new BadRequest("Carte archivée : désarchiver avant de décider.");
  const decisionId = body["decisionId"];
  const decision = config.decisions.find((d) => d.id === decisionId);
  if (decision === undefined) throw new BadRequest("Décision inconnue.");
  const grounds = parseGrounds(config, body["grounds"]);
  const reason = typeof body["reason"] === "string" ? body["reason"].trim() : "";
  if (reason.length > REASON_MAX) throw new BadRequest(`Raison trop longue (${REASON_MAX} caractères max).`);
  if (decision.traced && grounds.length === 0 && reason.length === 0) {
    throw new BadRequest(`Décision ${decision.short} : la raison est obligatoire (termes de la grille ou texte).`);
  }
  const reviewDate = parseReviewDate(body["reviewDate"]);
  return lifecycleEvent("decided", state.id, actor, ts, { decisionId: decision.id, grounds, reason, reviewDate });
}
