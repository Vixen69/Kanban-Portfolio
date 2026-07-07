// Shared middle test scaffolding (test-only module, mirrors core/test-helpers).

import type { BoardStorage } from "../core/ports.ts";
import type { CardEventInput } from "../core/events.ts";
import type { Card, CardEvent } from "../core/types.ts";
import { testCard } from "../core/test-helpers.ts";

/**
 * In-memory BoardStorage stub: base cards + an append-only event log with
 * ids evt-<n>. No HTTP, no disk. insertCard refuses a duplicate id.
 * Input: optional initial base cards (default one card S001).
 * Output: a BoardStorage. Failure: insertCard throws on duplicate ids.
 */
export function stubStorage(cards: Card[] = [testCard({ id: "S001" })]): BoardStorage {
  const baseCards = cards.map((card) => ({ ...card }));
  const events: CardEvent[] = [];
  let seq = 0;
  const append = (input: CardEventInput): CardEvent => {
    seq += 1;
    const event: CardEvent = { ...input, id: `evt-${seq}` };
    events.push(event);
    return event;
  };
  return {
    importCards() {
      throw new Error("importCards non utilisé dans ces tests");
    },
    insertCard(card: Card, created: CardEventInput): CardEvent {
      if (baseCards.some((c) => c.id === card.id)) throw new Error(`id dupliqué : ${card.id}`);
      baseCards.push({ ...card });
      return append(created);
    },
    appendEvent: append,
    listEvents: () => events.slice(),
    listBaseCards: () => baseCards.map((card) => ({ ...card })),
    close() {},
  };
}
