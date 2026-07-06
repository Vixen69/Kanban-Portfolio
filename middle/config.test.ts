import { test } from "node:test";
import assert from "node:assert/strict";
import { loadServerConfig } from "./config.ts";

test("defaults are local and safe when the environment is empty", () => {
  const cfg = loadServerConfig({});
  assert.equal(cfg.host, "127.0.0.1");
  assert.equal(cfg.port, 8787);
  assert.equal(cfg.storageDriver, "jsonl");
  assert.equal(cfg.dataPath, "data/board.jsonl");
  assert.equal(cfg.dataDir, "data");
  assert.equal(cfg.boardConfigPath, "config/board.json");
});

test("environment variables override every field", () => {
  const cfg = loadServerConfig({
    KANBAN_HOST: "0.0.0.0",
    KANBAN_PORT: "9000",
    KANBAN_STORAGE_DRIVER: "postgres",
    KANBAN_DATA_PATH: "data/board.custom.jsonl",
    KANBAN_CONFIG_PATH: "/etc/kanban/board.json",
  });
  assert.equal(cfg.host, "0.0.0.0");
  assert.equal(cfg.port, 9000);
  assert.equal(cfg.storageDriver, "postgres");
  assert.equal(cfg.dataPath, "data/board.custom.jsonl");
  assert.equal(cfg.dataDir, "data"); // config override lives next to the data file
  assert.equal(cfg.boardConfigPath, "/etc/kanban/board.json");
});

test("an out-of-range or non-numeric port is rejected", () => {
  assert.throws(() => loadServerConfig({ KANBAN_PORT: "0" }), /KANBAN_PORT invalide/);
  assert.throws(() => loadServerConfig({ KANBAN_PORT: "70000" }), /KANBAN_PORT invalide/);
  assert.throws(() => loadServerConfig({ KANBAN_PORT: "abc" }), /KANBAN_PORT invalide/);
});
