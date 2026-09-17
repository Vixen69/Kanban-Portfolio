// Shared middle test scaffolding (test-only module, mirrors core/test-helpers).

import type { BoardStorage } from "../core/ports.ts";
import { filterEvents } from "../core/event-filter.ts";
import type { BoardConfig } from "../core/types.ts";
import type { ConfigStore } from "./config-store.ts";
import type { CardEventInput } from "../core/events.ts";
import type { CapacitySnapshot, Card, CardEvent } from "../core/types.ts";
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
  let capacity: CapacitySnapshot | null = null;
  let seq = 0;
  const append = (input: CardEventInput): CardEvent => {
    seq += 1;
    const event: CardEvent = { ...input, id: `evt-${seq}` };
    events.push(event);
    return event;
  };
  return {
    async importCards() {
      throw new Error("importCards non utilisé dans ces tests");
    },
    async insertCard(card: Card, created: CardEventInput): Promise<CardEvent> {
      if (baseCards.some((c) => c.id === card.id)) throw new Error(`id dupliqué : ${card.id}`);
      baseCards.push({ ...card });
      return append(created);
    },
    async appendEvent(input: CardEventInput): Promise<CardEvent> {
      return append(input);
    },
    async listEvents(filter = {}) {
      return filterEvents(events, filter);
    },
    async importCapacity(snapshot: CapacitySnapshot) {
      capacity = structuredClone(snapshot);
    },
    async getCapacity() {
      return capacity === null ? null : structuredClone(capacity);
    },
    async listBaseCards() {
      return baseCards.map((card) => ({ ...card }));
    },
    async close() {},
  };
}

// ConfigStore stub recording every applied override.
export function stubConfigStore(
  defaults: BoardConfig,
): ConfigStore & { applied: { actor: string; config: BoardConfig }[] } {
  const applied: { actor: string; config: BoardConfig }[] = [];
  let runtime = defaults;
  return {
    applied,
    getRuntime: () => runtime,
    getDefaults: () => defaults,
    setRuntime(next: BoardConfig, actor: string): BoardConfig {
      applied.push({ actor, config: next });
      runtime = next;
      return next;
    },
    getExerciseYear: () => runtime.exercise.year,
    setExerciseYear(year: number): BoardConfig {
      runtime = { ...runtime, exercise: { ...runtime.exercise, year } };
      return runtime;
    },
  };
}
