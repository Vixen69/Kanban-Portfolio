// Portfolio -> domain resolution (ADR 030): the last segment first, whole
// words only, sub-domain more specific than domain, ambiguity = null.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BoardConfig } from "../../core/types.ts";
import { createPortfolioResolver, lastSegment } from "./portfolio.ts";

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
