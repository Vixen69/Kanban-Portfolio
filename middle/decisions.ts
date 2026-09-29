// The "decided" intent (ADR 026, ADR 052): a portfolio decision recorded on
// a card with the blocks of the fiche « Décision et Raison » — its reason in
// the grid's terms and in clear, the options set aside, what it frees, and
// the pause (what lifts it, when it is reviewed, tactique or parking) or
// the requalification (what changed, validated by an architect). Screening
// here keeps junk out of the permanent log; the fold re-checks types on
// read (core/decision-record.ts). « Non tracée = non prise ».

import type { BoardConfig, CardState, DecisionType } from "../core/types.ts";
import type { CardEventInput } from "../core/events.ts";
import { lifecycleEvent } from "../core/events.ts";
import { isIsoDate } from "../core/decisions.ts";
import { PAUSE_DECISION_ID, REQUALIFY_DECISION_ID } from "../core/gesture.ts";
import { BadRequest } from "./errors.ts";

const TEXT_MAX = 1000;
const FREES_MAX = 300;

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

function parseDay(raw: unknown, label: string): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !isIsoDate(raw)) throw new BadRequest(`${label} invalide (AAAA-MM-JJ).`);
  return raw;
}

function parseText(raw: unknown, label: string, max = TEXT_MAX): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new BadRequest(`${label} invalide.`);
  const text = raw.trim();
  if (text.length > max) throw new BadRequest(`${label} : texte trop long (${max} caractères max).`);
  return text;
}

function parseEnum<T extends string>(raw: unknown, allowed: readonly T[], label: string): T | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (!allowed.includes(raw as T)) throw new BadRequest(`${label} invalide.`);
  return raw as T;
}

// Bloc 4 — what the decision frees or commits; absent when all empty.
function parseFrees(raw: unknown): Record<string, string> | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new BadRequest("« Ce que la décision libère » invalide.");
  const frees = raw as Record<string, unknown>;
  const out = {
    people: parseText(frees["people"], "Personnes libérées", FREES_MAX),
    budget: parseText(frees["budget"], "Budget libéré", FREES_MAX),
    capacity: parseText(frees["capacity"], "Capacité libérée", FREES_MAX),
  };
  return out.people === "" && out.budget === "" && out.capacity === "" ? null : out;
}

// The fiche's blocks beyond the reason, kept only when filled (the log
// stays readable; core/decision-record.ts reads absent fields as empty).
function parseBlocks(body: Record<string, unknown>, acceptLanes: boolean): Record<string, unknown> {
  const blocks: Record<string, unknown> = {
    instance: parseEnum(body["instance"], ["revue", "synchro"] as const, "Instance"),
    options: parseText(body["options"], "Options écartées"),
    frees: parseFrees(body["frees"]),
    liftCondition: parseText(body["liftCondition"], "Ce qui lèverait la pause"),
    pauseKind: parseEnum(body["pauseKind"], ["tactique", "parking"] as const, "Type de pause"),
    natureChange: parseText(body["natureChange"], "Ce qui a changé"),
    architectValidated: body["architectValidated"] === true ? true : null,
    decidedOn: parseDay(body["decidedOn"], "Date de décision"),
    fromLaneId: acceptLanes && typeof body["fromLaneId"] === "string" ? body["fromLaneId"] : null,
    toLaneId: acceptLanes && typeof body["toLaneId"] === "string" ? body["toLaneId"] : null,
  };
  return Object.fromEntries(Object.entries(blocks).filter(([, value]) => value !== null && value !== ""));
}

// What each decision must say: the requalification says what changed; the
// pause, why and when it is reviewed (none for a parking); any other traced
// decision, a grid term or a reason.
function checkTrace(decision: DecisionType, grounds: string[], reason: string, reviewDate: string | null, blocks: Record<string, unknown>, today: string): void {
  if (blocks["pauseKind"] !== undefined && decision.id !== PAUSE_DECISION_ID) throw new BadRequest("Type de pause : seulement pour une mise en pause.");
  if (typeof blocks["decidedOn"] === "string" && blocks["decidedOn"] > today) throw new BadRequest("Date de décision dans le futur.");
  if (decision.id === REQUALIFY_DECISION_ID) {
    if (blocks["natureChange"] === undefined) throw new BadRequest("Requalifier : dire ce qui a changé dans la nature du sujet.");
    return;
  }
  if (decision.traced && grounds.length === 0 && reason.length === 0) {
    throw new BadRequest(`Décision ${decision.short} : la raison est obligatoire (termes de la grille ou texte).`);
  }
  if (decision.id !== PAUSE_DECISION_ID) return;
  if (blocks["pauseKind"] === "parking" && reviewDate !== null) throw new BadRequest("Pause parking : pas d’échéance de réexamen.");
  if (blocks["pauseKind"] !== "parking" && reviewDate === null) throw new BadRequest("Mettre en pause : l’échéance du réexamen est obligatoire.");
}

/**
 * Builds the "decided" event from a client intent (or from a move's
 * decision, ADR 052).
 * Inputs: the config (decision types and grid terms), the card's folded
 * state, the body ({ decisionId, grounds?, reason?, reviewDate?, instance?,
 * options?, frees?, liftCondition?, pauseKind?, natureChange?,
 * architectValidated?, decidedOn? }), the server timestamp and actor;
 * options.acceptLanes: the canal from → to, set by the server for a
 * requalification move (never taken from a standalone intent).
 * Output: the CardEventInput. Failure: BadRequest (French) on an archived
 * card, an unknown decision or term, a text too long, an invalid date or
 * value, or a missing trace (see checkTrace).
 */
export function buildDecided(
  config: BoardConfig, state: CardState, body: Record<string, unknown>, ts: string, actor: string,
  options: { acceptLanes?: boolean } = {},
): CardEventInput {
  if (state.archived) throw new BadRequest("Carte archivée : désarchiver avant de décider.");
  const decision = config.decisions.find((d) => d.id === body["decisionId"]);
  if (decision === undefined) throw new BadRequest("Décision inconnue.");
  const grounds = parseGrounds(config, body["grounds"]);
  const reason = parseText(body["reason"], "Raison");
  const reviewDate = parseDay(body["reviewDate"], "Date de réexamen");
  const blocks = parseBlocks(body, options.acceptLanes === true);
  checkTrace(decision, grounds, reason, reviewDate, blocks, ts.slice(0, 10));
  return lifecycleEvent("decided", state.id, actor, ts, { decisionId: decision.id, grounds, reason, reviewDate, ...blocks });
}
