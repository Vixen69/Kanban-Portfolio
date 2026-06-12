// Presentation-only mapping of config vocabularies (domains, types,
// natures, criticalities) to colors and short labels. How they look is a
// hard-coded product opinion, so the palettes live in code, not in config.

import type { BoardConfig, Criticality, ProjectType } from "../core/types.ts";

// Hue-diverse, readable at 14px, distinguishable for color-blind users.
const PALETTE = [
  "#10b981", "#6366f1", "#f59e0b", "#8b5cf6", "#ef4444",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316",
];

// Type-tag fills (the design's saturated, white-text pills).
const TYPE_PALETTE = ["#0369a1", "#15803d", "#0d9488", "#b45309", "#4338ca", "#7c3aed"];

// Nature accents by distinct-nature index (Compliqué, Clair, Complexe in
// the default config's lane order).
const NATURE_PALETTE = ["#2563eb", "#0d9488", "#c2410c"];

/** Display labels of the fixed criticality vocabulary. */
export const CRITICALITY_LABELS: Record<Criticality, string> = {
  top: "Top",
  major: "Major",
  normal: "Normal",
};

/**
 * The project type for an id, or null (untyped card / unknown id).
 * Inputs: the board config, a type id or null. Output: the ProjectType.
 * Failure: none.
 */
export function typeById(config: BoardConfig, typeId: string | null): ProjectType | null {
  if (typeId === null) return null;
  return config.types.find((type) => type.id === typeId) ?? null;
}

/**
 * Stable fill color for a project type (index in the config list).
 * Inputs: the board config, a type id. Output: a hex color.
 * Failure: none — unknown ids get the first palette color.
 */
export function typeColor(config: BoardConfig, typeId: string): string {
  const index = config.types.findIndex((type) => type.id === typeId);
  return TYPE_PALETTE[(index < 0 ? 0 : index) % TYPE_PALETTE.length] as string;
}

/**
 * Stable accent color for a lane nature, by distinct-nature order.
 * Inputs: the ordered distinct natures, one nature. Output: a hex color.
 * Failure: none — unknown natures get the first palette color.
 */
export function natureColor(natures: string[], nature: string): string {
  const index = natures.indexOf(nature);
  return NATURE_PALETTE[(index < 0 ? 0 : index) % NATURE_PALETTE.length] as string;
}

/**
 * Stable color for a domain: its index in the config list, cycling the
 * palette when there are more domains than colors.
 * Inputs: the board config, a domain string.
 * Output: a hex color; unknown domains get the first palette color.
 * Failure: none.
 */
export function domainColor(config: BoardConfig, domain: string): string {
  const index = config.domains.indexOf(domain);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length] as string;
}

/**
 * Compact label for a domain: initials joined by "&" when the name has
 * several words around an ampersand ("Archi & Dev" -> "A&D"), otherwise
 * the first three letters uppercased ("Ingenierie" -> "ING").
 * Input: the domain display string. Output: the short label.
 * Failure: none.
 */
export function domainShort(domain: string): string {
  if (domain.includes("&")) {
    return domain
      .split("&")
      .map((part) => part.trim().charAt(0).toUpperCase())
      .join("&");
  }
  return domain.slice(0, 3).toUpperCase();
}
