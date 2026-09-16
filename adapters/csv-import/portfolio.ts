// The portfolio of a project (« Projet.Portefeuille » of the COUT PREV
// export — a dotted path whose last segment names the domain the way the
// PMO speaks it: « INFRASTRUCTURE OPE », « GROUPE : Forge Logiciels »,
// « ACHATS ») resolved to a board domain and sub-domain. Rules, in order:
// the domain's name / short / aliases as whole words in the LAST segment,
// a sub-domain's name (which also gives its domain and is more specific),
// then the same on the WHOLE path (fallback). Ambiguity yields null, never
// a guess. Every hit says which rule fired: the audit report spells it out
// per portfolio path (2026-09-15: sold projects found under A&D). The
// keyword rules mirror the PDSI macro's « groupeDom » (docs/
// CAPACITE-MACRO-PDSI.md) but live in the config (domains[].aliases, ADR 030).

import type { BoardConfig } from "../../core/types.ts";
import { normalizeLabel } from "./normalize.ts";
import { keywordPattern } from "./domains.ts";

/** A resolved portfolio: the domain, its sub-domain when named, how. */
export interface PortfolioHit {
  domainId: string;
  subDomainId: string | null;
  via: "domain" | "subdomain";
  /** Which part matched: the path's last segment, the whole path (fallback), or a bracketed marker in the NAME (ADR 036). */
  scope: "last" | "path" | "name";
  /** The config label that matched (domain name / short / alias, or a sub-domain name). */
  label: string;
}

interface Rule {
  re: RegExp;
  domainId: string;
  subDomainId: string | null;
  via: "domain" | "subdomain";
  label: string;
}

// A sub-domain hit is more specific than a domain hit; several distinct
// domains in play = ambiguous.
function matchIn(rules: readonly Rule[], key: string, scope: "last" | "path"): PortfolioHit | null {
  if (key === "") return null;
  const hits = rules.filter((rule) => rule.re.test(key));
  const subs = hits.filter((hit) => hit.via === "subdomain");
  const pool = subs.length > 0 ? subs : hits;
  const domains = new Set(pool.map((hit) => hit.domainId));
  const first = pool[0];
  if (domains.size !== 1 || first === undefined) return null;
  const subDomainId = subs.length === 1 ? (subs[0]?.subDomainId ?? null) : null;
  return { domainId: first.domainId, subDomainId, via: first.via, scope, label: first.label };
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
      rules.push({ re: keywordPattern(label), domainId: domain.id, subDomainId: null, via: "domain", label });
    }
    for (const sub of domain.subDomains ?? []) {
      rules.push({ re: keywordPattern(sub.name), domainId: domain.id, subDomainId: sub.id, via: "subdomain", label: sub.name });
    }
  }
  return (portfolio) => {
    const segments = portfolio.split(".").map((s) => normalizeLabel(s)).filter((s) => s !== "");
    const last = segments[segments.length - 1] ?? "";
    return matchIn(rules, last, "last") ?? matchIn(rules, normalizeLabel(portfolio), "path");
  };
}

/**
 * Compiles the config's bracketed name markers (domains[].nameMarkers,
 * ADR 036) and resolves a project NAME: a marker found as whole words
 * inside « [ … ] » forces its domain, before the portfolio is even read —
 * the portfolio of a sold project is not trustworthy. Two domains marked
 * = ambiguous = null; no bracket, no marker = null.
 * Inputs: the board config. Output: name -> hit (scope "name") or null.
 * Failure modes: none.
 */
export function createNameMarkerResolver(config: BoardConfig): (name: string) => PortfolioHit | null {
  const rules = config.domains.flatMap((domain) =>
    (domain.nameMarkers ?? []).map((marker) => ({ re: keywordPattern(marker), domainId: domain.id, label: marker })));
  return (name) => {
    if (rules.length === 0) return null;
    const insides = [...name.matchAll(/\[([^\]]*)\]/g)].map((m) => normalizeLabel(m[1] ?? ""));
    const hits = rules.filter((rule) => insides.some((inside) => rule.re.test(inside)));
    const first = hits[0];
    if (first === undefined || new Set(hits.map((hit) => hit.domainId)).size !== 1) return null;
    return { domainId: first.domainId, subDomainId: null, via: "domain", scope: "name", label: first.label };
  };
}

/**
 * How a hit was obtained, worded for the report and the conflict panel
 * (« dernier segment · « INFRASTRUCTURE » », « chemin entier (repli) · « GROUPE » »,
 * « marqueur « [business] » dans le nom »).
 * Input: the hit. Output: the wording. Failure modes: none.
 */
export function ruleLabel(hit: PortfolioHit): string {
  if (hit.scope === "name") return `marqueur « [${hit.label.toLowerCase()}] » dans le nom`;
  return `${hit.scope === "last" ? "dernier segment" : "chemin entier (repli)"} · « ${hit.label} »`;
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
