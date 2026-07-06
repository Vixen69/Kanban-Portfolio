// Presentation lookups shared by the front components: config lists indexed
// by id (O(1) renders instead of a find() per card), plus the actor display
// rule. No React, no network — pure helpers over the validated config.

import type { BoardConfig, Column, Domain, Lane, ProjectType } from "../core/types.ts";

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

/**
 * Domains of the config keyed by id.
 * Input: the board config. Output: a fresh Record (unknown id → undefined).
 * Failure: none.
 */
export function domainById(config: BoardConfig): Record<string, Domain> {
  return byId(config.domains);
}

/**
 * Project types of the config keyed by id.
 * Input: the board config. Output: a fresh Record (unknown id → undefined).
 * Failure: none.
 */
export function typeById(config: BoardConfig): Record<string, ProjectType> {
  return byId(config.types);
}

/**
 * Columns of the config keyed by id.
 * Input: the board config. Output: a fresh Record (unknown id → undefined).
 * Failure: none.
 */
export function columnById(config: BoardConfig): Record<string, Column> {
  return byId(config.columns);
}

/**
 * Lanes (canaux) of the config keyed by id.
 * Input: the board config. Output: a fresh Record (unknown id → undefined).
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
