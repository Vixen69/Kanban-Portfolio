// Bytes -> text for CSV inputs. Encoding policy from docs/IMPORT-MAPPING.md:
// UTF-8 expected (BOM tolerated), Windows-1252 detected and flagged, UTF-16
// refused with guidance. Pure: callers provide the bytes, no Node APIs here.

/** Outcome of decoding one CSV file. */
export interface DecodedCsv {
  /** Decoded text, byte-order mark already stripped. */
  text: string;
  /** What the bytes turned out to be. */
  encoding: "utf-8" | "utf-8-bom" | "windows-1252" | "unknown";
  /** French signalements for the report (deviant encoding, fallback...). */
  warnings: string[];
  /** Set when the bytes cannot be treated as CSV text (UTF-16 BOM). */
  unsupported?: string;
}

/**
 * Decodes CSV bytes according to the import encoding policy.
 * Inputs: raw file bytes.
 * Outputs: DecodedCsv — text plus the detected encoding and French warnings;
 * `unsupported` is set (and text empty) for UTF-16 files.
 * Failure modes: none — undecodable bytes degrade to replacement characters
 * with encoding "unknown" and a warning, never a throw.
 */
export function decodeCsvBytes(bytes: Uint8Array): DecodedCsv {
  if (hasUtf16Bom(bytes)) {
    return {
      text: "",
      encoding: "unknown",
      warnings: [],
      unsupported: "encodage UTF-16 non pris en charge — exporter en UTF-8",
    };
  }
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return { text, encoding: hasBom ? "utf-8-bom" : "utf-8", warnings: [] };
  } catch {
    return decodeFallback(body);
  }
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
