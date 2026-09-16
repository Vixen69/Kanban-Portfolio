// Domain conflicts at import (ADR 036, author 2026-09-16): the domain is
// what the responsables de domaine arbitrate on, so the export never
// overwrites it silently on a card the board already holds. A conflict is
// a stored card whose domain / sub-domain differs from what the export
// and the rules propose. The PMO decides one by one — « garder » or
// « remplacer » — and each decision is an `edited` event of the import
// actor (payload.decision, payload.proposed): the log stays the truth, a
// hand-set domain shows as such, and a kept card is not asked again while
// the export proposes the same thing. Pure: no storage, no clock.

import type { BoardConfig, CardEvent, CardState } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { lifecycleEvent } from "../../core/events.ts";
import type { DomainConflict, DomainDecision, DomainRef } from "../../core/import-types.ts";
import type { EnrichedCard } from "./enrich.ts";

/** Actor written on every event the loader produces. */
export const IMPORT_ACTOR = "import-csv";

/** What the log last said about a card's domain. */
export interface PriorDecision {
  kind: "main" | "garder" | "remplacer";
  ts: string;
  /** What the export proposed when a « garder » was taken — that proposal is not asked again. */
  proposed: DomainRef | null;
}

/** The outcome of checking one stored card against the export. */
export type ConflictCheck =
  | { kind: "none" }
  | { kind: "kept-by-prior" }
  | { kind: "conflict"; conflict: DomainConflict };

function domainRefOf(value: unknown): DomainRef | null {
  if (typeof value !== "object" || value === null) return null;
  const { domain, subDomain } = value as { domain?: unknown; subDomain?: unknown };
  if (typeof domain !== "string") return null;
  return { domain, subDomain: typeof subDomain === "string" ? subDomain : null };
}

/**
 * The last decision the log holds on each card's domain: an `edited`
 * event whose patch carries `domain` — by a human in the fiche (« main »),
 * or by the import (« garder » / « remplacer », payload.decision).
 * Inputs: the events in LOG order (the storage lists them by seq; the
 * last one wins — never the timestamp, an import may be dated earlier).
 * Output: card id -> prior decision. Failure: none.
 */
export function priorDomainDecisions(events: readonly CardEvent[]): Map<string, PriorDecision> {
  const priors = new Map<string, PriorDecision>();
  for (const event of events) {
    if (event.type !== "edited") continue;
    const patch = event.payload["patch"];
    if (typeof patch !== "object" || patch === null || !("domain" in patch)) continue;
    const decision = event.payload["decision"];
    const kind = event.actor === IMPORT_ACTOR && (decision === "garder" || decision === "remplacer") ? decision : "main";
    priors.set(event.cardId, { kind, ts: event.ts, proposed: kind === "garder" ? domainRefOf(event.payload["proposed"]) : null });
  }
  return priors;
}

// A stored sub-domain the config no longer declares counts as none (the
// display already folds it, ADR 013): no conflict over a ghost.
function boardDomain(existing: CardState, config: BoardConfig): DomainRef {
  const subDomains = config.domains.find((d) => d.id === existing.domain)?.subDomains ?? [];
  const declared = subDomains.some((s) => s.id === existing.subDomain);
  return { domain: existing.domain, subDomain: declared ? existing.subDomain : null };
}

function sameRef(a: DomainRef, b: DomainRef): boolean {
  return a.domain === b.domain && a.subDomain === b.subDomain;
}

/**
 * Checks one stored card against what the export proposes for it. No
 * conflict when the export resolved no domain (the board knows better
 * than nothing), when both agree, or when a « garder » was already taken
 * against this very proposal (kept-by-prior).
 * Inputs: the stored card, the deck card, the config, the card's prior
 * decision (if any). Output: the check. Failure: none.
 */
export function domainConflict(
  existing: CardState, card: EnrichedCard, config: BoardConfig, prior: PriorDecision | undefined,
): ConflictCheck {
  if (card.domainId === null) return { kind: "none" };
  const board = boardDomain(existing, config);
  const proposed: DomainRef = { domain: card.domainId, subDomain: card.subDomainId };
  if (sameRef(board, proposed)) return { kind: "none" };
  if (prior?.kind === "garder" && prior.proposed !== null && sameRef(prior.proposed, proposed)) return { kind: "kept-by-prior" };
  return {
    kind: "conflict",
    conflict: {
      cardId: existing.id, title: existing.title, codename: existing.codename,
      board, proposed, rule: card.domainRule ?? "règle non dite",
      prior: prior === undefined ? null : { kind: prior.kind, ts: prior.ts },
    },
  };
}

/**
 * The `edited` event that records one decision (ADR 036): « remplacer »
 * patches the card to the proposed domain; « garder » patches it to its
 * own value (a no-op for the fold) and remembers what was refused, so the
 * same proposal is not asked again.
 * Inputs: the conflict, the decision, the timestamp. Output: the event
 * input (actor: the import). Failure: none.
 */
export function domainDecisionEvent(conflict: DomainConflict, decision: DomainDecision, ts: string): CardEventInput {
  const value = decision === "remplacer" ? conflict.proposed : conflict.board;
  return lifecycleEvent("edited", conflict.cardId, IMPORT_ACTOR, ts, {
    patch: { domain: value.domain, subDomain: value.subDomain },
    decision, proposed: conflict.proposed, board: conflict.board,
  });
}
