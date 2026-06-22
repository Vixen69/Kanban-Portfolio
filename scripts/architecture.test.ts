// Tracks the architecture boundaries so a refactor (or a careless import)
// cannot silently erode them. Pure static scan of import specifiers + a
// network-call check; runs in `npm test`. Each rule is one assertion with a
// readable list of offenders. Test files (*.test.ts) are exempt — they may
// use node:test, stub fetch, etc.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // directory absent
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      yield path;
    }
  }
}

const rel = (file: string) => file.slice(ROOT.length).replace(/\\/g, "/").replace(/^\//, "");

// Every static import/export specifier in a file ("./x.ts", "react", "node:fs"…).
function specifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const re = /\b(?:import|export)\b[^"';]*?from\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;
  const out: string[] = [];
  for (let m = re.exec(source); m !== null; m = re.exec(source)) out.push(m[1] ?? m[2] ?? "");
  return out;
}

// "<rel path> → \"<specifier>\"" for each import in dir matching the predicate.
function offenders(dir: string, bad: (spec: string) => boolean): string[] {
  const out: string[] = [];
  for (const file of walk(join(ROOT, dir))) {
    for (const spec of specifiers(file)) if (bad(spec)) out.push(`${rel(file)} → "${spec}"`);
  }
  return out;
}

test("core/ is pure: source imports only relative core paths (no React/Node/framework)", () => {
  const bad = offenders("core", (spec) => !spec.startsWith("./"));
  assert.deepEqual(bad, [], `core/ must import only ./ paths:\n${bad.join("\n")}`);
});

test("front/ network egress is confined to front/api.ts", () => {
  const NET = /\bfetch\s*\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon|from\s*["']axios["']/;
  const bad: string[] = [];
  for (const file of walk(join(ROOT, "front"))) {
    if (rel(file) === "front/api.ts") continue;
    if (NET.test(readFileSync(file, "utf8"))) bad.push(rel(file));
  }
  assert.deepEqual(bad, [], `only front/api.ts may do network I/O:\n${bad.join("\n")}`);
});

test("front/ reaches the server only over HTTP (no middle/adapters/storage imports)", () => {
  const bad = offenders("front", (spec) => /(^|\/)(middle|adapters)(\/|$)|\/storage\//.test(spec));
  assert.deepEqual(bad, [], `front/ must not import server internals:\n${bad.join("\n")}`);
});

test("middle/ is server-side only (no React, no front/ imports)", () => {
  const bad = offenders(
    "middle",
    (spec) => spec === "react" || spec.startsWith("react-dom") || /(^|\/)front(\/|$)/.test(spec),
  );
  assert.deepEqual(bad, [], `middle/ must not import the front or React:\n${bad.join("\n")}`);
});

test("the Postgres client (pg) is imported nowhere yet (deferred, ADR 011)", () => {
  const bad: string[] = [];
  for (const dir of ["core", "front", "middle", "adapters", "scripts", "sync"]) {
    bad.push(...offenders(dir, (spec) => spec === "pg" || spec.startsWith("pg/")));
  }
  assert.deepEqual(bad, [], `pg must not be imported until authorized:\n${bad.join("\n")}`);
});
