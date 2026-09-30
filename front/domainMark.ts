// The words and choices of the domain signal (ADR 061): the static « ? »
// a card without domain, or with a domain to verify, wears on its ticket
// and in its fiche, and the domain selects that assign one by hand. Pure:
// no React, tested with node:test.

import type { BoardConfig, CardPatch } from "../core/types.ts";
import type { DomainIssue } from "../core/domain-check.ts";
import { subDomainsOf } from "../core/config.ts";

/** The label of an empty choice in the domain selects. */
export const TO_ASSIGN = "— à attribuer —";

/**
 * What the « ? » says, as tooltip and accessible label.
 * Input: the issue. Output: the French words. Failure modes: none.
 */
export function domainIssueText(issue: DomainIssue): string {
  return issue === "missing" ? "Domaine à attribuer" : "Domaine à vérifier : l’export n’en donne pas";
}

/**
 * The longer sentence of the fiche's banner.
 * Inputs: the issue, the name of the domain worn. Output: the French
 * sentence. Failure modes: none.
 */
export function domainIssueHint(issue: DomainIssue, worn: string): string {
  if (issue === "missing") return "L’export ne donne aucun domaine pour ce projet : attribuez-le à la main.";
  return `L’export ne donne aucun domaine et « ${worn} » n’a jamais été confirmé à la main (peut-être l’ancien domaine par défaut) : confirmez-le ou corrigez-le.`;
}

/**
 * The options of a domain select: the config's domains in order, preceded
 * by « — à attribuer — » while the value is empty (a card without
 * domain, or a creation with none chosen yet) — never a preselected domain.
 * Inputs: the config, the value selected. Output: {value, label}[].
 * Failure modes: none.
 */
export function domainOptions(config: BoardConfig, value: string): Array<{ value: string; label: string }> {
  const domains = config.domains.map((domain) => ({ value: domain.id, label: domain.name }));
  return value === "" ? [{ value: "", label: TO_ASSIGN }, ...domains] : domains;
}

/**
 * The patch the fiche's « Attribuer » writes (an ordinary `edited` event):
 * the domain, and the sub-domain when the chosen domain declares it (else
 * null — a sub-domain never survives its domain).
 * Inputs: the config, the domain chosen, the sub-domain chosen ("" = not
 * detailed). Output: the patch, or null while no domain is chosen (the
 * middle refuses an empty domain: one assigns, one never un-assigns).
 * Failure modes: none.
 */
export function domainAssignPatch(config: BoardConfig, domain: string, subDomain: string): CardPatch | null {
  if (!config.domains.some((entry) => entry.id === domain)) return null;
  const declared = subDomainsOf(config, domain).some((sub) => sub.id === subDomain);
  return { domain, subDomain: declared ? subDomain : null };
}
