// The portfolio of a project (« Projet.Portefeuille » of the COUT PREV
// export — a dotted path whose last segment names the domain the way the
// PMO speaks it: « INFRASTRUCTURE OPE », « GROUPE : Forge Logiciels »,
// « ACHATS ») resolved to a board domain and sub-domain. Rules, in order:
// the domain's name / short / aliases as whole words in the last segment,
// a sub-domain's name (which also gives its domain and is more specific),
// then the same on the whole path. Ambiguity yields null, never a guess.
// The keyword rules mirror the PDSI macro's « groupeDom » (docs/
// CAPACITE-MACRO-PDSI.md) but live in the config (domains[].aliases, ADR 030).

import type { BoardConfig } from "../../core/types.ts";
import { normalizeLabel } from "./normalize.ts";
import { keywordPattern } from "./domains.ts";

/** A resolved portfolio: the domain, its sub-domain when named, how. */
export interface PortfolioHit {
  domainId: string;
  subDomainId: string | null;
  via: "domain" | "subdomain";
}

interface Rule {
  re: RegExp;
  domainId: string;
  subDomainId: string | null;
  via: "domain" | "subdomain";
}

// A sub-domain hit is more specific than a domain hit; several distinct
// domains in play = ambiguous.
function matchIn(rules: readonly Rule[], key: string): PortfolioHit | null {
  if (key === "") return null;
  const hits = rules.filter((rule) => rule.re.test(key));
  const subs = hits.filter((hit) => hit.via === "subdomain");
  const pool = subs.length > 0 ? subs : hits;
  const domains = new Set(pool.map((hit) => hit.domainId));
  const first = pool[0];
  if (domains.size !== 1 || first === undefined) return null;
  const subDomainId = subs.length === 1 ? (subs[0]?.subDomainId ?? null) : null;
  return { domainId: first.domainId, subDomainId, via: first.via };
}

/**
 * Compiles the config's domain vocabulary (name, short, aliases) and
 * sub-domain names into whole-word rules, then resolves portfolios.
 * Inputs: the board config. Output: a resolver — portfolio path -> hit or
 * null (unknown or ambiguous). Failure modes: none.
 */
export function createPortfolioResolver(config: BoardConfig): (portfolio: string) => PortfolioHit | null {
  const rules: Rule[] = [];
  for (const domain of config.domains) {
    for (const label of [domain.name, domain.short, ...(domain.aliases ?? [])]) {
      rules.push({ re: keywordPattern(label), domainId: domain.id, subDomainId: null, via: "domain" });
    }
    for (const sub of domain.subDomains ?? []) {
      rules.push({ re: keywordPattern(sub.name), domainId: domain.id, subDomainId: sub.id, via: "subdomain" });
    }
  }
  return (portfolio) => {
    const segments = portfolio.split(".").map((s) => normalizeLabel(s)).filter((s) => s !== "");
    const last = segments[segments.length - 1] ?? "";
    return matchIn(rules, last) ?? matchIn(rules, normalizeLabel(portfolio));
  };
}

/**
 * The last segment of a dotted portfolio path — the domain label the PMO
 * reads (« DSI NEXTER.INFRASTRUCTURE OPE » -> « INFRASTRUCTURE OPE »).
 * Input: the raw path. Output: the trimmed last segment, "" when empty.
 * Failure modes: none.
 */
export function lastSegment(portfolio: string): string {
  const segments = portfolio.split(".").map((s) => s.trim()).filter((s) => s !== "");
  return segments[segments.length - 1] ?? "";
}
