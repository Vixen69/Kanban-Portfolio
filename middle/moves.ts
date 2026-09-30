// The "moved" intent (ADR 019/039/052): where the card goes, before which
// card, and — decisions by the gesture — the decision the move IS. Entering
// Pause carries « Mettre en pause », changing a chosen canal carries
// « Requalifier »: the move and its decisions are written together or not
// at all, and a move that is a decision without its trace is refused, like
// a blocking without motif. « Non tracée = non prise » (Référentiel 7.8).

import type { BoardConfig, CardEvent, CardState } from "../core/types.ts";
import type { CardEventInput } from "../core/events.ts";
import { movedEvent } from "../core/events.ts";
import { unifiedColumnIds } from "../core/layout.ts";
import { laneChosen, readGesture, requiredDecisions, REQUALIFY_DECISION_ID } from "../core/gesture.ts";
import { BadRequest } from "./errors.ts";
import { buildDecided } from "./decisions.ts";

// A move's optional insertion target (ADR 019): a card of the target cell —
// the whole column when it has no canal (ADR 039).
function validBeforeId(
  states: CardState[],
  state: CardState,
  body: Record<string, unknown>,
  to: { laneId: string; columnId: string; anyLane: boolean },
): string | undefined {
  const beforeId = body["beforeId"];
  if (beforeId === undefined) return undefined;
  if (typeof beforeId !== "string" || beforeId === state.id) {
    throw new BadRequest("Carte cible de l’insertion invalide.");
  }
  // An archived target is off the board: no legitimate drop can land on it.
  const target = states.find((card) => card.id === beforeId);
  if (!target || target.archived || (!to.anyLane && target.laneId !== to.laneId) || target.columnId !== to.columnId) {
    throw new BadRequest("Carte cible de l’insertion hors de la cellule visée.");
  }
  return beforeId;
}

// The target cell: known column and canal.
function targetOf(config: BoardConfig, body: Record<string, unknown>): { laneId: string; columnId: string } {
  const toColumnId = body["toColumnId"];
  const toLaneId = body["toLaneId"];
  if (typeof toColumnId !== "string" || !config.columns.some((c) => c.id === toColumnId)) {
    throw new BadRequest("Colonne cible inconnue.");
  }
  if (typeof toLaneId !== "string" || !config.lanes.some((lane) => lane.id === toLaneId)) {
    throw new BadRequest("Canal cible inconnu.");
  }
  return { laneId: toLaneId, columnId: toColumnId };
}

// The decisions the client sent with the move: an array of objects, each
// id at most once.
function sentDecisions(raw: unknown): Record<string, unknown>[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "object" || entry === null || Array.isArray(entry))) {
    throw new BadRequest("Décisions du déplacement invalides.");
  }
  const list = raw as Record<string, unknown>[];
  const ids = list.map((entry) => entry["decisionId"]);
  if (new Set(ids).size !== ids.length) throw new BadRequest("Une même décision envoyée deux fois.");
  return list;
}

// The move's decisions must be exactly the ones its gesture requires.
function checkDecisions(config: BoardConfig, required: string[], sent: Record<string, unknown>[]): void {
  const name = (id: unknown) => config.decisions.find((d) => d.id === id)?.name ?? String(id);
  const missing = required.filter((id) => !sent.some((entry) => entry["decisionId"] === id));
  if (missing.length > 0) {
    throw new BadRequest(`Ce déplacement est une décision (« ${missing.map(name).join(" », « ")} ») : la tracer avant de déplacer.`);
  }
  const extra = sent.filter((entry) => !required.includes(entry["decisionId"] as string));
  if (extra.length > 0) throw new BadRequest(`Décision inattendue pour ce déplacement : « ${extra.map((e) => name(e["decisionId"])).join(" », « ")} ».`);
}

/**
 * Builds the events of a move intent: the "moved" event, then the
 * "decided" events its gesture requires (ADR 052).
 * Inputs: the config, the card's folded state, the request body
 * ({ toLaneId, toColumnId, beforeId?, decisions? }), the involved cards'
 * states, the card's effective events (to know whether its canal was
 * chosen), the server timestamp and actor.
 * Output: the event inputs to append together, the move first.
 * Failure: BadRequest (French) on an archived card, an unknown target, a
 * bad insertion target, a same-cell move without reorder, a decision
 * missing or unexpected, or an invalid decision.
 */
export function buildMoves(
  config: BoardConfig, state: CardState, body: Record<string, unknown>,
  context: { states: CardState[]; events: readonly CardEvent[]; ts: string; actor: string },
): CardEventInput[] {
  // An archived card is off the board (ADR 017): its position may not
  // change until it is unarchived.
  if (state.archived) throw new BadRequest("Carte archivée : désarchiver avant de déplacer.");
  const to = targetOf(config, body);
  const beforeId = validBeforeId(context.states, state, body, { ...to, anyLane: unifiedColumnIds(config).has(to.columnId) });
  if (state.laneId === to.laneId && state.columnId === to.columnId && beforeId === undefined) {
    throw new BadRequest("Carte déjà dans cette cellule.");
  }
  const from = { laneId: state.laneId, columnId: state.columnId };
  const gesture = readGesture(config, from, to, laneChosen(config, state.id, context.events));
  const sent = sentDecisions(body["decisions"]);
  checkDecisions(config, requiredDecisions(config, gesture), sent);
  const moved = movedEvent(state.id, from, to, context.actor, context.ts, beforeId);
  // The canal from → to is the server's own reading of the move, on the
  // requalification only; whatever the client sent there is dropped.
  const decided = sent.map((entry) => {
    const requalify = entry["decisionId"] === REQUALIFY_DECISION_ID;
    const body = { ...entry, fromLaneId: requalify ? from.laneId : undefined, toLaneId: requalify ? to.laneId : undefined };
    return buildDecided(config, state, body, context.ts, context.actor, { acceptLanes: requalify });
  });
  return [moved, ...decided];
}
