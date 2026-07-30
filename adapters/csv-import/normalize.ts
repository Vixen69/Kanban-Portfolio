// Text normalization shared by header matching and label resolution.
// Pure and dependency-free; the tolerance rules come from
// docs/IMPORT-MAPPING.md ("rapprochement par nom normalisé : casse, accents").
// Some Excel CSV exports DESTROY accents (é -> "?", "�", or dropped) —
// a real case on the client side, so closed vocabularies also get a
// damage-tolerant matcher, used only when the exact lookup fails.

const BOM = String.fromCharCode(0xfeff);

/**
 * Canonical form for tolerant label comparison.
 * Inputs: any raw header or cell text.
 * Outputs: trimmed, BOM-free, whitespace-collapsed, lowercased, accent-free
 * string; œ/æ are expanded to oe/ae because NFD does not decompose them;
 * typographic apostrophes are unified to the ASCII one (the board config
 * uses « ’ », the exports use « ' » — both must compare equal).
 * Failure modes: none — total function, empty input yields "".
 */
export function normalizeLabel(raw: string): string {
  return raw
    .replaceAll(BOM, "")
    .replace(/[’‘ʼ´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

// Like normalizeLabel but keeps the accents — the tolerant pattern needs
// to know WHERE the fragile characters sit in the canonical label.
function cleanKeepAccents(raw: string): string {
  return raw
    .replaceAll(BOM, "")
    .replace(/[’‘ʼ´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFC");
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const REPLACEMENT = String.fromCharCode(0xfffd);

/**
 * Builds a regex matching a canonical label against its destroyed forms:
 * every accented character may appear as its ASCII base, as « ? », as the
 * Unicode replacement character, or not at all (« Début » matches
 * « debut », « d?but », « d�but » and « dbut »).
 * Inputs: the canonical label. Outputs: an anchored case-normalized regex
 * to test against normalizeLabel() output. Failure modes: none.
 */
export function damageTolerantPattern(label: string): RegExp {
  let pattern = "^";
  for (const ch of cleanKeepAccents(label)) {
    if (ch === "œ") {
      pattern += `(?:oe|\\?|${REPLACEMENT})?`;
      continue;
    }
    if (ch === "æ") {
      pattern += `(?:ae|\\?|${REPLACEMENT})?`;
      continue;
    }
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
    const escaped = base.replace(REGEX_SPECIALS, "\\$&");
    pattern += base === ch ? escaped : `(?:${escaped}|\\?|${REPLACEMENT})?`;
  }
  return new RegExp(pattern + "$");
}

/** Outcome of a tolerant lookup: the id, and whether repair was needed. */
export interface TolerantHit {
  id: string;
  repaired: boolean;
}

/**
 * Builds a label -> id lookup that survives destroyed accents: exact
 * normalized match first, then the damage-tolerant patterns. A damaged
 * cell matching several DISTINCT ids is ambiguous and yields null (never
 * a silent guess).
 * Inputs: [label, id] pairs (several labels may share an id).
 * Outputs: a lookup function returning the hit (repaired=true when the
 * tolerant path was needed) or null. Failure modes: none.
 */
export function createTolerantLookup(
  entries: Array<[string, string]>,
): (cell: string) => TolerantHit | null {
  const exact = new Map<string, string>();
  const patterns: Array<{ re: RegExp; id: string }> = [];
  for (const [label, id] of entries) {
    const key = normalizeLabel(label);
    if (!exact.has(key)) exact.set(key, id);
    patterns.push({ re: damageTolerantPattern(label), id });
  }
  return (cell) => {
    const key = normalizeLabel(cell);
    const direct = exact.get(key);
    if (direct !== undefined) return { id: direct, repaired: false };
    const ids = new Set(patterns.filter((p) => p.re.test(key)).map((p) => p.id));
    const first = [...ids];
    return first.length === 1 && first[0] !== undefined
      ? { id: first[0], repaired: true }
      : null;
  };
}
