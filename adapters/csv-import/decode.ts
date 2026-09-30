// Bytes -> text for CSV inputs. Encoding policy from docs/IMPORT-MAPPING.md:
// UTF-8 expected (BOM tolerated), Windows-1252 detected and flagged, UTF-16
// refused with guidance. A UTF-8 file carrying a handful of stray bytes
// stays UTF-8 (ADR 056 — one stray 0x92 used to turn a whole COUT PREV
// file into Windows-1252, « Année » into « AnnÃ©e », and the perimeter
// fell back to Projets.csv): the bad bytes are replaced and named as
// douteux. Pure: callers provide the bytes, no Node APIs here.

/** Outcome of decoding one CSV file. */
export interface DecodedCsv {
  /** Decoded text, byte-order mark already stripped. */
  text: string;
  /** What the bytes turned out to be. */
  encoding: "utf-8" | "utf-8-bom" | "windows-1252" | "unknown";
  /** French signalements for the report (deviant encoding, fallback...). */
  warnings: string[];
  /** French douteux for the report (stray bytes replaced in a UTF-8 file). */
  doubts: string[];
  /** Set when the bytes cannot be treated as CSV text (UTF-16 BOM). */
  unsupported?: string;
}

/**
 * The share of stray bytes a UTF-8 file may carry and still be read as
 * UTF-8: at most one invalid byte per 20 well-formed multi-byte characters
 * (5 %). A real Windows-1252 file has every accented letter invalid and
 * almost no well-formed sequence (an accidental « Ã© » at most); a UTF-8
 * export with one stray byte has hundreds of well-formed accents.
 */
export const STRAY_BYTES_PER_CHAR = 1 / 20;

/**
 * Decodes CSV bytes according to the import encoding policy.
 * Inputs: raw file bytes.
 * Outputs: DecodedCsv — text plus the detected encoding, French warnings
 * and douteux; `unsupported` is set (and text empty) for UTF-16 files.
 * Valid UTF-8 decodes as such; invalid UTF-8 whose stray bytes stay within
 * STRAY_BYTES_PER_CHAR of its well-formed multi-byte characters decodes
 * as UTF-8 with the stray bytes replaced by « � » (one douteux naming how
 * many and on which lines); anything else decodes as Windows-1252.
 * Failure modes: none — never a throw.
 */
export function decodeCsvBytes(bytes: Uint8Array): DecodedCsv {
  if (hasUtf16Bom(bytes)) {
    return {
      text: "",
      encoding: "unknown",
      warnings: [],
      doubts: [],
      unsupported: "encodage UTF-16 non pris en charge — exporter en UTF-8",
    };
  }
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  const encoding = hasBom ? "utf-8-bom" : "utf-8";
  const survey = surveyUtf8(body);
  if (survey.invalid === 0) return { text: new TextDecoder("utf-8").decode(body), encoding, warnings: [], doubts: [] };
  if (survey.wellFormed > 0 && survey.invalid <= survey.wellFormed * STRAY_BYTES_PER_CHAR) {
    const lines = `${survey.lines.join(", ")}${survey.lineCount > survey.lines.length ? ", …" : ""}`;
    return {
      text: new TextDecoder("utf-8").decode(body), encoding, warnings: [],
      doubts: [
        `${survey.invalid} octet(s) invalide(s) dans un fichier UTF-8 (${survey.wellFormed} caractère(s) accentué(s) valides) — ` +
          `remplacé(s) par « � », ligne(s) ${lines} : valeurs de ces lignes à vérifier, export à corriger`,
      ],
    };
  }
  return decodeFallback(body);
}

interface Utf8Survey {
  /** Well-formed multi-byte sequences (accented letters, €, ’…). */
  wellFormed: number;
  /** Bytes that start no well-formed sequence. */
  invalid: number;
  /** The physical lines (1-based) of the first invalid bytes, 8 at most. */
  lines: number[];
  /** How many distinct lines carry an invalid byte. */
  lineCount: number;
}

// The byte ranges of a well-formed UTF-8 sequence by lead byte (RFC 3629):
// length, then the allowed range of the SECOND byte (the others are
// 0x80–0xBF). A lead byte outside the table starts nothing.
function sequenceRule(lead: number): [number, number, number] | null {
  if (lead >= 0xc2 && lead <= 0xdf) return [2, 0x80, 0xbf];
  if (lead === 0xe0) return [3, 0xa0, 0xbf];
  if (lead === 0xed) return [3, 0x80, 0x9f];
  if (lead >= 0xe1 && lead <= 0xef) return [3, 0x80, 0xbf];
  if (lead === 0xf0) return [4, 0x90, 0xbf];
  if (lead >= 0xf1 && lead <= 0xf3) return [4, 0x80, 0xbf];
  if (lead === 0xf4) return [4, 0x80, 0x8f];
  return null;
}

// Length of the well-formed sequence starting at i, 0 when there is none.
function sequenceLength(bytes: Uint8Array, i: number): number {
  const rule = sequenceRule(bytes[i] ?? 0);
  if (rule === null) return 0;
  const [length, min, max] = rule;
  const second = bytes[i + 1];
  if (second === undefined || second < min || second > max) return 0;
  for (let k = 2; k < length; k++) {
    const next = bytes[i + k];
    if (next === undefined || next < 0x80 || next > 0xbf) return 0;
  }
  return length;
}

// Counts the well-formed multi-byte sequences and the stray bytes, with
// the lines the first stray bytes sit on.
function surveyUtf8(bytes: Uint8Array): Utf8Survey {
  const survey: Utf8Survey = { wellFormed: 0, invalid: 0, lines: [], lineCount: 0 };
  let line = 1;
  let lastLine = 0;
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i] ?? 0;
    if (b < 0x80) {
      if (b === 0x0a) line++;
      i++;
      continue;
    }
    const length = sequenceLength(bytes, i);
    if (length > 0) {
      survey.wellFormed++;
      i += length;
      continue;
    }
    survey.invalid++;
    if (lastLine !== line) {
      survey.lineCount++;
      if (survey.lines.length < 8) survey.lines.push(line);
      lastLine = line;
    }
    i++;
  }
  return survey;
}

// UTF-16 LE/BE byte-order marks: not CSV text for this parser.
function hasUtf16Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 2
    && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
}

// Invalid UTF-8: decode as Windows-1252 and flag it. The mapping is done
// here, byte by byte, never through TextDecoder("windows-1252"): a Node
// built without full ICU (the alpine images the middle runs on) serves
// ISO-8859-1 under that label, which turns the euro byte 0x80 into the
// invisible control U+0080 — the September SP amounts « 501 k€ » then read
// as « 501 k » plus junk and every k€ column came out empty (2026-09-10).
function decodeFallback(body: Uint8Array): DecodedCsv {
  return {
    text: decodeWindows1252(body),
    encoding: "windows-1252",
    warnings: ["encodage Windows-1252 détecté (UTF-8 attendu) — accents décodés, export à corriger"],
    doubts: [],
  };
}

/** Code points of the Windows-1252 bytes 0x80–0x9F (the ones ISO-8859-1 lacks). */
const CP1252_HIGH: readonly number[] = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

/**
 * Decodes Windows-1252 bytes to text without any platform decoder: bytes
 * below 0x80 and from 0xA0 are their own code points, 0x80–0x9F go through
 * the table (€, ’, “ ”, …, œ, Œ, –, —).
 * Inputs: the bytes. Output: the text. Failure modes: none — every byte maps.
 */
export function decodeWindows1252(bytes: Uint8Array): string {
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    const codes: number[] = new Array<number>(end - start);
    for (let i = start; i < end; i++) {
      const b = bytes[i] ?? 0;
      codes[i - start] = b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b - 0x80] ?? b) : b;
    }
    parts.push(String.fromCharCode(...codes));
  }
  return parts.join("");
}
