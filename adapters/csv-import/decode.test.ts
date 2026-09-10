// Byte-level checks of the encoding policy: UTF-8 expected (BOM tolerated),
// Windows-1252 detected and flagged, UTF-16 refused. Bytes are built
// in-memory so git line-ending rewrites can never touch them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeCsvBytes, decodeWindows1252 } from "./decode.ts";

const EURO = String.fromCharCode(0x20ac);
const OE = String.fromCharCode(0x153);

test("plain ASCII decodes as utf-8 without warnings", () => {
  const out = decodeCsvBytes(Buffer.from("Domaine;Nom\n", "utf8"));
  assert.equal(out.encoding, "utf-8");
  assert.equal(out.text, "Domaine;Nom\n");
  assert.deepEqual(out.warnings, []);
  assert.equal(out.unsupported, undefined);
});

test("valid UTF-8 accents survive intact", () => {
  const out = decodeCsvBytes(Buffer.from("Ingénierie;Déjà", "utf8"));
  assert.equal(out.encoding, "utf-8");
  assert.equal(out.text, "Ingénierie;Déjà");
});

test("UTF-8 BOM is stripped and reported as utf-8-bom", () => {
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Domaine;Nom", "utf8")]);
  const out = decodeCsvBytes(bytes);
  assert.equal(out.encoding, "utf-8-bom");
  assert.equal(out.text, "Domaine;Nom");
  assert.deepEqual(out.warnings, []);
});

test("invalid UTF-8 falls back to Windows-1252 with one warning", () => {
  const out = decodeCsvBytes(Buffer.from([0x44, 0xe9, 0x6a]));
  assert.equal(out.encoding, "windows-1252");
  assert.equal(out.text, "Déj");
  assert.equal(out.warnings.length, 1);
  assert.match(out.warnings[0] ?? "", /Windows-1252/);
});

test("CP1252-specific bytes decode as euro and oe, proving 1252 over latin1", () => {
  const out = decodeCsvBytes(Buffer.from([0x80, 0x3b, 0x9c]));
  assert.equal(out.encoding, "windows-1252");
  assert.equal(out.text, `${EURO};${OE}`);
});

test("UTF-16 byte-order marks are refused with guidance", () => {
  for (const bom of [[0xff, 0xfe], [0xfe, 0xff]]) {
    const out = decodeCsvBytes(Buffer.from([...bom, 0x41, 0x00]));
    assert.equal(out.text, "");
    assert.match(out.unsupported ?? "", /UTF-16/);
  }
});

test("empty bytes decode to empty text", () => {
  const out = decodeCsvBytes(new Uint8Array(0));
  assert.equal(out.text, "");
  assert.equal(out.encoding, "utf-8");
  assert.deepEqual(out.warnings, []);
});

test("Windows-1252 is mapped by hand: the euro byte and the typographic quotes survive without ICU (2026-09-10)", () => {
  const bytes = Buffer.from([0x35, 0x30, 0x31, 0x20, 0x6b, 0x80, 0x3b, 0xe9, 0x3b, 0x64, 0x92, 0x6f, 0x3b, 0x9c]);
  const out = decodeCsvBytes(bytes);
  assert.equal(out.encoding, "windows-1252");
  assert.equal(out.text, "501 k" + EURO + ";é;d" + String.fromCharCode(0x2019) + "o;" + OE);
  assert.equal(decodeWindows1252(Uint8Array.from([0x80, 0x85, 0x93, 0x94, 0x96, 0x97, 0x8c])),
    EURO + "\u2026\u201c\u201d\u2013\u2014\u0152");
  assert.equal(decodeWindows1252(Uint8Array.from([0x41, 0xa0, 0xe9, 0xff])), "A\u00a0\u00e9\u00ff", "ISO-8859-1 range untouched");
  assert.equal(decodeWindows1252(new Uint8Array(20000)).length, 20000, "chunking keeps every byte");
});
