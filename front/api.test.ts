// Unit tests of the UI's single fetch surface: every function must hit the
// right same-origin relative URL with the right method/body, return the
// parsed JSON, and surface failures as French ApiError messages.
// global fetch is stubbed — no DOM, no server needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  fetchBoard,
  fetchConfig,
  fetchDefaultConfig,
  postBlock,
  postCard,
  postComment,
  postDelete,
  postEdit,
  postMove,
  postUnblock,
  putConfig,
} from "./api.ts";
import type { BoardConfig } from "../core/types.ts";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

interface FakeResponse {
  ok: boolean;
  status: number;
  json: unknown;
  /** When true, res.json() rejects (simulates a non-JSON failure body). */
  broken?: boolean;
}

// Installs a fake fetch returning `response`, recording calls; restores it.
function withFetch(response: FakeResponse, work: (calls: Call[]) => Promise<void>): Promise<void> {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => {
        if (response.broken) throw new Error("not json");
        return response.json;
      },
    } as Response;
  }) as typeof fetch;
  return work(calls).finally(() => {
    globalThis.fetch = original;
  });
}

// Installs a fetch that rejects (server unreachable); restores it after.
function withDeadFetch(work: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("failed to fetch");
  }) as typeof fetch;
  return work().finally(() => {
    globalThis.fetch = original;
  });
}

test("the config and board reads GET their same-origin relative URLs", async () => {
  const reads = [
    { run: fetchConfig, url: "/api/config" },
    { run: fetchDefaultConfig, url: "/api/config/default" },
    { run: fetchBoard, url: "/api/board" },
  ];
  for (const read of reads) {
    await withFetch({ ok: true, status: 200, json: { cards: [], events: [] } }, async (calls) => {
      await read.run();
      assert.equal(calls[0]?.url, read.url);
      assert.equal(calls[0]?.method, "GET");
    });
  }
});

test("fetchBoard returns the parsed body as-is", async () => {
  await withFetch({ ok: true, status: 200, json: { cards: [], events: [] } }, async () => {
    assert.deepEqual(await fetchBoard(), { cards: [], events: [] });
  });
});

test("putConfig PUTs the whole config to /api/config", async () => {
  const config = { lanes: [{ id: "l1" }] } as unknown as BoardConfig;
  await withFetch({ ok: true, status: 200, json: { lanes: [] } }, async (calls) => {
    await putConfig(config);
    assert.equal(calls[0]?.url, "/api/config");
    assert.equal(calls[0]?.method, "PUT");
    assert.deepEqual(calls[0]?.body, { lanes: [{ id: "l1" }] });
  });
});

test("postCard POSTs the creation intent to /api/cards and returns { card, event }", async () => {
  const input = {
    title: "Nouveau sujet",
    domain: "cyber",
    laneId: "projets",
    typeId: "etude",
    nature: "complicated",
    criticality: "normal",
    owner: "A. Diallo",
  } as const;
  const body = { card: { id: "S151" }, event: { id: "evt-9", type: "created" } };
  await withFetch({ ok: true, status: 201, json: body }, async (calls) => {
    const created = await postCard(input);
    assert.equal(calls[0]?.url, "/api/cards");
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, input);
    assert.deepEqual(created, body);
  });
});

test("each event intent POSTs its exact body to /api/events", async () => {
  const intents = [
    {
      run: () => postMove("S001", { laneId: "petits", columnId: "actifs" }),
      body: { type: "moved", cardId: "S001", toLaneId: "petits", toColumnId: "actifs" },
    },
    {
      run: () => postBlock("S001", "Attente fournisseur"),
      body: { type: "blocked", cardId: "S001", reason: "Attente fournisseur" },
    },
    { run: () => postUnblock("S001"), body: { type: "unblocked", cardId: "S001" } },
    {
      run: () => postEdit("S001", { title: "Titre" }),
      body: { type: "edited", cardId: "S001", patch: { title: "Titre" } },
    },
    {
      run: () => postComment("S001", "Vu en comité"),
      body: { type: "commented", cardId: "S001", text: "Vu en comité" },
    },
    { run: () => postDelete("S001"), body: { type: "deleted", cardId: "S001" } },
  ];
  for (const intent of intents) {
    await withFetch({ ok: true, status: 201, json: { id: "evt-1" } }, async (calls) => {
      const event = await intent.run();
      assert.equal(calls[0]?.url, "/api/events");
      assert.equal(calls[0]?.method, "POST");
      assert.deepEqual(calls[0]?.body, intent.body);
      assert.equal((event as { id: string }).id, "evt-1");
    });
  }
});

test("a non-2xx response surfaces the server's French error message", async () => {
  await withFetch({ ok: false, status: 400, json: { error: "Carte inconnue." } }, async () => {
    await assert.rejects(
      () => postBlock("S001", "x"),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 400);
        assert.equal(error.message, "Carte inconnue.");
        return true;
      },
    );
  });
});

test("a non-JSON failure body falls back to the generic French message", async () => {
  await withFetch({ ok: false, status: 502, json: null, broken: true }, async () => {
    await assert.rejects(
      () => fetchConfig(),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 502);
        assert.equal(error.message, "Requête /api/config refusée (HTTP 502).");
        return true;
      },
    );
  });
});

test("an unreachable server becomes ApiError status 0, « Serveur injoignable. »", async () => {
  await withDeadFetch(async () => {
    await assert.rejects(
      () => fetchBoard(),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 0);
        assert.equal(error.message, "Serveur injoignable.");
        return true;
      },
    );
  });
});
