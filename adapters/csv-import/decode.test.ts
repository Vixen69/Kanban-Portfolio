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

test("ADR 056: a UTF-8 file with a stray byte stays UTF-8 — the byte replaced and named as douteux", () => {
  const utf8 = Buffer.from("Année;Nom\n".concat("2026;Été\n".repeat(30)), "utf8");
  const out = decodeCsvBytes(Buffer.concat([utf8, Buffer.from([0x92]), Buffer.from("\n", "utf8")]));
  assert.equal(out.encoding, "utf-8");
  assert.ok(out.text.startsWith("Année;Nom\n2026;Été"));
  assert.ok(out.text.includes(String.fromCharCode(0xfffd)));
  assert.deepEqual(out.warnings, []);
  assert.equal(out.doubts.length, 1);
  assert.match(out.doubts[0] ?? "", /^1 octet\(s\) invalide\(s\) dans un fichier UTF-8 \(61 caractère\(s\) accentué\(s\) valides\) — .* ligne\(s\) 32 :/);
});

test("ADR 056: the threshold — past one stray byte per 20 accented characters, the file is Windows-1252", () => {
  const accents = (n: number): Buffer => Buffer.from("é".repeat(n), "utf8");
  const stray = (n: number): Buffer => Buffer.from(Array.from({ length: n }, () => 0xe9));
  assert.equal(decodeCsvBytes(Buffer.concat([accents(40), stray(2)])).encoding, "utf-8", "2 for 40: within 5 %");
  assert.equal(decodeCsvBytes(Buffer.concat([accents(40), stray(3)])).encoding, "windows-1252", "3 for 40: beyond");
  assert.equal(decodeCsvBytes(Buffer.from("Déjà été ; Réalisé ; Prévu", "latin1")).encoding, "windows-1252", "a real 1252 file");
  const accidental = Buffer.concat([Buffer.from([0xc3, 0xa9]), Buffer.from("Déjà été ; Réalisé", "latin1")]);
  assert.equal(decodeCsvBytes(accidental).encoding, "windows-1252", "one accidental « Ã© » does not make it UTF-8");
});
