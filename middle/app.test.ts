// End-to-end transport test: a real Express app on an ephemeral loopback port,
// driven with fetch. Covers routing, security headers, the body cap, the
// not-postable types, and error mapping. Storage is the JSONL driver in a temp
// dir (Node-22-safe; the Postgres adapter joins behind the same port later).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testCard, testConfig } from "../core/test-helpers.ts";
import { createJsonlStorage } from "./storage/jsonl.ts";
import { createApp } from "./app.ts";

// Boots the app on port 0, runs the body against its base URL, tears it all
// down (server, then storage, then temp dir) regardless of outcome.
async function withServer(work: (base: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-middle-"));
  const storage = createJsonlStorage(join(dir, "board.jsonl"));
  storage.importCards([testCard({ id: "S001" })], []);
  const app = createApp({ storage, config: testConfig() });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  try {
    await work(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

test("GET /api/config returns the topology with security headers", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/config`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    const body = (await res.json()) as { lanes: unknown[] };
    assert.equal(body.lanes.length, 2);
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

test("POST /api/events appends a server-stamped event", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "col2" }),
    });
    assert.equal(res.status, 201);
    const event = (await res.json()) as { id: string; actor: string; toColumn: string };
    assert.equal(event.id, "evt-1");
    assert.equal(event.actor, "anonymous");
    assert.equal(event.toColumn, "col2");
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
    const invalid = await fetch(`${base}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "moved", cardId: "S001", toLaneId: "laneB", toColumnId: "ghost" }),
    });
    assert.equal(invalid.status, 400);
  });
});

test("created/imported events are not acceptable over the API", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "created", cardId: "S001" }),
    });
    assert.equal(res.status, 400);
  });
});

test("an oversized body is rejected with 413", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "edited", cardId: "S001", pad: "x".repeat(70 * 1024) }),
    });
    assert.equal(res.status, 413);
  });
});

test("an unknown API route is a 404", async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  });
});
