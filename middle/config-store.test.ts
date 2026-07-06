// Runtime config store: override precedence over defaults, persistence across
// re-opens, append-only history, and hard failure on a corrupted override.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardConfig } from "../core/types.ts";
import { testConfig } from "../core/test-helpers.ts";
import { createConfigStore } from "./config-store.ts";

// Runs the body against a fresh temp data dir, removed regardless of outcome.
function withDataDir(work: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "kanban-cfgstore-"));
  try {
    work(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

// A valid config that differs visibly from the defaults.
function modifiedConfig(): BoardConfig {
  const next = testConfig();
  next.columns[0]!.name = "Entrée";
  next.andonThresholdDays = 9;
  return next;
}

test("without an override file, the runtime config is the defaults", () => {
  withDataDir((dir) => {
    const defaults = testConfig();
    const store = createConfigStore(dir, defaults);
    assert.deepEqual(store.getRuntime(), defaults);
    assert.deepEqual(store.getDefaults(), defaults);
    assert.equal(existsSync(join(dir, "config.json")), false);
  });
});

test("setRuntime persists the override and it wins after a re-open", () => {
  withDataDir((dir) => {
    const defaults = testConfig();
    const next = modifiedConfig();
    const stored = createConfigStore(dir, defaults).setRuntime(next, "anonymous");
    assert.deepEqual(stored, next);
    // A brand-new store on the same dir (a middle restart) reads the override.
    const reopened = createConfigStore(dir, defaults);
    assert.deepEqual(reopened.getRuntime(), next);
    assert.deepEqual(reopened.getDefaults(), defaults); // defaults untouched
    const onDisk = JSON.parse(readFileSync(join(dir, "config.json"), "utf8")) as BoardConfig;
    assert.deepEqual(onDisk, next);
  });
});

test("every applied config appends one {ts, actor, config} history line", () => {
  withDataDir((dir) => {
    const store = createConfigStore(dir, testConfig());
    store.setRuntime(modifiedConfig(), "anonymous");
    store.setRuntime(testConfig(), "admin");
    const lines = readFileSync(join(dir, "config-history.jsonl"), "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    const entries = lines.map(
      (line) => JSON.parse(line) as { ts: string; actor: string; config: BoardConfig },
    );
    assert.equal(entries[0]?.actor, "anonymous");
    assert.equal(entries[1]?.actor, "admin");
    assert.ok(entries.every((entry) => !Number.isNaN(Date.parse(entry.ts))));
    assert.deepEqual(entries[0]?.config, modifiedConfig());
    assert.deepEqual(entries[1]?.config, testConfig());
  });
});

test("setRuntime creates the data dir when it does not exist yet", () => {
  withDataDir((dir) => {
    const nested = join(dir, "nested", "data");
    const store = createConfigStore(nested, testConfig());
    store.setRuntime(modifiedConfig(), "anonymous");
    assert.equal(existsSync(join(nested, "config.json")), true);
  });
});

test("an unreadable or invalid override file is a hard French error", () => {
  withDataDir((dir) => {
    writeFileSync(join(dir, "config.json"), "{pas du json", "utf8");
    assert.throws(() => createConfigStore(dir, testConfig()), /Configuration d’exécution illisible/);
  });
  withDataDir((dir) => {
    writeFileSync(join(dir, "config.json"), "{}", "utf8"); // parses, fails validation
    assert.throws(() => createConfigStore(dir, testConfig()), /Configuration d’exécution illisible/);
  });
});
