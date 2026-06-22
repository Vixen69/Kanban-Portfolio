// The no-leak logging guarantee (CLAUDE.md §6) deserves a test: logError must
// emit the error message only, never the thrown object or any attached payload.

import { test } from "node:test";
import assert from "node:assert/strict";
import { logError, logRequest } from "./log.ts";

// Captures console.error output for the duration of work().
function captureError(work: () => void): string[] {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => lines.push(args.join(" "));
  try {
    work();
  } finally {
    console.error = original;
  }
  return lines;
}

function captureLog(work: () => void): string[] {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  try {
    work();
  } finally {
    console.log = original;
  }
  return lines;
}

test("logError emits the message only, never the payload object", () => {
  const error = new Error("Erreur interne.") as Error & { payload?: unknown };
  error.payload = { title: "SECRET TITLE", budget: 999999 };
  const lines = captureError(() => logError("POST /api/events", error));
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /POST \/api\/events: Erreur interne\./);
  assert.doesNotMatch(lines[0] ?? "", /SECRET TITLE/);
  assert.doesNotMatch(lines[0] ?? "", /999999/);
});

test("logRequest emits method, path and status only", () => {
  const lines = captureLog(() => logRequest("GET", "/api/board", 200));
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /GET \/api\/board 200/);
});
