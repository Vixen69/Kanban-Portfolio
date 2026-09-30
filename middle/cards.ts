// POST /api/cards handler (ADR 012). Split from api.ts to respect the
// 300-line file cap; same style: a pure handler over injected storage. The
// server builds the whole Card — id, first column, timestamps, nature (from
// the canal, ADR 018) — from a creation intent: the QuickAdd fields, plus
// the optional facts « Plus d'informations » carries (ADR 057: code projet,
// sous-domaine, efforts, budgets, date RDR…), screened like an edit patch.

import type { BoardStorage } from "../core/ports.ts";
import type { BoardConfig, Card, CardPatch, Criticality } from "../core/types.ts";
import { laneNature } from "../core/config.ts";
import { CARD_TEXT_LIMITS } from "../core/card-input.ts";
import { asObject, BadRequest, isCriticality, serializedWrite, SERVER_ACTOR } from "./api.ts";
import type { ApiResult } from "./api.ts";
import { validatePatch } from "./validation.ts";

interface NewCardInput {
  title: string;
  domain: string;
  laneId: string;
  typeId: string;
  criticality: Criticality;
  owner: string;
  /** The exercise the card is created in (ADR 035); defaults to the current one. */
  exercise: number;
  /** The optional facts typed at creation (ADR 057), already validated. */
  facts: CardPatch;
}

// The keys of the intent proper; every other key is an optional fact.
const INTENT_KEYS: ReadonlySet<string> = new Set([
  "title", "domain", "laneId", "typeId", "criticality", "owner", "exercise",
]);

// Card facts a creation may NOT carry, and why (ADR 057). Pull flow: every
// subject enters the first column, today (CLAUDE.md §1, ADR 012).
const NOT_AT_CREATION: ReadonlyMap<string, string> = new Map([
  ["columnId", "tout sujet entre par la première colonne"],
  ["createdAt", "un sujet entre à la date du jour"],
  ["nature", "la nature suit le canal"],
  ["id", "attribué par le serveur"],
  ["source", "attribuée par le serveur"],
  ["sciformaId", "posée par l’import seul"],
]);

/**
 * POST /api/cards — validates a creation intent against the runtime config,
 * builds the full Card server-side, and persists it WITH its "created"
 * event (toColumn = first column, payload { laneId }) in one atomic
 * storage batch: the card can never exist without its audit trace.
 * Inputs: the storage, the runtime board config, the parsed JSON body
 * ({ title, domain, laneId?, typeId, criticality, owner, exercise? } plus
 * any optional fact an edit may patch — ADR 057) — the nature is derived
 * server-side from the canal (positional, ADR 018); the canal defaults to
 * the « complicated » one when the intent names none (ADR 039); the
 * exercise defaults to the current one (ADR 035).
 * Output: 201 with { card, event }.
 * Failure: throws BadRequest (→ 400) on invalid input, an unknown or
 * refused key, or a closed exercise; propagates storage errors, including
 * a duplicate id (→ 500) — nothing is persisted then.
 */
export function postCard(storage: BoardStorage, config: BoardConfig, raw: unknown): Promise<ApiResult> {
  // Serialized with every other write: two concurrent creations would both
  // read the same base cards and compute the same next id (duplicate-key 500).
  return serializedWrite(async () => {
    const input = validateCardInput(config, asObject(raw));
    const ts = new Date().toISOString();
    const card = buildCard(config, await storage.listBaseCards(), input, ts);
    const event = await storage.insertCard(card, {
      ts,
      actor: SERVER_ACTOR,
      cardId: card.id,
      type: "created",
      fromColumn: null,
      toColumn: card.columnId,
      payload: { laneId: card.laneId },
    });
    return { status: 201, body: { card, event } };
  });
}

// Checks the intent's own fields against the runtime topology. The title
// and owner are trimmed; the owner may be empty (subjects can arrive
// unassigned). A closed exercise refuses creation, as it refuses a load.
function validateCardInput(config: BoardConfig, body: Record<string, unknown>): NewCardInput {
  const title = typeof body["title"] === "string" ? body["title"].trim() : "";
  if (title.length === 0) throw new BadRequest("Titre requis.");
  if (title.length > CARD_TEXT_LIMITS.title) throw new BadRequest("Titre trop long (200 caractères max).");
  const domain = body["domain"];
  if (typeof domain !== "string" || !config.domains.some((d) => d.id === domain)) {
    throw new BadRequest("Domaine inconnu.");
  }
  const { laneId, typeId, criticality } = validateRefs(config, body);
  const owner = body["owner"] === undefined ? "" : body["owner"];
  if (typeof owner !== "string") throw new BadRequest("Chef de projet invalide.");
  if (owner.trim().length > CARD_TEXT_LIMITS.owner) {
    throw new BadRequest("Chef de projet trop long (120 caractères max).");
  }
  const exercise = body["exercise"] === undefined ? config.exercise.year : body["exercise"];
  if (typeof exercise !== "number" || !Number.isInteger(exercise) || exercise < 2000 || exercise > 2100) {
    throw new BadRequest("Exercice invalide.");
  }
  if (exercise < config.exercise.year) throw new BadRequest(`Exercice ${exercise} clos : création refusée.`);
  const facts = creationFacts(config, body, domain);
  return { title, domain, laneId, typeId, criticality, owner: owner.trim(), exercise, facts };
}

// The canal, the type and the criticality of the intent.
function validateRefs(config: BoardConfig, body: Record<string, unknown>): Pick<NewCardInput, "laneId" | "typeId" | "criticality"> {
  // No canal named (ADR 039: before the RDO the intake has none to choose):
  // the same default as the import — the « complicated » canal, else the first.
  const laneId = body["laneId"] === undefined ? defaultLaneId(config) : body["laneId"];
  if (typeof laneId !== "string" || !config.lanes.some((lane) => lane.id === laneId)) {
    throw new BadRequest("Canal inconnu.");
  }
  const typeId = body["typeId"];
  if (typeof typeId !== "string" || !config.types.some((t) => t.id === typeId)) {
    throw new BadRequest("Type de projet inconnu.");
  }
  const criticality = body["criticality"];
  if (!isCriticality(criticality)) throw new BadRequest("Criticité invalide.");
  return { laneId, typeId, criticality };
}

// Every key beyond the intent is a fact an edit could patch, checked with
// the SAME validators (validatePatch: the sub-domain against the chosen
// domain, custom values against config.fields). An unknown or refused key
// is a 400, never silently dropped (ADR 057).
function creationFacts(config: BoardConfig, body: Record<string, unknown>, domain: string): CardPatch {
  const facts = Object.fromEntries(Object.entries(body).filter(([key]) => !INTENT_KEYS.has(key)));
  for (const key of Object.keys(facts)) {
    const why = NOT_AT_CREATION.get(key);
    if (why !== undefined) throw new BadRequest(`Champ de création non autorisé : « ${key} » (${why}).`);
  }
  validatePatch(config, facts, { domain, custom: {} }, "Champ de création non autorisé");
  return facts as CardPatch;
}

function defaultLaneId(config: BoardConfig): string {
  return config.lanes.find((lane) => lane.natureKey === "complicated")?.id ?? config.lanes[0]?.id ?? "";
}

// Next free "S"-prefixed id: max numeric suffix over existing base cards + 1,
// padded to 3 digits (S001…), growing naturally past S999.
function nextCardId(cards: Card[]): string {
  let max = 0;
  for (const card of cards) {
    const match = /^S(\d+)$/.exec(card.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `S${String(max + 1).padStart(3, "0")}`;
}

// The design-v10 fields all start empty on a freshly created card.
function blankDesignV10Fields(): Pick<
  Card,
  | "budgetEngaged" | "budgetRdli" | "chargeByProfile" | "contentionProfiles"
  | "contentionNote" | "risks" | "projectConstraints" | "alerts" | "dateRdr"
> {
  return {
    budgetEngaged: null,
    budgetRdli: null,
    chargeByProfile: [],
    contentionProfiles: [],
    contentionNote: "",
    risks: [],
    projectConstraints: [],
    alerts: [],
    dateRdr: null,
  };
}

// The code typed at creation, trimmed; none typed = none (ADR 057: the
// server no longer invents a « PX » code that looked like a real one).
function typedCode(facts: CardPatch): string | null {
  const code = facts.codename?.trim() ?? "";
  return code === "" ? null : code;
}

// Server-built card: every non-intent field gets its creation default, then
// the typed facts on top; the card always enters the first column of the
// runtime config (pull flow).
function buildCard(config: BoardConfig, existing: Card[], input: NewCardInput, ts: string): Card {
  const firstColumn = config.columns[0];
  if (!firstColumn) throw new Error("Configuration sans colonne.");
  return {
    id: nextCardId(existing),
    title: input.title,
    domain: input.domain,
    subDomain: null,
    laneId: input.laneId,
    columnId: firstColumn.id,
    owner: input.owner,
    exercise: input.exercise,
    criticality: input.criticality,
    typeId: input.typeId,
    nature: laneNature(config, input.laneId),
    tags: [],
    dependencies: [],
    blocked: false,
    blockedReason: null,
    blockedSince: null,
    effortEstimated: null,
    effortConsumed: null,
    budgetEstimated: null,
    budgetConsumed: null,
    loadPlan: null,
    resources: [],
    notes: "",
    ...blankDesignV10Fields(),
    custom: {},
    ...input.facts,
    codename: typedCode(input.facts),
    sciformaId: null,
    createdAt: ts,
    source: "manual",
  };
}
