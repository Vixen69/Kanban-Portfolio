// The « types de ressource » reading (ADR 033, author 2026-09-11): the
// plan de charge's « Métier » is the unit the PDSI macro reasons on — a
// person's métier, and the métier of the generic rows nobody carries. Per
// métier: the persons' declared capacity (their « Disponible » lines) and
// planned load, the board's demand, the generic demand « à pourvoir », and
// the pressure = (planned + generic) / capacity. Also the tension roll-up
// of the loaded persons per métier. Pure; no React, no Node.

import type { CapacitySnapshot } from "./types.ts";
import { emptyGroupLoad, loadByGroup, loadLevel } from "./capacity.ts";
import type { GroupLoad, PersonLoad } from "./capacity.ts";

/** Key of the persons and rows without métier. */
export const NO_METIER = "";

/** Loads of one métier, generic demand included. */
export interface MetierLoad extends GroupLoad {
  metier: string;
  /** Generic demand of this métier (rows without a named person), j.h. */
  genericJh: number;
  genericDone: number;
  /** Part of the generic demand whose project joined a board card, j.h. */
  genericBoardJh: number;
  /** (plannedJh + genericJh) / capacityJh — null without capacity. */
  pressure: number | null;
}

/** Tension roll-up of one métier: its persons at or above the threshold, and beyond 100 %. */
export interface MetierTension {
  metier: string;
  /** Persons whose level (engagement, else board ratio) is known. */
  persons: number;
  tense: number;
  over: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratioOf(demand: number, capacity: number): number | null {
  return capacity > 0 ? round2(demand / capacity) : null;
}

function metierKey(metier: string): string {
  return metier.trim() || NO_METIER;
}

function emptyMetier(key: string): MetierLoad {
  return { ...emptyGroupLoad(key), metier: key, genericJh: 0, genericDone: 0, genericBoardJh: 0, pressure: null };
}

// Highest pressure first; unknown pressure last, then by planned + generic.
function comparePressure(a: MetierLoad, b: MetierLoad): number {
  if (a.pressure === null && b.pressure !== null) return 1;
  if (a.pressure !== null && b.pressure === null) return -1;
  if (a.pressure !== null && b.pressure !== null && a.pressure !== b.pressure) return b.pressure - a.pressure;
  return (b.plannedJh + b.genericJh) - (a.plannedJh + a.genericJh) || a.metier.localeCompare(b.metier, "fr");
}

/**
 * Loads per métier — the persons' capacity, planned load and board demand
 * (loadByGroup) plus the generic demand of the same métier — highest
 * pressure first.
 * Inputs: the snapshot (its `generic` rows, absent on older snapshots, read
 * as none). Output: one MetierLoad per métier seen on a person or a generic
 * row. Failure: none.
 */
export function loadByMetier(snapshot: CapacitySnapshot): MetierLoad[] {
  const groups = new Map<string, MetierLoad>();
  for (const group of loadByGroup(snapshot, (person) => metierKey(person.metier))) {
    groups.set(group.key, { ...group, metier: group.key, genericJh: 0, genericDone: 0, genericBoardJh: 0, pressure: null });
  }
  for (const row of snapshot.generic ?? []) {
    const key = metierKey(row.metier);
    const group = groups.get(key) ?? emptyMetier(key);
    group.genericJh = round2(group.genericJh + row.jh);
    group.genericDone = round2(group.genericDone + row.done);
    if (row.cardId !== null) group.genericBoardJh = round2(group.genericBoardJh + row.jh);
    groups.set(key, group);
  }
  const rows = [...groups.values()];
  for (const row of rows) row.pressure = ratioOf(round2(row.plannedJh + row.genericJh), row.capacityJh);
  return rows.sort(comparePressure);
}

/**
 * Which métiers are saturated: per métier, the persons whose level is
 * known, those at or above the tension threshold, those beyond 100 % —
 * only métiers with at least one tense person, most over then most tense
 * first.
 * Inputs: the person loads, the tension threshold (config). Output: the
 * roll-up rows. Failure: none.
 */
export function tensionByMetier(loads: readonly PersonLoad[], tension: number): MetierTension[] {
  const rows = new Map<string, MetierTension>();
  for (const load of loads) {
    const level = loadLevel(load);
    if (level === null) continue;
    const key = metierKey(load.person.metier);
    const row = rows.get(key) ?? { metier: key, persons: 0, tense: 0, over: 0 };
    row.persons++;
    if (level >= tension) row.tense++;
    if (level > 1) row.over++;
    rows.set(key, row);
  }
  return [...rows.values()]
    .filter((row) => row.tense > 0)
    .sort((a, b) => b.over - a.over || b.tense - a.tense || a.metier.localeCompare(b.metier, "fr"));
}
