// JSONL driver specifics: the human-readable on-disk format, versioned
// header validation, and crash recovery from a torn final write — behaviours
// the driver-agnostic conformance suite does not (and should not) cover.

import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lifecycleEvent } from "../../core/events.ts";
import { testCard } from "../../core/test-helpers.ts";
import { createJsonlStorage } from "./jsonl.ts";

const TS = "2026-06-01T10:00:00.000Z";

function withFile(work: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "kanban-jsonl-"));
  try {
    work(join(dir, "board.jsonl"));
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

test("a new file starts with a versioned header line", () => {
  withFile((path) => {
    const store = createJsonlStorage(path);
    store.appendEvent(lifecycleEvent("created", "S001", "local", TS));
    store.close();
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    assert.deepEqual(JSON.parse(lines[0] ?? ""), {
      kind: "header",
      format: "kanban-board-storage",
      version: 1,
    });
    assert.equal(JSON.parse(lines[1] ?? "").event.id, "evt-1");
    assert.equal(lines.length, 2); // human-readable: one record per line
  });
});

test("an incomplete trailing line is truncated and recovered on open", () => {
  withFile((path) => {
    const store = createJsonlStorage(path);
    store.appendEvent(lifecycleEvent("created", "S001", "local", TS));
    store.appendEvent(lifecycleEvent("created", "S002", "local", TS));
    store.close();
    // Simulate a crash mid-append: a partial record with no trailing newline.
    appendFileSync(path, '{"kind":"event","seq":3,"event":{"id":"evt-3"');
    const reopened = createJsonlStorage(path);
    try {
      // The torn line is dropped, the two committed events survive...
      assert.deepEqual(reopened.listEvents().map((e) => e.id), ["evt-1", "evt-2"]);
      // ...and the next append lands cleanly (no concatenation with the
      // truncated fragment), continuing the seq from the last valid event.
      const next = reopened.appendEvent(lifecycleEvent("created", "S003", "local", TS));
      assert.equal(next.id, "evt-3");
      assert.deepEqual(reopened.listEvents().map((e) => e.id), ["evt-1", "evt-2", "evt-3"]);
    } finally {
      reopened.close();
    }
    // Reopening once more proves the file on disk is well-formed.
    const verify = createJsonlStorage(path);
    try {
      assert.equal(verify.listEvents().length, 3);
    } finally {
      verify.close();
    }
  });
});

test("a foreign or missing header is refused", () => {
  withFile((path) => {
    writeFileSync(path, '{"kind":"event","seq":1,"event":{"id":"evt-1"}}\n');
    assert.throws(() => createJsonlStorage(path), /en-tete de format/);
  });
});

test("an unsupported format version is refused", () => {
  withFile((path) => {
    writeFileSync(path, '{"kind":"header","format":"kanban-board-storage","version":999}\n');
    assert.throws(() => createJsonlStorage(path), /non supporte/);
  });
});

test("a corrupt non-final line is refused (only the tail is recoverable)", () => {
  withFile((path) => {
    const store = createJsonlStorage(path);
    store.appendEvent(lifecycleEvent("created", "S001", "local", TS));
    store.close();
    // Garbage in the middle, followed by a valid line, is real corruption.
    appendFileSync(path, "ceci n'est pas du json\n");
    appendFileSync(path, JSON.stringify({ kind: "card", card: testCard() }) + "\n");
    assert.throws(() => createJsonlStorage(path), /corrompu/);
  });
});

test("an internal blank line does not cause truncation or data loss", () => {
  withFile((path) => {
    const store = createJsonlStorage(path);
    store.appendEvent(lifecycleEvent("created", "S001", "local", TS));
    store.appendEvent(lifecycleEvent("created", "S002", "local", TS));
    store.close();
    // A human inserts a stray blank line between the two records.
    const text = readFileSync(path, "utf8").replace("evt-1\"}}\n", "evt-1\"}}\n\n");
    writeFileSync(path, text);
    const reopened = createJsonlStorage(path);
    try {
      // Both committed events survive; the next append continues the seq...
      assert.deepEqual(reopened.listEvents().map((e) => e.id), ["evt-1", "evt-2"]);
      assert.equal(reopened.appendEvent(lifecycleEvent("created", "S003", "local", TS)).id, "evt-3");
    } finally {
      reopened.close();
    }
    // ...and the file is still well-formed on a further reopen (no fusion).
    const verify = createJsonlStorage(path);
    try {
      assert.equal(verify.listEvents().length, 3);
    } finally {
      verify.close();
    }
  });
});

test("seq is recovered from the event id when the seq field is absent", () => {
  withFile((path) => {
    writeFileSync(
      path,
      '{"kind":"header","format":"kanban-board-storage","version":1}\n' +
        '{"kind":"event","event":{"id":"evt-7","ts":"' +
        TS +
        '","actor":"local","cardId":"S001","type":"created","fromColumn":null,"toColumn":null,"payload":{}}}\n',
    );
    const store = createJsonlStorage(path);
    try {
      // maxSeq folds back to 7 from the id, so the next id does not collide.
      assert.equal(store.appendEvent(lifecycleEvent("created", "S002", "local", TS)).id, "evt-8");
    } finally {
      store.close();
    }
  });
});

test("a single garbage line with no header is refused, not silently wiped", () => {
  withFile((path) => {
    writeFileSync(path, "ceci n'est pas du json");
    assert.throws(() => createJsonlStorage(path), /corrompu/);
  });
});

test("diacritics in payloads round-trip through the text file", () => {
  withFile((path) => {
    const store = createJsonlStorage(path);
    store.appendEvent(
      lifecycleEvent("blocked", "S001", "local", TS, { reason: "attente arbitrage budgétaire" }),
    );
    store.close();
    const reopened = createJsonlStorage(path);
    try {
      assert.equal(reopened.listEvents()[0]?.payload["reason"], "attente arbitrage budgétaire");
    } finally {
      reopened.close();
    }
  });
});
