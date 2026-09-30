// A short, stable fingerprint of a text (FNV-1a, 32 bits): the name-derived
// identities of ADR 058 and the doubt and option ids of ADR 062 are built
// with it — the same text always gives the same 8 hex digits, whatever the
// machine or the run. Not a security hash. Pure.

/**
 * FNV-1a, 32 bits, as 8 hex digits.
 * Input: any text. Output: the fingerprint. Failure modes: none.
 */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
