// The natures of lines and of resources of the plan de charge (ADR 029,
// author 2026-09-10). « Id Projet » names the line: a project assignment,
// the resource's « Disponible ressource (en jour) » line (its capacity) or
// its « Planifiée projet (en jour) » line (the export's own total of its
// assignments). « Ressource » names the resource: a person with a
// matricule, else a generic assignment, a « zz… » code or a « PE22… »
// generic role — counted, kept on the project, never a person.

import { normalizeLabel } from "./normalize.ts";

/** One nominative resource of the plan de charge. */
export interface PdcPerson {
  matricule: string;
  name: string;
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

export type ResourceKind = "nominative" | "generic" | "zz" | "role";
export type LineKind = "project" | "capacity" | "planned";

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

/**
 * Names the resource from its « Ressource » cell and matricule.
 * Inputs: the raw resource label, the matricule (may be empty).
 * Output: nominative, generic, zz or role. Failure: none.
 */
export function resourceKind(resource: string, matricule: string): ResourceKind {
  const key = normalizeLabel(resource);
  if (key.startsWith("zz")) return "zz";
  if (/^pe22/.test(key)) return "role";
  if (key.includes("generique") || matricule === "") return "generic";
  return "nominative";
}

/** The French label of an excluded resource kind, for the report. */
export function excludedLabel(kind: ResourceKind): string {
  if (kind === "zz") return "ressource « zz… » (code à ne pas utiliser)";
  if (kind === "role") return "rôle générique « PE22… »";
  return "affectation générique (sans personne nommée)";
}

/**
 * The person behind a matricule, created once.
 * Inputs: the registry, the matricule, the display name. Output: the
 * PdcPerson (mutable). Failure: none.
 */
export function personFor(persons: Map<string, PdcPerson>, matricule: string, name: string): PdcPerson {
  const existing = persons.get(matricule);
  if (existing !== undefined) return existing;
  const person: PdcPerson = {
    matricule, name, jh: 0, done: 0, plannedJh: null, plannedDone: null, capacityJh: null, capacityDone: null,
  };
  persons.set(matricule, person);
  return person;
}

/**
 * Records the resource's own line: its capacity or its planned total.
 * Inputs: the registry, the matricule and name, the line kind, the
 * exercise-year pair. Output: none (registry mutated). Failure: none.
 */
export function setPersonLine(
  persons: Map<string, PdcPerson>, matricule: string, name: string, line: LineKind, jh: number, done: number,
): void {
  const person = personFor(persons, matricule, name);
  if (line === "capacity") {
    person.capacityJh = jh;
    person.capacityDone = done;
  } else {
    person.plannedJh = jh;
    person.plannedDone = done;
  }
}
