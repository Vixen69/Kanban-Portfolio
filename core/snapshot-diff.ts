// What changed on the board since an instantané (ADR 053, author
// 2026-09-30: « je tire les mêmes fichiers… mais ça bouge à chaque fois un
// petit peu ; j'ai vraiment la pétoche »): the board as it was at the
// snapshot's log position, set against the board now — projects that
// arrived, disappeared, went absent from the import or came back, moved,
// changed domain, type or title, were archived. A read of the log and the
// stored cards; nothing is written. Pure; no React, no Node.

import type { BoardConfig, Card, CardEvent, CardState } from "./types.ts";
import { eventSequence } from "./event-sequence.ts";
import { foldEvents } from "./state.ts";
import { unifiedColumnIds } from "./layout.ts";

/** The kinds of change, in the order they are read. */
export type ChangeKind =
  | "added" | "absent" | "removed" | "back" | "moved" | "domain" | "type" | "title" | "archived" | "unarchived";

/** One card's change since the snapshot. from / to: ids (column|lane, domain, type) or titles. */
export interface CardChange {
  kind: ChangeKind;
  cardId: string;
  title: string;
  codename: string | null;
  exercise: number | null;
  from: string | null;
  to: string | null;
}

/**
 * The board at a log position: the snapshot's base cards folded with the
 * events written up to it (ADR 042 — restores before it applied as then).
 * Inputs: the snapshot's cards, the whole log, the position. Output: the
 * CardState[] of that moment. Failure: none.
 */
export function boardAt(cards: Card[], events: readonly CardEvent[], logSeq: number): CardState[] {
  return foldEvents(cards, events.filter((event) => eventSequence(event.id) <= logSeq));
}

function change(kind: ChangeKind, card: CardState, from: string | null = null, to: string | null = null): CardChange {
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

const ORDER: readonly ChangeKind[] = ["added", "absent", "removed", "back", "moved", "domain", "type", "title", "archived", "unarchived"];

/**
 * The changes between two boards, grouped by kind (ORDER), then by title.
 * Inputs: the config (the canal-less columns), the board then, the board
 * now. Output: CardChange[]. Failure: none.
 */
export function diffBoards(config: BoardConfig, before: readonly CardState[], after: readonly CardState[]): CardChange[] {
  const unified = unifiedColumnIds(config);
  const then = new Map(before.map((card) => [card.id, card]));
  const now = new Map(after.map((card) => [card.id, card]));
  const out: CardChange[] = [];
  for (const card of after) {
    const old = then.get(card.id);
    if (old === undefined) out.push(change("added", card));
    else out.push(...presenceChanges(old, card), ...fieldChanges(old, card, unified));
  }
  for (const card of before) if (!now.has(card.id)) out.push(change("removed", card));
  const rank = (kind: ChangeKind) => ORDER.indexOf(kind);
  return out.sort((a, b) => rank(a.kind) - rank(b.kind) || a.title.localeCompare(b.title, "fr"));
}
