// ADR 060 (author, 2026-09-30 — « l'information nouvelle de l'export
// l'emporte »): a fact the import wrote and a human then corrected in the
// fiche (an `edited` event the fold replays over the base card) is taken
// back by the export when — and only when — the export brings a NEW value:
// one that differs from what the previous import wrote (the stored base
// card). While the export repeats the old value, the hand correction
// stands. The refreshed base alone cannot win (the fold replays the hand's
// `edited` over it), so the load appends ONE `edited` event per card, by
// the import actor, carrying the new values that must win. The facts are
// ADR 054's minus the title (a PMO's retitling is a deliberate label), the
// Sciforma id (never typed by hand) and the domain (ADR 036: a conflict
// the PMO decides). Pure.

import type { Card, CardEvent, CardPatch } from "../../core/types.ts";
import type { CardEventInput } from "../../core/events.ts";
import { lifecycleEvent } from "../../core/events.ts";
import { foldEvents } from "../../core/state.ts";
import { IMPORT_ACTOR } from "./domain-conflicts.ts";
import { FACTS } from "./keep-facts.ts";
import type { KeptFactCards } from "./keep-facts.ts";

/** The facts whose new export value takes back a hand correction, with the report's words. */
const NEWER_FACTS = FACTS.filter(
  (entry): entry is Extract<(typeof FACTS)[number], readonly [keyof CardPatch, string]> =>
    entry[0] !== "title" && entry[0] !== "sciformaId",
);

/** One existing card of a load: the base card the load writes and the one stored before. */
export interface RefreshedCard {
  fresh: Card;
  stored: Card;
}

/** What the rule writes: the events, and the cards named per fact for the report. */
export interface NewerFacts {
  events: CardEventInput[];
  replaced: KeptFactCards[];
}

// A value as the rule compares it: lists (the plan de charge) whatever
// their order, objects whatever their key order, null and absent alike.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/**
 * The `edited` events that let the export's new values win over the hand
 * corrections (ADR 060). A fact is written for a card when the base the
 * load writes differs from the stored base (the export brings a value the
 * previous import did not: a blank the files left is already the stored
 * value, ADR 054) AND the board, folded over that new base, would still
 * show another value (an `edited` event overrides it).
 * Inputs: the existing cards of the load (new base + stored base), the
 * whole stored log (read through the restores by the fold), the instant
 * of the load (the events' ts — after every hand edit).
 * Output: one event per card with at least one such fact (payload
 * { patch, reason: "export" }), and the cards named per fact in the
 * report's order. Nothing when the export repeats the previous values or
 * when no hand edit overrides them. Failure modes: none.
 */
export function newerFactEvents(refreshed: readonly RefreshedCard[], log: readonly CardEvent[], ts: string): NewerFacts {
  const folded = new Map(foldEvents(refreshed.map((r) => r.fresh), [...log]).map((state) => [state.id, state]));
  const events: CardEventInput[] = [];
  const tally = new Map<string, string[]>();
  for (const { fresh, stored } of refreshed) {
    const state = folded.get(fresh.id);
    if (state === undefined) continue;
    const patch: Record<string, unknown> = {};
    for (const [fact] of NEWER_FACTS) {
      if (same(fresh[fact], stored[fact]) || same(state[fact], fresh[fact])) continue;
      patch[fact] = fresh[fact];
      tally.set(fact, [...(tally.get(fact) ?? []), fresh.id]);
    }
    if (Object.keys(patch).length > 0) events.push(lifecycleEvent("edited", fresh.id, IMPORT_ACTOR, ts, { patch, reason: "export" }));
  }
  const replaced = NEWER_FACTS.flatMap(([fact, label]) => {
    const cardIds = tally.get(fact) ?? [];
    return cardIds.length === 0 ? [] : [{ label, cardIds }];
  });
  return { events, replaced };
}
