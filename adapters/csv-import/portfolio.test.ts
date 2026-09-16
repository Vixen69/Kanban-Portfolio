// Portfolio -> domain resolution (ADR 030): the last segment first, whole
// words only, sub-domain more specific than domain, ambiguity = null.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { createNameMarkerResolver, createPortfolioResolver, lastSegment, ruleLabel } from "./portfolio.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../../config/board.json", import.meta.url), "utf8"),
) as BoardConfig;

test("portfolios resolve through the domain aliases and the sub-domain names of the config", () => {
  const resolve = createPortfolioResolver(CONFIG);
  const cases: Array<[string, [string, string | null] | null]> = [
    ["DSI NEXTER.INFRASTRUCTURE OPE", ["infra", null]],
    ["DSI NEXTER.INFRASTRUCTURE SSI", ["infra", null]],
    ["DSI NEXTER.GROUPE : Forge Logiciels", ["ad", "forge_logiciels"]],
    ["DSI NEXTER.GROUPE : Développements rapides", ["ad", "developpements_rapides"]],
    ["DSI NEXTER.CORPORATE.ACHATS", ["corporate", "achats"]],
    ["DSI NEXTER.MANAGEMENT & PROGRAMME", ["corporate", "management_programme"]],
    ["DSI NEXTER.PROGRAMME ERP", ["erp", null]],
    ["DSI NEXTER.PROGRAMME PLM", ["plm", null]],
    ["DSI NEXTER.INGENIERIE SYSTEMES", ["ing", null]],
    ["DSI NEXTER.PRODUCTION MUNITIONS", ["industrie", null]],
    ["DSI NEXTER.ING & PLM", null],
    ["DSI NEXTER.PROJETS VENDUS", null],
    ["", null],
  ];
  for (const [portfolio, expected] of cases) {
    const hit = resolve(portfolio);
    assert.deepEqual(hit === null ? null : [hit.domainId, hit.subDomainId], expected, portfolio);
  }
});

test("lastSegment reads the domain label the PMO reads", () => {
  assert.equal(lastSegment("DSI NEXTER.INFRASTRUCTURE OPE"), "INFRASTRUCTURE OPE");
  assert.equal(lastSegment(" ACHATS "), "ACHATS");
  assert.equal(lastSegment(""), "");
});

test("a hit says which rule fired: the last segment, or the whole path as a fallback", () => {
  const resolve = createPortfolioResolver(CONFIG);
  assert.deepEqual(resolve("DSI NEXTER.INFRASTRUCTURE OPE"),
    { domainId: "infra", subDomainId: null, via: "domain", scope: "last", label: "INFRASTRUCTURE" });
  assert.deepEqual(resolve("DSI NEXTER.GROUPE : Forge Logiciels.PROJETS VENDUS"),
    { domainId: "ad", subDomainId: "forge_logiciels", via: "subdomain", scope: "path", label: "FORGE LOGICIELS" },
    "a sold-projects leaf under a GROUPE branch falls back on the whole path - and lands in A&D");
});

test("ADR 036: a bracketed name marker forces its domain; free text, unknown brackets and two marked domains do not", () => {
  const vendus = { id: "vendus", name: "PROJETS VENDUS", short: "VENDU", color: "#000", nameMarkers: ["BUSINESS"] };
  const resolve = createNameMarkerResolver({ ...CONFIG, domains: [...CONFIG.domains, vendus] });
  assert.deepEqual(resolve("PE123 Refonte portail [Business]"),
    { domainId: "vendus", subDomainId: null, via: "domain", scope: "name", label: "BUSINESS" });
  assert.equal(resolve("PE123 [BUSINESS-2026] Portail client")?.domainId, "vendus", "whole word inside the brackets");
  assert.equal(resolve("Reporting business unit"), null, "no bracket: no marker");
  assert.equal(resolve("Portail [Businessman]"), null, "whole word only");
  assert.equal(resolve("Portail [Data] [Business]")?.domainId, "vendus", "any bracket group");
  const twice = { id: "x", name: "X", short: "X", color: "#000", nameMarkers: ["BUSINESS"] };
  assert.equal(createNameMarkerResolver({ ...CONFIG, domains: [...CONFIG.domains, vendus, twice] })("[business]"), null, "ambiguous");
  assert.equal(createNameMarkerResolver(CONFIG)("[Business]"), null, "no marker configured");
  assert.equal(ruleLabel({ domainId: "vendus", subDomainId: null, via: "domain", scope: "name", label: "BUSINESS" }),
    "marqueur « [business] » dans le nom");
  assert.equal(ruleLabel({ domainId: "infra", subDomainId: null, via: "domain", scope: "last", label: "INFRASTRUCTURE" }),
    "dernier segment · « INFRASTRUCTURE »");
});
