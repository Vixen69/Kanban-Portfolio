// No default domain, ever (ADR 061, author 2026-09-30: « un nouveau projet
// où le portefeuille n'a aucun domaine, ça ne devrait pas aller à A&D par
// défaut… il faut que ce soit manuellement assignable, et tu me le signales
// avec un truc sur la carte »). A card may carry NO domain (domain "") —
// an imported project the export resolves none for — or a domain « à
// vérifier » (domainUnresolved: the export gives none and no human ever
// set it, so it may be the old first-domain fallback). Both are signalled
// on the card and in the fiche until a human assigns a domain. Pure.

import type { BoardConfig, Card } from "./types.ts";

/** The words of an empty domain wherever domains are listed or named. */
export const NO_DOMAIN_NAME = "Sans domaine";

/**
 * The domain problem a card carries:
 * - « missing »: no domain at all — « Domaine à attribuer »;
 * - « unresolved »: a domain the export does not confirm and no human set — « Domaine à vérifier ».
 */
export type DomainIssue = "missing" | "unresolved";

/**
 * The domain problem of one card, if any.
 * Input: the card (its domain and the flag a load writes). Output: the issue,
 * null when the domain is sound. Failure modes: none — a card stored
 * before ADR 061 carries no flag and reads as sound unless its domain is "".
 */
export function domainIssue(card: Pick<Card, "domain" | "domainUnresolved">): DomainIssue | null {
  if (card.domain === "") return "missing";
  return card.domainUnresolved === true ? "unresolved" : null;
}

/**
 * The display name of a domain id: « Sans domaine » for "", the config's
 * name, else the raw id (a domain the config no longer declares stays
 * readable, never swapped for another one).
 * Inputs: the config, the domain id. Output: the name. Failure modes: none.
 */
export function domainName(config: BoardConfig, id: string): string {
  if (id === "") return NO_DOMAIN_NAME;
  return config.domains.find((domain) => domain.id === id)?.name ?? id;
}
