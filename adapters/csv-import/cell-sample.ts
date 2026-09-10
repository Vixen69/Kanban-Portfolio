// The sample the report shows for an unreadable cell reveals what the eye
// cannot see: every control character or invisible space is spelled as
// ⟨U+XXXX⟩ (no-break space, narrow no-break space, zero-width space, BOM,
// stray bytes). The September « 501 k » looked readable and was not — the
// sample must make the difference visible without any file leaving the
// client machine. Accented letters stay as they are.

/** Control characters and invisible spaces worth spelling out (accents excluded). */
const HIDDEN = /[\x00-\x1F\x7F-\x9F\u00A0\u00AD\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g;

/**
 * Trims a raw cell, keeps its first 40 characters and spells every hidden
 * character as ⟨U+XXXX⟩ so a report reader sees exactly what the parser saw.
 * Input: the raw cell text. Output: the annotated sample. Failure: none.
 */
export function sampleOf(raw: string): string {
  return raw.trim().slice(0, 40).replace(HIDDEN, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return `⟨U+${code.toString(16).toUpperCase().padStart(4, "0")}⟩`;
  });
}
