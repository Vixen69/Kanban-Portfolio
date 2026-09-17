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
    const onDisk = JSON.parse(readFileSync(join(dir, "config.json"), "utf8")) as { defaultsHash: string; config: BoardConfig };
    assert.deepEqual(onDisk.config, next);
    assert.equal(typeof onDisk.defaultsHash, "string", "stamped with the defaults it was applied on (ADR 038)");

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

// ADR 038: an applied config is adopted only while the defaults it was
// applied on are the ones running; the current exercise lives apart.
test("a changed versioned model supersedes the applied config: set aside into the history, file removed", () => {
  withDataDir((dir) => {
    createConfigStore(dir, testConfig()).setRuntime(modifiedConfig(), "anonymous");
    const changed = testConfig();
    changed.domains.pop(); // a fix in config/board.json
    const store = createConfigStore(dir, changed);
    assert.deepEqual(store.getRuntime(), changed, "the versioned model wins");
    assert.equal(existsSync(join(dir, "config.json")), false, "the applied config is gone from the data dir");
    const lines = readFileSync(join(dir, "config-history.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { actor: string; note?: string });
    assert.deepEqual(lines.map((l) => l.actor), ["anonymous", "modèle versionné"]);
    assert.match(lines[1]?.note ?? "", /écartée/);
    assert.deepEqual(createConfigStore(dir, changed).getRuntime(), changed, "no second history line on the next restart");
    assert.equal(readFileSync(join(dir, "config-history.jsonl"), "utf8").trim().split("\n").length, 2);
  });
});

test("a bare override written before ADR 038 is superseded once; a stamped one on unchanged defaults is adopted", () => {
  withDataDir((dir) => {
    writeFileSync(join(dir, "config.json"), JSON.stringify(modifiedConfig()), "utf8");
    assert.deepEqual(createConfigStore(dir, testConfig()).getRuntime(), testConfig());
    const store = createConfigStore(dir, testConfig());
    store.setRuntime(modifiedConfig(), "admin");
    assert.deepEqual(createConfigStore(dir, testConfig()).getRuntime(), modifiedConfig(), "same defaults: adopted after a restart");
  });
});

test("the current exercise year lives in exercise.json: served over any config, persisted, historised", () => {
  withDataDir((dir) => {
    const defaults = testConfig();
    const store = createConfigStore(dir, defaults);
    assert.equal(store.getExerciseYear(), defaults.exercise.year);
    const runtime = store.setExerciseYear(defaults.exercise.year + 1, "anonymous");
    assert.equal(runtime.exercise.year, defaults.exercise.year + 1);
    assert.equal(store.getRuntime().exercise.year, defaults.exercise.year + 1);
    store.setRuntime(modifiedConfig(), "admin");
    assert.equal(store.getRuntime().exercise.year, defaults.exercise.year + 1, "an applied config never moves the year back");
    assert.equal(store.getRuntime().andonThresholdDays, 9);
    const reopened = createConfigStore(dir, defaults);
    assert.equal(reopened.getExerciseYear(), defaults.exercise.year + 1);
    const history = readFileSync(join(dir, "exercise-history.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { from: number; year: number });
    assert.deepEqual(history, [{ ...history[0], from: defaults.exercise.year, year: defaults.exercise.year + 1 }]);
  });
});


test("the override is exposed and restored (ADR 042): put back or removed, each a noted history line, persisted", () => {
  withDataDir((dir) => {
    const defaults = testConfig();
    const store = createConfigStore(dir, defaults);
    assert.equal(store.getOverride(), null, "the versioned model runs");
    const applied = modifiedConfig();
    store.setRuntime(applied, "admin");
    assert.deepEqual(store.getOverride(), applied);
    store.restoreOverride(null, "pmo");
    assert.equal(store.getOverride(), null);
    assert.deepEqual(store.getRuntime(), defaults);
    assert.equal(existsSync(join(dir, "config.json")), false, "the override file is gone");
    store.restoreOverride(applied, "pmo");
    assert.deepEqual(store.getRuntime(), applied);
    assert.deepEqual(createConfigStore(dir, defaults).getOverride(), applied, "the restored override survives a restart");
    const history = readFileSync(join(dir, "config-history.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { actor: string; note?: string; config: unknown });
    assert.deepEqual(history.map((entry) => [entry.actor, entry.note ?? null, entry.config === null]), [
      ["admin", null, false], ["pmo", "restauration d’instantané (ADR 042)", true], ["pmo", "restauration d’instantané (ADR 042)", false],
    ]);
  });
});
