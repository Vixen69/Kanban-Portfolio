// POST /api/cards handler (ADR 012). Split from api.ts to respect the
// 300-line file cap; same style: a pure handler over injected storage. The
// server builds the whole Card — id, codename, first column, timestamps,
// nature (from the canal, ADR 018) — from a minimal creation intent (the
// QuickAdd form fields).

import type { BoardStorage } from "../core/ports.ts";
import type { BoardConfig, Card, Criticality } from "../core/types.ts";
import { laneNature } from "../core/config.ts";
import { asObject, BadRequest, isCriticality, serializedWrite, SERVER_ACTOR } from "./api.ts";
import type { ApiResult } from "./api.ts";

interface NewCardInput {
  title: string;
  domain: string;
  laneId: string;
  typeId: string;
  criticality: Criticality;
  owner: string;
}

/**
 * POST /api/cards — validates a creation intent against the runtime config,
 * builds the full Card server-side, and persists it WITH its "created"
 * event (toColumn = first column, payload { laneId }) in one atomic
 * storage batch: the card can never exist without its audit trace.
 * Inputs: the storage, the runtime board config, the parsed JSON body
 * ({ title, domain, laneId, typeId, criticality, owner }) — the nature is
 * derived server-side from the canal (positional, ADR 018).
 * Output: 201 with { card, event }.
 * Failure: throws BadRequest (→ 400) on invalid input; propagates storage
 * errors, including a duplicate id (→ 500) — nothing is persisted then.
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

// Checks every creation field against the runtime topology. The title and
// owner are trimmed; the owner may be empty (subjects can arrive unassigned).
function validateCardInput(config: BoardConfig, body: Record<string, unknown>): NewCardInput {
  const title = typeof body["title"] === "string" ? body["title"].trim() : "";
  if (title.length === 0) throw new BadRequest("Titre requis.");
  if (title.length > 200) throw new BadRequest("Titre trop long (200 caractères max).");
  const domain = body["domain"];
  if (typeof domain !== "string" || !config.domains.some((d) => d.id === domain)) {
    throw new BadRequest("Domaine inconnu.");
  }
  const laneId = body["laneId"];
  if (typeof laneId !== "string" || !config.lanes.some((lane) => lane.id === laneId)) {
    throw new BadRequest("Canal inconnu.");
  }
  const typeId = body["typeId"];
  if (typeof typeId !== "string" || !config.types.some((t) => t.id === typeId)) {
    throw new BadRequest("Type de projet inconnu.");
  }
  const criticality = body["criticality"];
  if (!isCriticality(criticality)) throw new BadRequest("Criticité invalide.");
  const owner = body["owner"] === undefined ? "" : body["owner"];
  if (typeof owner !== "string") throw new BadRequest("Chef de projet invalide.");
  if (owner.trim().length > 120) {
    throw new BadRequest("Chef de projet trop long (120 caractères max).");
  }
  return { title, domain, laneId, typeId, criticality, owner: owner.trim() };
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

// Server-built card: every non-intent field gets its creation default; the
// card always enters the first column of the runtime config (pull flow).
function buildCard(config: BoardConfig, existing: Card[], input: NewCardInput, ts: string): Card {
  const firstColumn = config.columns[0];
  if (!firstColumn) throw new Error("Configuration sans colonne.");
  return {
    id: nextCardId(existing),
    title: input.title,
    domain: input.domain,
    laneId: input.laneId,
    columnId: firstColumn.id,
    owner: input.owner,
    criticality: input.criticality,
    typeId: input.typeId,
    codename: `PX${Math.floor(1000000 + Math.random() * 9000000)}`,
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
    sciformaId: null,
    custom: {},
    createdAt: ts,
    source: "manual",
  };
}
