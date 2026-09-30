// The vocabulary the importer matches export labels with (ADR 056, after
// ADR 046): the VERSIONED model's (config/board.json) — never the display
// names ⚙ › Catégories can rename. A type or a domain renamed there kept
// matching only through its new name, so a cosmetic rename emptied the
// perimeter of every project whose export label was the old name (E7 of
// the 2026-09-30 audit: two projects « absentes » from identical files).
// The import config is the runtime config (ids, colours, display names,
// exercise) whose types and domains carry the versioned names and shorts,
// aliases, sub-domain names and name markers; a renamed name or short is
// consulted only when the versioned vocabulary resolves nothing, and the
// hit says so. Pure.

import type { BoardConfig, Domain, ProjectType, SubDomain } from "../../core/types.ts";
import { normalizeLabel } from "./normalize.ts";

/** The labels a type or a domain is matched on, beside its id and aliases. */
export interface ImportLabels {
  /** The versioned model's name and short — always matched. */
  versioned: readonly string[];
  /** The runtime name and short the ⚙ pane gave it, when they differ — matched only when nothing else resolved. */
  renamed: readonly string[];
}

/** A type or a domain of the import config: its matching labels ride along. */
export interface Labelled {
  importLabels?: ImportLabels;
}

/**
 * The labels an entry is matched on: those importConfig attached, else
 * (a plain config — tests, fixtures) its own name and short.
 * Input: a type or a domain. Output: the labels. Failure modes: none.
 */
export function matchLabels(entry: { name: string; short: string } & Labelled): ImportLabels {
  return entry.importLabels ?? { versioned: [entry.name, entry.short], renamed: [] };
}

function labelsOf(runtime: { name: string; short: string }, versioned: { name: string; short: string }): ImportLabels {
  const known = new Set([versioned.name, versioned.short].map(normalizeLabel));
  return {
    versioned: [versioned.name, versioned.short],
    renamed: [runtime.name, runtime.short].filter((label) => !known.has(normalizeLabel(label))),
  };
}

function mergeType(runtime: ProjectType, versioned: ProjectType | undefined): ProjectType & Labelled {
  if (versioned === undefined) return runtime;
  const { aliases: _runtimeAliases, ...rest } = runtime;
  return {
    ...rest, importLabels: labelsOf(runtime, versioned),
    ...(versioned.aliases === undefined ? {} : { aliases: versioned.aliases }),
  };
}

// Sub-domains keep the runtime's ids (the board's cards reference them);
// their names come from the versioned model.
function mergeSubDomains(runtime: readonly SubDomain[], versioned: readonly SubDomain[] | undefined): SubDomain[] {
  return runtime.map((s) => ({ id: s.id, name: versioned?.find((v) => v.id === s.id)?.name ?? s.name }));
}

function mergeDomain(runtime: Domain, versioned: Domain | undefined): Domain & Labelled {
  if (versioned === undefined) return runtime;
  const { aliases: _a, nameMarkers: _m, subDomains, ...rest } = runtime;
  return {
    ...rest, importLabels: labelsOf(runtime, versioned),
    ...(versioned.aliases === undefined ? {} : { aliases: versioned.aliases }),
    ...(versioned.nameMarkers === undefined ? {} : { nameMarkers: versioned.nameMarkers }),
    ...(subDomains === undefined ? {} : { subDomains: mergeSubDomains(subDomains, versioned.subDomains) }),
  };
}

/**
 * The config the importer runs with: the runtime config (ids, display
 * names, colours, exercise, states — what the board serves) whose types
 * and domains match on the versioned model's vocabulary (names, shorts,
 * aliases, sub-domain names, name markers), the runtime names kept as a
 * last resort. An id the versioned model lacks keeps its runtime
 * vocabulary.
 * Inputs: the runtime config (override applied), the versioned model
 * (config/board.json as validated at startup).
 * Output: the import config. Failure modes: none.
 */
export function importConfig(runtime: BoardConfig, versioned: BoardConfig): BoardConfig {
  return {
    ...runtime,
    types: runtime.types.map((t) => mergeType(t, versioned.types.find((v) => v.id === t.id))),
    domains: runtime.domains.map((d) => mergeDomain(d, versioned.domains.find((v) => v.id === d.id))),
  };
}
