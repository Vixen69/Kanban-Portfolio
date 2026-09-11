// The « types de ressource » reading (ADR 033, author 2026-09-11): the
// plan de charge's « Métier » is the unit the PDSI macro reasons on — a
// person's métier, and the métier of the generic rows nobody carries. Per
// métier: the persons' declared capacity (their « Disponible » lines) and
// planned load, the board's demand, the generic demand « à pourvoir », the
// pressure = (planned + generic) / capacity — and, since ADR 034, the
// COUT PREV « Charge » days of the same cost centre: the second reading of
// the same demand, cross-checked. Also the tension roll-up of the loaded
// persons per métier. Pure; no React, no Node.

import type { CapacitySnapshot } from "./types.ts";
import { emptyGroupLoad, loadByGroup, loadLevel } from "./capacity.ts";
import type { GroupLoad, PersonLoad } from "./capacity.ts";

/** Key of the persons and rows without métier. */
export const NO_METIER = "";

/** Loads of one métier, generic demand and COUT PREV demand included. */
export interface MetierLoad extends GroupLoad {
  /** Display label: the unprefixed spelling when one was seen, else the first seen. */
  metier: string;
  /** Generic demand of this métier (rows without a named person), j.h. */
  genericJh: number;
  genericDone: number;
  /** Part of the generic demand whose project joined a board card, j.h. */
  genericBoardJh: number;
  /** COUT PREV « Charge » days of this cost centre on the cards (ADR 034), j.h. */
  coutsJh: number;
  coutsDone: number;
  /** (plannedJh + genericJh) / capacityJh — null without capacity. */
  pressure: number | null;
  /** coutsJh / capacityJh — the COUT PREV reading of the pressure; null without capacity. */
  coutsPressure: number | null;
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

function normalize(label: string): string {
  return label.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");
}

/**
 * The key a métier or cost centre label groups under. Métiers and cost
 * centres share a vocabulary, not always a spelling nor a prefix (author,
 * 2026-09-12): « NEXTER.CdP IT4IT » (COUT PREV) and « CdP IT4IT » (PdC)
 * are one type of resource, « Externe.Concept.Dév. » and « Concept.Dév. »
 * too. The key folds case, accents and spacing, then drops a leading
 * dotted segment whenever the remainder is itself a known label — data-
 * driven, so « Concept.Dév. ERP » (no known remainder) stays whole.
 * Inputs: the normalized labels known in the snapshot, the raw label.
 * Output: the key ("" for no métier). Failure: none.
 */
export function metierKey(known: ReadonlySet<string>, label: string): string {
  let key = normalize(label);
  let dot = key.indexOf(".");
  while (dot > 0) {
    const rest = key.slice(dot + 1).trim();
    if (!known.has(rest)) break;
    key = rest;
    dot = key.indexOf(".");
  }
  return key || NO_METIER;
}

// Every label the snapshot carries, normalized: the merge candidates.
function knownLabels(snapshot: CapacitySnapshot): Set<string> {
  const known = new Set<string>();
  for (const person of snapshot.persons) known.add(normalize(person.metier));
  for (const row of snapshot.generic ?? []) known.add(normalize(row.metier));
  for (const row of snapshot.coutsDemand ?? []) known.add(normalize(row.centre));
  known.delete("");
  return known;
}

// The display label of a key: the unprefixed spelling wins over a prefixed one.
function remember(labels: Map<string, string>, key: string, label: string): void {
  const clean = label.trim();
  if (normalize(clean) === key || !labels.has(key)) labels.set(key, clean);
}

function emptyMetier(key: string): MetierLoad {
  return {
    ...emptyGroupLoad(key), metier: "", genericJh: 0, genericDone: 0, genericBoardJh: 0,
    coutsJh: 0, coutsDone: 0, pressure: null, coutsPressure: null,
  };
}

// Highest pressure first; unknown pressure last, then by every demand summed.
function comparePressure(a: MetierLoad, b: MetierLoad): number {
  if (a.pressure === null && b.pressure !== null) return 1;
  if (a.pressure !== null && b.pressure === null) return -1;
  if (a.pressure !== null && b.pressure !== null && a.pressure !== b.pressure) return b.pressure - a.pressure;
  const weight = (row: MetierLoad): number => row.plannedJh + row.genericJh + row.coutsJh;
  return weight(b) - weight(a) || a.metier.localeCompare(b.metier, "fr");
}

/**
 * Loads per métier — the persons' capacity, planned load and board demand
 * (loadByGroup), the generic demand of the same métier, and the COUT PREV
 * demand of the same cost centre (prefixes merged, see metierKey) —
 * highest pressure first.
 * Inputs: the snapshot (`generic` and `coutsDemand` absent on older
 * snapshots, read as none). Output: one MetierLoad per key. Failure: none.
 */
export function loadByMetier(snapshot: CapacitySnapshot): MetierLoad[] {
  const known = knownLabels(snapshot);
  const keyOf = (label: string): string => metierKey(known, label);
  const labels = new Map<string, string>();
  const groups = new Map<string, MetierLoad>();
  const groupFor = (label: string): MetierLoad => {
    const key = keyOf(label);
    remember(labels, key, label);
    const group = groups.get(key) ?? emptyMetier(key);
    groups.set(key, group);
    return group;
  };
  for (const person of snapshot.persons) remember(labels, keyOf(person.metier), person.metier);
  for (const group of loadByGroup(snapshot, (person) => keyOf(person.metier))) {
    groups.set(group.key, { ...emptyMetier(group.key), ...group });
  }
  for (const row of snapshot.generic ?? []) {
    const group = groupFor(row.metier);
    group.genericJh = round2(group.genericJh + row.jh);
    group.genericDone = round2(group.genericDone + row.done);
    if (row.cardId !== null) group.genericBoardJh = round2(group.genericBoardJh + row.jh);
  }
  for (const row of snapshot.coutsDemand ?? []) {
    const group = groupFor(row.centre);
    group.coutsJh = round2(group.coutsJh + row.jh);
    group.coutsDone = round2(group.coutsDone + row.done);
  }
  const rows = [...groups.values()];
  for (const row of rows) {
    row.metier = labels.get(row.key) ?? "";
    row.pressure = ratioOf(round2(row.plannedJh + row.genericJh), row.capacityJh);
    row.coutsPressure = ratioOf(row.coutsJh, row.capacityJh);
  }
  return rows.sort(comparePressure);
}

/**
 * Which métiers are saturated: per métier (prefixes merged), the persons
 * whose level is known, those at or above the tension threshold, those
 * beyond 100 % — only métiers with at least one tense person, most over
 * then most tense first.
 * Inputs: the person loads, the tension threshold (config). Output: the
 * roll-up rows. Failure: none.
 */
export function tensionByMetier(loads: readonly PersonLoad[], tension: number): MetierTension[] {
  const known = new Set(loads.map((load) => normalize(load.person.metier)).filter((key) => key !== ""));
  const rows = new Map<string, MetierTension>();
  for (const load of loads) {
    const level = loadLevel(load);
    if (level === null) continue;
    const key = metierKey(known, load.person.metier);
    const row = rows.get(key) ?? { metier: load.person.metier.trim(), persons: 0, tense: 0, over: 0 };
    if (normalize(load.person.metier) === key) row.metier = load.person.metier.trim();
    row.persons++;
    if (level >= tension) row.tense++;
    if (level > 1) row.over++;
    rows.set(key, row);
  }
  return [...rows.values()]
    .filter((row) => row.tense > 0)
    .sort((a, b) => b.over - a.over || b.tense - a.tense || a.metier.localeCompare(b.metier, "fr"));
}
