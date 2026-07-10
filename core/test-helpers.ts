// Shared factories for core and adapter tests (test-only module).

import type { BoardConfig, Card } from "./types.ts";

// The design-v10 typologies for tests (roles, profiles, risks, constraints,
// severities). Split out so testConfig stays within the 40-line function cap.
type Vocabularies = Pick<
  BoardConfig,
  "roleFamilies" | "profiles" | "roleOf" | "riskTypes" | "projectConstraints" | "riskSeverity"
>;
function testVocabularies(): Vocabularies {
  return {
    roleFamilies: [
      { id: "rfDev", name: "Développement", color: "#4338ca" },
      { id: "rfArchi", name: "Architecture", color: "#14b8a6" },
    ],
    profiles: [
      { id: "pA", name: "Profil A", color: "#0d9488" },
      { id: "pB", name: "Profil B", color: "#4338ca" },
    ],
    roleOf: { "Lead dev": "rfDev" },
    riskTypes: [
      { id: "rSSG", name: "SSG", short: "SSG", color: "#b91c1c" },
      { id: "rInfra", name: "Infra", short: "Infra", color: "#db2777" },
    ],
    projectConstraints: [
      { id: "legale", name: "Légale", short: "Légale", color: "#dc2626" },
      { id: "groupe", name: "Groupe", short: "Groupe", color: "#7c3aed" },
    ],
    riskSeverity: {
      faible: { label: "Faible", color: "#64748b", rank: 1 },
      moyen: { label: "Moyen", color: "#b45309", rank: 2 },
      eleve: { label: "Élevé", color: "#b91c1c", rank: 3 },
    },
  };
}

/**
 * A small valid v2 board topology for tests: 2 lanes, 3 columns (one WIP,
 * one gate), 2 domains, 2 types, no custom fields, design age thresholds,
 * plus the design-v10 typologies (see testVocabularies).
 * Output: a fresh BoardConfig (safe to mutate in a test). Failure: none.
 */
export function testConfig(): BoardConfig {
  return {
    lanes: [
      { id: "laneA", name: "Lane A", nature: "Clair", natureKey: "simple", detail: "Canal simple" },
      { id: "laneB", name: "Lane B", nature: "Complexe", natureKey: "complex", detail: "Canal complexe" },
    ],
    columns: [
      { id: "col1", name: "Colonne 1", wip: null, gate: null, note: "Entrée" },
      { id: "col2", name: "Colonne 2", wip: 3, gate: "DoR", note: "Au milieu" },
      { id: "col3", name: "Colonne 3", wip: null, gate: null, note: "Sortie" },
    ],
    domains: [
      { id: "alpha", name: "Alpha", short: "ALP", color: "#10b981" },
      { id: "beta", name: "Beta", short: "BET", color: "#6366f1" },
    ],
    types: [
      { id: "t1", name: "Type 1", short: "T1", color: "#0369a1" },
      { id: "t2", name: "Type 2", short: "T2", color: "#15803d" },
    ],
    natures: {
      simple: { label: "Clair", bg: "#ccfbf1", fg: "#0d9488" },
      complicated: { label: "Compliqué", bg: "#dbeafe", fg: "#2563eb" },
      complex: { label: "Complexe", bg: "#ffedd5", fg: "#c2410c" },
    },
    criticalities: {
      top: { label: "Top", badge: "TOP", bg: "#eab308", fg: "#1a1505" },
      major: { label: "Major", badge: "MAJOR", bg: "#475569", fg: "#e2e8f0" },
      normal: { label: "Normal", badge: null },
    },
    gateDefs: {
      DoR: { name: "Definition of Ready", color: "#1d4ed8" },
      DoD: { name: "Definition of Done", color: "#047857" },
    },
    fields: [],
    ...testVocabularies(),
    age: { freshMaxDays: 7, recentMaxDays: 28, agingMaxDays: 60 },
    andonThresholdDays: 5,
  };
}

/**
 * A card with sane v2 defaults, overridable per test.
 * Input: partial Card overrides. Output: a complete Card. Failure: none.
 */
export function testCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "S001",
    title: "Sujet de test",
    domain: "alpha",
    laneId: "laneA",
    columnId: "col1",
    owner: "M. Test",
    criticality: "normal",
    typeId: "t1",
    codename: "PX0000001",
    nature: "simple",
    tags: [],
    dependencies: [],
    blocked: false,
    blockedReason: null,
    blockedSince: null,
    effortEstimated: null,
    effortConsumed: null,
    budgetEstimated: null,
    budgetConsumed: null,
    loadPlan: null,
    resources: [],
    notes: "",
    budgetEngaged: null,
    budgetRdli: null,
    chargeByProfile: [],
    contentionProfiles: [],
    contentionNote: "",
    risks: [],
    projectConstraints: [],
    alerts: [],
    dateRdr: null,
    sciformaId: null,
    custom: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "fixtures",
    ...overrides,
  };
}
