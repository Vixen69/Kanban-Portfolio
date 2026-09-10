// The unreadable-cell sample spells hidden characters, keeps accents. Edge
// whitespace (BOM, NBSP included) is trimmed first — exactly what the
// parsers do — so only what can still break a parse is revealed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleOf } from "./cell-sample.ts";

test("sampleOf reveals inner invisible spaces and control characters, keeps accents and length", () => {
  assert.equal(sampleOf("501\u00A0k"), "501⟨U+00A0⟩k");
  assert.equal(sampleOf("1\u202F736 k"), "1⟨U+202F⟩736 k");
  assert.equal(sampleOf("1\uFEFF2"), "1⟨U+FEFF⟩2");
  assert.equal(sampleOf("5\u00001"), "5⟨U+0000⟩1");
  assert.equal(sampleOf("\uFEFF  501 k  \u00A0"), "501 k", "edges trimmed like the parsers do");
  assert.equal(sampleOf("Coût prév"), "Coût prév", "accents untouched");
  assert.equal(sampleOf("x".repeat(60)).length, 40);
});

test("sampleOf reveals the C1 controls a Latin-1 decode leaves behind (the euro byte 0x80)", () => {
  assert.equal(sampleOf("501 k\u0080"), "501 k⟨U+0080⟩");
});
