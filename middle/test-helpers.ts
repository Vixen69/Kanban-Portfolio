// Shared middle test scaffolding (test-only module, mirrors core/test-helpers).

import type { BoardStorage } from "../core/ports.ts";
import { filterEvents } from "../core/event-filter.ts";
import type { BoardConfig } from "../core/types.ts";
import type { ConfigStore } from "./config-store.ts";
import type { CardEventInput } from "../core/events.ts";
import type { CapacitySnapshot, Card, CardEvent } from "../core/types.ts";
import { summarizeSnapshot, type BoardSnapshot } from "../core/snapshot.ts";
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
    ...stubSnapshots(baseCards, () => seq),
    async close() {},
  };
}

/**
 * The snapshot side of a storage stub (ADR 042), over the stub's own card
 * list and sequence counter: snapshots kept in memory, restoreCards
 * replaces the list in place.
 * Inputs: the mutable base card list, the current sequence reader.
 * Output: the five snapshot methods. Failure: saveSnapshot throws on a duplicate id.
 */
export function stubSnapshots(
  baseCards: Card[], lastSeq: () => number,
): Pick<BoardStorage, "saveSnapshot" | "listSnapshots" | "loadSnapshot" | "restoreCards" | "lastSeq"> {
  const snapshots = new Map<string, BoardSnapshot>();
  return {
    async saveSnapshot(snapshot: BoardSnapshot) {
      if (snapshots.has(snapshot.id)) throw new Error(`instantané dupliqué : ${snapshot.id}`);
      snapshots.set(snapshot.id, structuredClone(snapshot));
    },
    async listSnapshots() {
      return [...snapshots.values()].map(summarizeSnapshot).reverse();
    },
    async loadSnapshot(id: string) {
      const snapshot = snapshots.get(id);
      return snapshot === undefined ? null : structuredClone(snapshot);
    },
    async restoreCards(cards: Card[]) {
      baseCards.splice(0, baseCards.length, ...cards.map((card) => ({ ...card })));
    },
    async lastSeq() {
      return lastSeq();
    },
  };
}

// ConfigStore stub recording every applied override.
export function stubConfigStore(
  defaults: BoardConfig,
): ConfigStore & { applied: { actor: string; config: BoardConfig }[] } {
  const applied: { actor: string; config: BoardConfig }[] = [];
  let runtime = defaults;
  let override: BoardConfig | null = null;
  return {
    applied,
    getRuntime: () => runtime,
    getDefaults: () => defaults,
    setRuntime(next: BoardConfig, actor: string): BoardConfig {
      applied.push({ actor, config: next });
      runtime = next;
      override = next;
      return next;
    },
    getOverride: () => override,
    restoreOverride(config: BoardConfig | null, actor: string): BoardConfig {
      const base = config ?? defaults;
      applied.push({ actor, config: base });
      override = config;
      runtime = { ...base, exercise: { ...base.exercise, year: runtime.exercise.year } };
      return runtime;
    },
    getExerciseYear: () => runtime.exercise.year,
    setExerciseYear(year: number): BoardConfig {
      runtime = { ...runtime, exercise: { ...runtime.exercise, year } };
      return runtime;
    },
  };
}
