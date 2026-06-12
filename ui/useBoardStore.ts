// React bridge over the core store: fixtures in, events out, fold on read.
// The UI never mutates cards — every change is an appended event.

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { BoardConfig, Card, CardEvent, CardPatch, CardState } from "../core/types.ts";
import { InMemoryEventStore, lifecycleEvent, movedEvent } from "../core/events.ts";
import { foldEvents, toCard } from "../core/state.ts";
import { createFixtures } from "../adapters/fixtures/index.ts";

/** Actor recorded on events produced by this (not yet authenticated) UI. */
export const LOCAL_ACTOR = "local";

/** What the view layer gets: derived states, the log, the write actions. */
export interface BoardStore {
  cards: CardState[];
  /** The full event log snapshot (history rendering, Sprint 6 metrics). */
  events: CardEvent[];
  /** Appends a "moved" event; no-op when the card is already in the cell. */
  moveCard(cardId: string, to: { laneId: string; columnId: string }): void;
  /** Appends a "blocked" event with the reason. */
  blockCard(cardId: string, reason: string): void;
  /** Appends an "unblocked" event. */
  unblockCard(cardId: string): void;
  /** Appends an "edited" event carrying the whitelisted field patch. */
  editCard(cardId: string, patch: CardPatch): void;
}

interface Backbone {
  baseCards: Card[];
  events: InMemoryEventStore;
}

function buildBackbone(config: BoardConfig, now: Date): Backbone {
  const { dataSource, seedEvents } = createFixtures(config, now);
  const events = new InMemoryEventStore();
  for (const input of seedEvents) events.append(input);
  const baseCards = dataSource
    .listSubjects()
    .map((subject) => toCard(subject, dataSource.getFinancials(subject.id)));
  return { baseCards, events };
}

/**
 * Creates (once) the fixtures-backed board store and exposes the folded
 * card states plus the event log, re-derived after every appended event.
 * Inputs: the validated board config, the session's "now".
 * Output: a BoardStore. Failure: none for a valid config.
 */
export function useBoardStore(config: BoardConfig, now: Date): BoardStore {
  const backboneRef = useRef<Backbone | null>(null);
  backboneRef.current ??= buildBackbone(config, now);
  const { baseCards, events } = backboneRef.current;

  const subscribe = useCallback((onChange: () => void) => events.subscribe(onChange), [events]);
  const version = useSyncExternalStore(subscribe, () => events.size());

  const eventList = useMemo(
    () => events.list(),
    // version is the change signal for the otherwise-stable event store.
    [events, version],
  );
  const cards = useMemo(() => foldEvents(baseCards, eventList), [baseCards, eventList]);

  const moveCard = useCallback(
    (cardId: string, to: { laneId: string; columnId: string }) => {
      const card = foldEvents(baseCards, events.list()).find((state) => state.id === cardId);
      if (!card || (card.laneId === to.laneId && card.columnId === to.columnId)) return;
      const from = { laneId: card.laneId, columnId: card.columnId };
      events.append(movedEvent(cardId, from, to, LOCAL_ACTOR, new Date().toISOString()));
    },
    [baseCards, events],
  );

  const lifecycle = useLifecycleWriters(events);
  return { cards, events: eventList, moveCard, ...lifecycle };
}

function useLifecycleWriters(events: InMemoryEventStore) {
  const blockCard = useCallback(
    (cardId: string, reason: string) => {
      events.append(lifecycleEvent("blocked", cardId, LOCAL_ACTOR, new Date().toISOString(), { reason }));
    },
    [events],
  );
  const unblockCard = useCallback(
    (cardId: string) => {
      events.append(lifecycleEvent("unblocked", cardId, LOCAL_ACTOR, new Date().toISOString()));
    },
    [events],
  );
  const editCard = useCallback(
    (cardId: string, patch: CardPatch) => {
      events.append(lifecycleEvent("edited", cardId, LOCAL_ACTOR, new Date().toISOString(), { patch }));
    },
    [events],
  );
  return { blockCard, unblockCard, editCard };
}
