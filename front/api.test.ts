// Smoke test for the UI's single fetch surface: it must hit same-origin
// relative URLs with the right method/body and surface failures as ApiError.
// global fetch is stubbed — no DOM, no server needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, fetchBoard, fetchConfig, postBlock, postMove } from "./api.ts";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

// Installs a fake fetch returning `response`, recording the call; restores it.
function withFetch(
  response: { ok: boolean; status: number; json: unknown },
  work: (calls: Call[]) => Promise<void>,
): Promise<void> {
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
      json: async () => response.json,
    } as Response;
  }) as typeof fetch;
  return work(calls).finally(() => {
    globalThis.fetch = original;
  });
}

test("fetchConfig and fetchBoard GET same-origin relative URLs", async () => {
  await withFetch({ ok: true, status: 200, json: { lanes: [] } }, async (calls) => {
    await fetchConfig();
    assert.equal(calls[0]?.url, "/api/config");
    assert.equal(calls[0]?.method, "GET");
  });
  await withFetch({ ok: true, status: 200, json: { cards: [], events: [] } }, async (calls) => {
    const board = await fetchBoard();
    assert.equal(calls[0]?.url, "/api/board");
    assert.deepEqual(board, { cards: [], events: [] });
  });
});

test("postMove POSTs a move intent to /api/events and returns the event", async () => {
  await withFetch({ ok: true, status: 201, json: { id: "evt-1", type: "moved" } }, async (calls) => {
    const event = await postMove("S001", { laneId: "laneB", columnId: "col2" });
    assert.equal(calls[0]?.url, "/api/events");
    assert.equal(calls[0]?.method, "POST");
    assert.deepEqual(calls[0]?.body, {
      type: "moved",
      cardId: "S001",
      toLaneId: "laneB",
      toColumnId: "col2",
    });
    assert.equal((event as { id: string }).id, "evt-1");
  });
});

test("a non-2xx response becomes an ApiError carrying the status", async () => {
  await withFetch({ ok: false, status: 400, json: { error: "Carte inconnue." } }, async () => {
    await assert.rejects(() => postBlock("S001", "x"), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal((error as ApiError).status, 400);
      return true;
    });
  });
});
