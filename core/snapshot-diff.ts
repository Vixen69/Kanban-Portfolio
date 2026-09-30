// What changed on the board between two readings (ADR 053, author
// 2026-09-30: « je tire les mêmes fichiers… mais ça bouge à chaque fois un
// petit peu ; j'ai vraiment la pétoche »): the board as it was at a
// snapshot's log position set against the board now — projects that
// arrived, disappeared, went absent from the import or came back, moved,
// changed domain, type or title, were archived. ADR 055 makes it the ONE
// change engine: the import report reads the same comparison between the
// board now and the board after the load, and both carry the refreshed
// VALUES too — chef de projet, money and effort figures, date RDR, plan de
// charge (figure-changes.ts). A read of the log and the stored cards;
// nothing is written. Pure; no React, no Node.

import type { BoardConfig, Card, CardEvent, CardState } from "./types.ts";
import type { CardChange, ChangeKind } from "./change-types.ts";
import { FIGURE_FACTS } from "./change-types.ts";
import { eventSequence } from "./event-sequence.ts";
import { foldEvents } from "./state.ts";
import { unifiedColumnIds } from "./layout.ts";
import { valueChanges } from "./figure-changes.ts";

export type {
  CardChange, CardPlanFigures, ChangeBase, ChangeKind, FigureChange, FigureFact, FigureUnit, PlanChange, PlanFigures,
  ProfilePlanChange,
} from "./change-types.ts";
export { FIGURE_FACTS } from "./change-types.ts";

/**
 * The board at a log position: the snapshot's base cards folded with the
 * events written up to it (ADR 042 — restores before it applied as then).
 * Inputs: the snapshot's cards, the whole log, the position. Output: the
 * CardState[] of that moment. Failure: none.
 */
export function boardAt(cards: Card[], events: readonly CardEvent[], logSeq: number): CardState[] {
  return foldEvents(cards, events.filter((event) => eventSequence(event.id) <= logSeq));
}

type TextKind = Exclude<ChangeKind, "figure" | "plan">;

function change(kind: TextKind, card: CardState, from: string | null = null, to: string | null = null): CardChange {
  return { kind, cardId: card.id, title: card.title, codename: card.codename, exercise: card.exercise ?? null, from, to };
}

// The place that counts: the column, and the canal once the card is past
// the canal-less intake (ADR 039) — a hidden canal is not a move.
function place(card: CardState, unified: ReadonlySet<string>): string {
  return unified.has(card.columnId) ? card.columnId : `${card.columnId}|${card.laneId}`;
}

function presenceChanges(before: CardState, after: CardState): CardChange[] {
  const out: CardChange[] = [];
  if (before.absentFromLastImport === null && after.absentFromLastImport !== null) out.push(change("absent", after));
  if (before.absentFromLastImport !== null && after.absentFromLastImport === null) out.push(change("back", after));
  if (!before.archived && after.archived) out.push(change("archived", after));
  if (before.archived && !after.archived) out.push(change("unarchived", after));
  return out;
}

function fieldChanges(before: CardState, after: CardState, unified: ReadonlySet<string>): CardChange[] {
  const out: CardChange[] = [];
  if (place(before, unified) !== place(after, unified)) out.push(change("moved", after, place(before, unified), place(after, unified)));
  if (before.domain !== after.domain) out.push(change("domain", after, before.domain, after.domain));
  if ((before.typeId ?? null) !== (after.typeId ?? null)) out.push(change("type", after, before.typeId ?? null, after.typeId ?? null));
  if (before.title !== after.title) out.push(change("title", after, before.title, after.title));
  return out;
}

const ORDER: readonly ChangeKind[] = [
  "added", "absent", "removed", "back", "moved", "domain", "type", "title",
  "owner", "figure", "dateRdr", "plan", "archived", "unarchived",
];

// Kind first; inside « figure », the FIGURE_FACTS order; then the title.
function rank(entry: CardChange): number {
  const kind = ORDER.indexOf(entry.kind) * 10;
  return entry.kind === "figure" ? kind + FIGURE_FACTS.findIndex((f) => f.fact === entry.figure.fact) : kind;
}

/**
 * The changes between two boards, grouped by kind (ORDER; the figures in
 * FIGURE_FACTS order), then by title. A card on both boards gives its
 * presence, place, domain, type, title changes and its refreshed values
 * (valueChanges); a card on one board only gives « added » or « removed ».
 * Inputs: the config (the canal-less columns, the métiers counted by the
 * RAF), the board then, the board now. Output: CardChange[]. Failure: none.
 */
export function diffBoards(config: BoardConfig, before: readonly CardState[], after: readonly CardState[]): CardChange[] {
  const unified = unifiedColumnIds(config);
  const then = new Map(before.map((card) => [card.id, card]));
  const now = new Map(after.map((card) => [card.id, card]));
  const out: CardChange[] = [];
  for (const card of after) {
    const old = then.get(card.id);
    if (old === undefined) out.push(change("added", card));
    else out.push(...presenceChanges(old, card), ...fieldChanges(old, card, unified), ...valueChanges(old, card, config));
  }
  for (const card of before) if (!now.has(card.id)) out.push(change("removed", card));
  return out.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, "fr"));
}
