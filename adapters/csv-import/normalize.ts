// Text normalization shared by header matching and RDOM label resolution.
// Pure and dependency-free; the tolerance rules come from
// docs/IMPORT-MAPPING.md ("rapprochement par nom normalisé : casse, accents").

const BOM = String.fromCharCode(0xfeff);

/**
 * Canonical form for tolerant label comparison.
 * Inputs: any raw header or cell text.
 * Outputs: trimmed, BOM-free, whitespace-collapsed, lowercased, accent-free
 * string; œ/æ are expanded to oe/ae because NFD does not decompose them.
 * Failure modes: none — total function, empty input yields "".
 */
export function normalizeLabel(raw: string): string {
  return raw
    .replaceAll(BOM, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}
