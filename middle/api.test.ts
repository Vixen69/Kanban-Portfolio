// Handler logic exercised directly against an in-memory stub storage — no
// HTTP, no disk. Focus: server authority over ids/ts/actor and validation of
// every intent against the folded state and the runtime (v2) config.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoardConfig, Card, CardEvent } from "../core/types.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { BadRequest, getBoard, getConfig, postEvent, putConfig, SERVER_ACTOR } from "./api.ts";
import { postCard } from "./cards.ts";
import { stubStorage } from "./test-helpers.ts";
import type { ConfigStore } from "./config-store.ts";

const config = testConfig();

// ConfigStore stub recording every applied override.
function stubConfigStore(
  defaults: BoardConfig,
): ConfigStore & { applied: { actor: string; config: BoardConfig }[] } {
  const applied: { actor: string; config: BoardConfig }[] = [];
  let runtime = defaults;
  return {
    applied,
    getRuntime: () => runtime,
    getDefaults: () => defaults,
    setRuntime(next: BoardConfig, actor: string): BoardConfig {
      applied.push({ actor, config: next });
      runtime = next;
      return next;
    },
  };
}

const VALID_CARD_BODY = {
  title: "Nouveau sujet",
  domain: "beta",
  laneId: "laneB",
  typeId: "t2",
  nature: "complex",
  criticality: "top",
  owner: "Mme Chef",
};

test("getConfig returns the given board topology", () => {
  assert.deepEqual(getConfig(config).body, config);
});

test("getBoard returns base cards and the event log", () => {
  const result = getBoard(stubStorage());
  assert.equal(result.status, 200);
  const body = result.body as { cards: unknown[]; events: unknown[] };
  assert.equal(body.cards.length, 1);
  assert.equal(body.events.length, 0);
});

test("putConfig validates then persists the override with the server actor", () => {
  const store = stubConfigStore(config);
  const next = testConfig();
  next.columns[0]!.name = "Entrée";
  const result = putConfig(store, next);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, next);
  assert.equal(store.applied.length, 1);
  assert.equal(store.applied[0]?.actor, SERVER_ACTOR);
  assert.deepEqual(store.getRuntime(), next);
});

test("putConfig rejects an invalid config with the validator's message", () => {
  const store = stubConfigStore(config);
  assert.throws(() => putConfig(store, {}), BadRequest);
  assert.throws(() => putConfig(store, "nope"), BadRequest);
  assert.equal(store.applied.length, 0);
});

test("postCard builds the whole card server-side and appends created", () => {
  const storage = stubStorage();
  const result = postCard(storage, config, { ...VALID_CARD_BODY, title: "  Nouveau sujet  " });
  assert.equal(result.status, 201);
  const { card, event } = result.body as { card: Card; event: CardEvent };
  assert.equal(card.id, "S002");
  assert.equal(card.title, "Nouveau sujet"); // trimmed
  assert.equal(card.columnId, "col1"); // first column of the runtime config
  assert.equal(card.source, "manual");
  assert.match(card.codename ?? "", /^PX\d{7}$/);
  assert.equal(card.blocked, false);
  assert.deepEqual(card.custom, {});
  assert.equal(event.type, "created");
  assert.equal(event.cardId, "S002");
  assert.equal(event.toColumn, "col1");
  assert.equal(event.payload["laneId"], "laneB");
  assert.equal(event.actor, SERVER_ACTOR);
  assert.equal(storage.listBaseCards().length, 2);
  assert.equal(storage.listEvents().length, 1);
});

test("postCard assigns the next free S-id, padded to 3 digits", () => {
  const storage = stubStorage([
    testCard({ id: "S001" }),
    testCard({ id: "S007" }),
    testCard({ id: "X99" }),
  ]);
  const first = postCard(storage, config, VALID_CARD_BODY).body as { card: Card };
  assert.equal(first.card.id, "S008");
  const empty = stubStorage([]);
  const second = postCard(empty, config, VALID_CARD_BODY).body as { card: Card };
  assert.equal(second.card.id, "S001");
});

test("postCard rejects every invalid creation field in French", () => {
  const cases: [Record<string, unknown> | string, RegExp][] = [
    [{ ...VALID_CARD_BODY, title: "   " }, /Titre requis/],
    [{ ...VALID_CARD_BODY, title: "x".repeat(201) }, /Titre trop long/],
    [{ ...VALID_CARD_BODY, domain: "ghost" }, /Domaine inconnu/],
    [{ ...VALID_CARD_BODY, laneId: "ghost" }, /Canal inconnu/],
    [{ ...VALID_CARD_BODY, typeId: "ghost" }, /Type de projet inconnu/],
    [{ ...VALID_CARD_BODY, nature: "bizarre" }, /Nature invalide/],
    [{ ...VALID_CARD_BODY, criticality: "mega" }, /Criticité invalide/],
    [{ ...VALID_CARD_BODY, owner: 42 }, /Chef de projet invalide/],
    [{ ...VALID_CARD_BODY, owner: "x".repeat(121) }, /Chef de projet trop long/],
    ["pas un objet", /Corps JSON/],
  ];
  const storage = stubStorage();
  for (const [body, message] of cases) {
    assert.throws(() => postCard(storage, config, body), BadRequest);
    assert.throws(() => postCard(storage, config, body), message);
  }
  assert.equal(storage.listBaseCards().length, 1); // nothing was persisted
  assert.equal(storage.listEvents().length, 0);
});

test("a valid move is stamped by the server with the current cell as origin", () => {
  const storage = stubStorage();
  const result = postEvent(storage, config, {
    type: "moved",
    cardId: "S001",
    toLaneId: "laneB",
    toColumnId: "col2",
  });
  assert.equal(result.status, 201);
  const event = result.body as CardEvent;
  assert.equal(event.id, "evt-1");
  assert.equal(event.actor, SERVER_ACTOR);
  assert.equal(event.fromColumn, "col1"); // server-derived from folded state
  assert.equal(event.toColumn, "col2");
});

test("the server ignores any client-supplied actor or timestamp", () => {
  const storage = stubStorage();
  const result = postEvent(storage, config, {
    type: "commented",
    cardId: "S001",
    text: "Point fait au Portfolio Sync.",
    actor: "pirate",
    ts: "1999-01-01T00:00:00.000Z",
  });
  const event = result.body as CardEvent;
  assert.equal(event.actor, SERVER_ACTOR);
  assert.notEqual(event.ts, "1999-01-01T00:00:00.000Z");
});

test("blocked requires a reason, trims it, and caps it at 500 characters", () => {
  const storage = stubStorage();
  const result = postEvent(storage, config, {
    type: "blocked",
    cardId: "S001",
    reason: "  Attente d’arbitrage budget.  ",
  });
  const event = result.body as CardEvent;
  assert.equal(event.payload["reason"], "Attente d’arbitrage budget.");
  assert.throws(() => postEvent(storage, config, { type: "blocked", cardId: "S001" }), /Motif de blocage requis/);
  assert.throws(
    () => postEvent(storage, config, { type: "blocked", cardId: "S001", reason: "x".repeat(501) }),
    /Motif de blocage trop long/,
  );
});

test("unblocked is only valid on a blocked card", () => {
  const storage = stubStorage();
  assert.throws(() => postEvent(storage, config, { type: "unblocked", cardId: "S001" }), /Carte non bloquée/);
  postEvent(storage, config, { type: "blocked", cardId: "S001", reason: "Dépendance PLM." });
  const result = postEvent(storage, config, { type: "unblocked", cardId: "S001" });
  assert.equal(result.status, 201);
});

test("commented stores the trimmed text and caps it at 2000 characters", () => {
  const storage = stubStorage();
  const result = postEvent(storage, config, { type: "commented", cardId: "S001", text: "  Vu en comité.  " });
  const event = result.body as CardEvent;
  assert.equal(event.type, "commented");
  assert.equal(event.payload["text"], "Vu en comité.");
  assert.throws(() => postEvent(storage, config, { type: "commented", cardId: "S001", text: "  " }), /Commentaire requis/);
  assert.throws(
    () => postEvent(storage, config, { type: "commented", cardId: "S001", text: "x".repeat(2001) }),
    /Commentaire trop long/,
  );
});

test("a deleted card disappears from the folded board and rejects intents", () => {
  const storage = stubStorage();
  const result = postEvent(storage, config, { type: "deleted", cardId: "S001" });
  assert.equal(result.status, 201);
  assert.equal((result.body as CardEvent).type, "deleted");
  assert.throws(
    () => postEvent(storage, config, { type: "commented", cardId: "S001", text: "trop tard" }),
    /Carte inconnue/,
  );
});

test("an edited patch passes with valid v2 fields of every kind", () => {
  const storage = stubStorage();
  const patch = {
    title: "Titre revu",
    effortEstimated: 120,
    budgetConsumed: null,
    resources: ["MOE SI", "Archi"],
    tags: ["prioritaire"],
    custom: { risque: "élevé", chiffré: true, revue: null, score: 3 },
    domain: "beta",
    typeId: null,
    nature: "simple",
    criticality: "major",
    loadPlan: "1,5 ETP",
    notes: "",
    budgetEngaged: 150,
    budgetRdli: 220,
    chargeByProfile: [{ profileId: "pA", jh: 30, done: 10 }],
    contentionProfiles: ["pA"],
    contentionNote: "Lead partagé",
    risks: [{ type: "rSSG", desc: "Revue sécurité" }],
    projectConstraints: ["legale"],
    alerts: ["Décision COPROJ attendue"],
    dateRdr: "2026-09-01T00:00:00.000Z",
  };
  const result = postEvent(storage, config, { type: "edited", cardId: "S001", patch });
  assert.equal(result.status, 201);
  assert.deepEqual((result.body as CardEvent).payload["patch"], patch);
});

test("an edited patch is rejected field by field in French", () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ id: "forgé" }, /Champ d’édition non autorisé : « id »/],
    [{ hasOwnProperty: 1 }, /Champ d’édition non autorisé/],
    [{ title: "  " }, /Valeur invalide pour le champ « title »/],
    [{ effortEstimated: -1 }, /Valeur invalide pour le champ « effortEstimated »/],
    [{ budgetEstimated: Number.NaN }, /Valeur invalide pour le champ « budgetEstimated »/],
    [{ resources: [1] }, /Valeur invalide pour le champ « resources »/],
    [{ tags: "pas-un-tableau" }, /Valeur invalide pour le champ « tags »/],
    [{ custom: { a: {} } }, /Valeur invalide pour le champ « custom »/],
    [{ domain: "ghost" }, /Valeur invalide pour le champ « domain »/],
    [{ typeId: "ghost" }, /Valeur invalide pour le champ « typeId »/],
    [{ nature: "bizarre" }, /Valeur invalide pour le champ « nature »/],
    [{ criticality: "mega" }, /Valeur invalide pour le champ « criticality »/],
    [{ chargeByProfile: [{ profileId: "ghost", jh: 1, done: 0 }] }, /Valeur invalide pour le champ « chargeByProfile »/],
    [{ chargeByProfile: [{ profileId: "pA", jh: -1, done: 0 }] }, /Valeur invalide pour le champ « chargeByProfile »/],
    [{ risks: [{ type: "ghost", desc: "x" }] }, /Valeur invalide pour le champ « risks »/],
    [{ contentionProfiles: ["ghost"] }, /Valeur invalide pour le champ « contentionProfiles »/],
    [{ projectConstraints: ["ghost"] }, /Valeur invalide pour le champ « projectConstraints »/],
    [{ dateRdr: 42 }, /Valeur invalide pour le champ « dateRdr »/],
  ];
  const storage = stubStorage();
  for (const [patch, message] of cases) {
    assert.throws(() => postEvent(storage, config, { type: "edited", cardId: "S001", patch }), message);
  }
  assert.throws(() => postEvent(storage, config, { type: "edited", cardId: "S001", patch: "nope" }), /Patch d’édition invalide/);
  assert.equal(storage.listEvents().length, 0);
});

test("invalid envelopes are rejected with BadRequest", () => {
  const cases: [unknown, RegExp][] = [
    [{ type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "ghost" }, /Colonne cible inconnue/],
    [{ type: "moved", cardId: "S001", toLaneId: "ghost", toColumnId: "col2" }, /Canal cible inconnu/],
    [{ type: "moved", cardId: "S001", toLaneId: "laneA", toColumnId: "col1" }, /Carte déjà dans cette cellule/],
    [{ type: "moved", cardId: "ZZZ", toLaneId: "laneB", toColumnId: "col2" }, /Carte inconnue/],
    [{ type: "created", cardId: "S001" }, /Type d’évènement non autorisé/],
    [{ type: "imported", cardId: "S001" }, /Type d’évènement non autorisé/],
    ["pas un objet", /Corps JSON/],
  ];
  const storage = stubStorage();
  for (const [intent, message] of cases) {
    assert.throws(() => postEvent(storage, config, intent), BadRequest);
    assert.throws(() => postEvent(storage, config, intent), message);
  }
  assert.equal(storage.listEvents().length, 0); // nothing was persisted
});
