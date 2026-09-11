// The natures of lines and of resources of the plan de charge (ADR 029,
// author 2026-09-10). « Id Projet » names the line: a project assignment,
// the resource's « Disponible ressource (en jour) » line (its capacity) or
// its « Planifiée projet (en jour) » line (the export's own total of its
// assignments). « Ressource » names the resource: a person with a
// matricule, else a generic assignment, a « zz… » code or a « PE22… »
// generic role — counted, kept on the project, never a person. Since the
// author's call of the same evening, the plan de charge is the ONLY source
// of the persons: organisation, métier and internal/external come from
// its rows too (Ress.Profils is a fallback for the domain at most).

import { normalizeLabel } from "./normalize.ts";
import { stripCode } from "./code-prefix.ts";

/** One nominative resource of the plan de charge. */
export interface PdcPerson {
  matricule: string;
  /** Display name: the « Ressource » cell without its trailing matricule. */
  name: string;
  /** « Organisation » path as exported (first seen), "" when absent. */
  organisation: string;
  /** « Métier » label as exported (first seen), "" when absent. */
  metier: string;
  /** DSI profile resolved from the métier, null when unknown. */
  profileId: string | null;
  /** True when the métier or the organisation says « Externe ». */
  external: boolean;
  /** Sum of the project rows, j.h. */
  jh: number;
  done: number;
  /** The « Planifiée projet » line — the export's own total; null when absent. */
  plannedJh: number | null;
  plannedDone: number | null;
  /** The « Disponible ressource » line — the capacity; null when absent. */
  capacityJh: number | null;
  capacityDone: number | null;
}

/** Rows set aside because their resource is not a named person. */
export interface PdcExcluded {
  generic: number;
  zz: number;
  roles: number;
  /** Exercise-year load of every excluded project row, j.h. */
  jh: number;
  done: number;
}

/** A non-nominative project row, aggregated by (project, métier, organisation): demand nobody carries yet (ADR 033). */
export interface PdcGeneric {
  projectKey: string;
  metier: string;
  organisation: string;
  jh: number;
  done: number;
}

/** How the file was read — the report's self-diagnosis of the reader. */
export interface PdcReading {
  /** Non-empty data rows. */
  rows: number;
  projectRows: number;
  capacityLines: number;
  plannedLines: number;
  /** Rows whose matricule came from the trailing token of « Ressource ». */
  matriculeFromResource: number;
  /** Rows without any matricule (« Matricule » empty, none in « Ressource »). */
  emptyMatricule: number;
}

export type ResourceKind = "nominative" | "generic" | "zz" | "role";
export type LineKind = "project" | "capacity" | "planned";

/** What a row says about its resource, beyond the matricule. */
export interface ResourceFacts {
  organisation: string;
  metier: string;
  profileId: string | null;
}

/**
 * Names the line from its « Id Projet » cell.
 * Input: the raw cell. Output: capacity, planned or project. Failure: none.
 */
export function lineKind(idCell: string): LineKind {
  const key = normalizeLabel(idCell);
  if (key.startsWith("disponible ressource")) return "capacity";
  if (key.startsWith("planifiee projet")) return "planned";
  return "project";
}

/** A matricule-looking token: 5 to 10 letters/digits with at least three digits (« 00P4583 », « 9105322 »). */
const MATRICULE_TOKEN = /^(?=(?:.*\d){3})[0-9A-Z]{5,10}$/i;

/**
 * The matricule of a row: the « Matricule » cell, else the trailing token
 * of the « Ressource » cell when it looks like one (« MEFTAHI, Larbi
 * 00P4583 ») — some exports carry the matricule only there.
 * Inputs: both raw cells. Output: the matricule ("" when none) and whether
 * it was read from « Ressource ». Failure: none.
 */
export function matriculeOf(matriculeCell: string, resource: string): { matricule: string; fromResource: boolean } {
  const direct = matriculeCell.trim();
  if (direct !== "") return { matricule: direct, fromResource: false };
  const tokens = resource.trim().split(/\s+/);
  const last = tokens[tokens.length - 1] ?? "";
  if (tokens.length >= 2 && MATRICULE_TOKEN.test(last)) return { matricule: last, fromResource: true };
  return { matricule: "", fromResource: false };
}

/**
 * Names a resource label alone: a generic assignment, a « zz… » code, a
 * « PE22… » role — or null when the label could be a person's name.
 * Input: the raw label. Output: the generic kind or null. Failure: none.
 */
export function genericKind(label: string): Exclude<ResourceKind, "nominative"> | null {
  const key = normalizeLabel(label);
  if (key.startsWith("zz")) return "zz";
  if (/^pe22/.test(key)) return "role";
  if (key.includes("generique")) return "generic";
  return null;
}

/**
 * Names the resource from its « Ressource » cell and matricule.
 * Inputs: the raw resource label, the matricule (may be empty).
 * Output: nominative, generic, zz or role. Failure: none.
 */
export function resourceKind(resource: string, matricule: string): ResourceKind {
  return genericKind(resource) ?? (matricule === "" ? "generic" : "nominative");
}

/** The French label of an excluded resource kind, for the report. */
export function excludedLabel(kind: ResourceKind): string {
  if (kind === "zz") return "ressource « zz… » (code à ne pas utiliser)";
  if (kind === "role") return "rôle générique « PE22… »";
  return "affectation générique (sans personne nommée)";
}

/** « Externe » in the métier prefix (« Externe.Concept.Dév. ») or the organisation. */
function isExternal(facts: ResourceFacts): boolean {
  return normalizeLabel(facts.metier).startsWith("externe") || normalizeLabel(facts.organisation).includes("externe");
}

/**
 * The person behind a matricule, created once from the first row seen;
 * later rows fill what was still empty (organisation, métier, profile).
 * Inputs: the registry, the matricule, the raw « Ressource » cell, the
 * row's facts. Output: the PdcPerson (mutable). Failure: none.
 */
export function personFor(persons: Map<string, PdcPerson>, matricule: string, resource: string, facts: ResourceFacts): PdcPerson {
  const existing = persons.get(matricule);
  if (existing !== undefined) {
    if (existing.organisation === "") existing.organisation = facts.organisation;
    if (existing.metier === "") existing.metier = facts.metier;
    if (existing.profileId === null) existing.profileId = facts.profileId;
    if (!existing.external) existing.external = isExternal(facts);
    return existing;
  }
  const person: PdcPerson = {
    matricule, name: stripCode(resource, matricule),
    organisation: facts.organisation, metier: facts.metier, profileId: facts.profileId, external: isExternal(facts),
    jh: 0, done: 0, plannedJh: null, plannedDone: null, capacityJh: null, capacityDone: null,
  };
  persons.set(matricule, person);
  return person;
}

/**
 * Records the resource's own line: its capacity or its planned total.
 * Inputs: the person, the line kind, the exercise-year pair.
 * Output: none (person mutated). Failure: none.
 */
export function setPersonLine(person: PdcPerson, line: LineKind, jh: number, done: number): void {
  if (line === "capacity") {
    person.capacityJh = jh;
    person.capacityDone = done;
  } else {
    person.plannedJh = jh;
    person.plannedDone = done;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Records a non-nominative project row: the project keeps the load, the
 * kind is counted, and the row joins the generic demand of its (project,
 * métier, organisation) — the « à pourvoir » of the capacity view (ADR 033).
 * Inputs: the excluded counters, the generic registry, the project (its
 * key and generic sums, mutated), the resource kind, the row's facts, the
 * exercise-year pair. Output: none. Failure: none.
 */
export function recordExcluded(
  excluded: PdcExcluded, generic: Map<string, PdcGeneric>, project: { key: string; genericJh: number; genericDone: number },
  kind: ResourceKind, facts: ResourceFacts, jh: number, done: number,
): void {
  project.genericJh = round2(project.genericJh + jh);
  project.genericDone = round2(project.genericDone + done);
  excluded.jh = round2(excluded.jh + jh);
  excluded.done = round2(excluded.done + done);
  if (kind === "zz") excluded.zz++;
  else if (kind === "role") excluded.roles++;
  else excluded.generic++;
  const key = `${project.key}|${normalizeLabel(facts.metier)}|${normalizeLabel(facts.organisation)}`;
  const row = generic.get(key) ?? { projectKey: project.key, metier: facts.metier, organisation: facts.organisation, jh: 0, done: 0 };
  row.jh = round2(row.jh + jh);
  row.done = round2(row.done + done);
  generic.set(key, row);
}

/**
 * Counts one row for the reader's self-diagnosis: its line nature, and
 * where its matricule came from.
 * Inputs: the counters (mutated), the line kind, the matricule ("" when
 * none), whether it was read from « Ressource ». Output: none. Failure: none.
 */
export function countReading(reading: PdcReading, line: LineKind, matricule: string, fromResource: boolean): void {
  reading.rows++;
  if (line === "project") reading.projectRows++;
  else if (line === "capacity") reading.capacityLines++;
  else reading.plannedLines++;
  if (fromResource) reading.matriculeFromResource++;
  if (matricule === "") reading.emptyMatricule++;
}
