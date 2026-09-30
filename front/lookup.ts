// Presentation lookups shared by the front components: config lists indexed
// by id (O(1) renders instead of a find() per card), plus the actor display
// rule. No React, no network — pure helpers over the validated config.

import type { BoardConfig, CardState, Column, Domain, Lane, Profile, ProjectType } from "../core/types.ts";
import { domainName } from "../core/domain-check.ts";

// One index per config list, kept as long as the list itself (ADR 051): the
// tickets read the domain and type of every card at each render, and a
// config is replaced whole, never edited in place.
const indexes = new WeakMap<object, Record<string, unknown>>();

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  let index = indexes.get(items);
  if (index === undefined) {
    index = Object.fromEntries(items.map((item) => [item.id, item]));
    indexes.set(items, index);
  }
  return index as Record<string, T>;
}

/**
 * Domains of the config keyed by id.
 * Input: the board config. Output: a shared, read-only Record (unknown id → undefined).
 * Failure: none.
 */
export function domainById(config: BoardConfig): Record<string, Domain> {
  return byId(config.domains);
}

/**
 * DSI profiles (métiers) of the config keyed by id.
 * Input: the board config. Output: a shared, read-only Record (unknown id → undefined).
 * Failure: none.
 */
export function profileById(config: BoardConfig): Record<string, Profile> {
  return byId(config.profiles);
}

/**
 * Project types of the config keyed by id.
 * Input: the board config. Output: a shared, read-only Record (unknown id → undefined).
 * Failure: none.
 */
export function typeById(config: BoardConfig): Record<string, ProjectType> {
  return byId(config.types);
}

/**
 * Columns of the config keyed by id.
 * Input: the board config. Output: a shared, read-only Record (unknown id → undefined).
 * Failure: none.
 */
export function columnById(config: BoardConfig): Record<string, Column> {
  return byId(config.columns);
}

/**
 * Lanes (canaux) of the config keyed by id.
 * Input: the board config. Output: a shared, read-only Record (unknown id → undefined).
 * Failure: none.
 */
export function laneById(config: BoardConfig): Record<string, Lane> {
  return byId(config.lanes);
}

/**
 * Display name of an event actor. The middle stamps "anonymous" on every
 * event until authentication lands (RP3); the UI shows it as « vous ».
 * Input: the stored actor string. Output: the string to render.
 * Failure: none.
 */
export function displayActor(actor: string): string {
  return actor === "anonymous" ? "vous" : actor;
}

/**
 * The « domaine · canal · colonne » line of an archive row: the domain's
 * short name (its name, « Sans domaine » when it has none), the canal and
 * column names, falling back to the raw ids the config does not declare.
 * Inputs: the config, the folded card. Output: the line, separators
 * spaced « · ». Failure: none.
 */
export function archiveMeta(config: BoardConfig, card: Pick<CardState, "domain" | "laneId" | "columnId">): string {
  const domain = domainById(config)[card.domain]?.short ?? domainName(config, card.domain);
  const lane = laneById(config)[card.laneId]?.name ?? card.laneId;
  const column = columnById(config)[card.columnId]?.name ?? card.columnId;
  return `${domain} · ${lane} · ${column}`;
}
