// End-to-end transport test: a real Express app on an ephemeral loopback port,
// driven with fetch. Covers routing (config/config-default/board/cards/
// events), security headers, the body cap, error mapping, and the runtime
// config override precedence over HTTP. Storage is an in-memory stub; the
// config store is the real one in a temp dir.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardStorage } from "../core/ports.ts";
import type { CardEventInput } from "../core/events.ts";
import type { BoardConfig, Card, CardEvent } from "../core/types.ts";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { createConfigStore } from "./config-store.ts";
import { createApp } from "./app.ts";

// In-memory BoardStorage stub: base cards + append-only events, ids evt-<n>.
function stubStorage(cards: Card[] = [testCard({ id: "S001" })]): BoardStorage {
  const baseCards = cards.map((card) => ({ ...card }));
  const events: CardEvent[] = [];
  let seq = 0;
  const append = (input: CardEventInput): CardEvent => {
    seq += 1;
    const event: CardEvent = { ...input, id: `evt-${seq}` };
    events.push(event);
    return event;
  };
  return {
    importCards() {
      throw new Error("importCards non utilisé dans ces tests");
    },
    insertCard(card: Card, created: CardEventInput): CardEvent {
      if (baseCards.some((c) => c.id === card.id)) throw new Error(`id dupliqué : ${card.id}`);
      baseCards.push({ ...card });
      return append(created);
    },
    appendEvent: append,
    listEvents: () => events.slice(),
    listBaseCards: () => baseCards.map((card) => ({ ...card })),
    close() {},
  };
}

// Boots the app on port 0, runs the body against its base URL, tears it all
// down (server, then temp dir) regardless of outcome.
async function withServer(work: (base: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-middle-"));
  const configStore = createConfigStore(dir, testConfig());
  const app = createApp({ storage: stubStorage(), configStore });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  try {
    await work(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

function postJson(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET /api/config returns the topology with security headers", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/config`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    const body = (await res.json()) as BoardConfig;
    assert.equal(body.lanes.length, 2);
  });
});

test("PUT /api/config overrides the runtime config; defaults stay served", async () => {
  await withServer(async (base) => {
    const next = testConfig();
    next.columns[0]!.name = "Entrée";
    const put = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    assert.equal(put.status, 200);
    const runtime = (await (await fetch(`${base}/api/config`)).json()) as BoardConfig;
    assert.equal(runtime.columns[0]?.name, "Entrée");
    const defaults = (await (await fetch(`${base}/api/config/default`)).json()) as BoardConfig;
    assert.equal(defaults.columns[0]?.name, "Colonne 1");
  });
});

test("PUT /api/config rejects an invalid config with a 400", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lanes: [] }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error.length > 0);
  });
});

test("after an override, intents are validated against the runtime config", async () => {
  await withServer(async (base) => {
    const next = testConfig();
    next.columns.reverse(); // "col3" becomes the intake column
    const put = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    assert.equal(put.status, 200);
    const res = await postJson(base, "/api/cards", {
      title: "Sujet post-override",
      domain: "alpha",
      laneId: "laneA",
      typeId: "t1",
      nature: "simple",
      criticality: "normal",
      owner: "",
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { card: Card };
    assert.equal(body.card.columnId, "col3"); // first column of the RUNTIME config
  });
});

test("GET /api/board returns cards and events", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/board`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { cards: unknown[]; events: unknown[] };
    assert.equal(body.cards.length, 1);
    assert.equal(body.events.length, 0);
  });
});

test("POST /api/cards creates a server-built card with its created event", async () => {
  await withServer(async (base) => {
    const res = await postJson(base, "/api/cards", {
      title: "Nouveau sujet",
      domain: "beta",
      laneId: "laneB",
      typeId: "t2",
      nature: "complex",
      criticality: "top",
      owner: "Mme Chef",
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { card: Card; event: CardEvent };
    assert.equal(body.card.id, "S002");
    assert.equal(body.card.columnId, "col1");
    assert.equal(body.event.type, "created");
    assert.equal(body.event.actor, "anonymous");
  });
});

test("POST /api/cards rejects an invalid intent with a French message", async () => {
  await withServer(async (base) => {
    const res = await postJson(base, "/api/cards", { title: "", domain: "beta" });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Titre requis.");
  });
});

test("POST /api/events appends a server-stamped event", async () => {
  await withServer(async (base) => {
    const res = await postJson(base, "/api/events", {
      type: "moved",
      cardId: "S001",
      toLaneId: "laneB",
      toColumnId: "col2",
    });
    assert.equal(res.status, 201);
    const event = (await res.json()) as CardEvent;
    assert.equal(event.id, "evt-1");
    assert.equal(event.actor, "anonymous");
    assert.equal(event.toColumn, "col2");
  });
});

test("commented and deleted intents pass over the transport", async () => {
  await withServer(async (base) => {
    const commented = await postJson(base, "/api/events", {
      type: "commented",
      cardId: "S001",
      text: "Vu en comité.",
    });
    assert.equal(commented.status, 201);
    const deleted = await postJson(base, "/api/events", { type: "deleted", cardId: "S001" });
    assert.equal(deleted.status, 201);
  });
});

test("a malformed or invalid POST is a 400, still with security headers", async () => {
  await withServer(async (base) => {
    const bad = await fetch(`${base}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    assert.equal(bad.status, 400);
    assert.match(bad.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    const invalid = await postJson(base, "/api/events", {
      type: "moved",
      cardId: "S001",
      toLaneId: "laneB",
      toColumnId: "ghost",
    });
    assert.equal(invalid.status, 400);
  });
});

test("created/imported events are not acceptable over the API", async () => {
  await withServer(async (base) => {
    const res = await postJson(base, "/api/events", { type: "created", cardId: "S001" });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Type d’évènement non autorisé.");
  });
});

test("an oversized body is rejected with 413", async () => {
  await withServer(async (base) => {
    const res = await postJson(base, "/api/events", {
      type: "edited",
      cardId: "S001",
      pad: "x".repeat(70 * 1024),
    });
    assert.equal(res.status, 413);
  });
});

test("an unknown API route is a 404", async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  });
});
