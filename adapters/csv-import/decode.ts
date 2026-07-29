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

// Invalid UTF-8: decode as Windows-1252 (every byte maps, never throws) and
// flag it. The constructor guard covers no-ICU Node builds, where the label
// is unknown — degrade to lossy UTF-8 rather than crash the audit.
function decodeFallback(body: Uint8Array): DecodedCsv {
  try {
    const text = new TextDecoder("windows-1252").decode(body);
    return {
      text,
      encoding: "windows-1252",
      warnings: ["encodage Windows-1252 détecté (UTF-8 attendu) — accents décodés, export à corriger"],
    };
  } catch {
    const text = new TextDecoder("utf-8").decode(body);
    return {
      text,
      encoding: "unknown",
      warnings: ["encodage indéterminé — décodage UTF-8 de secours, des caractères ont pu être perdus"],
    };
  }
}
