// The Sciforma « Nom » often carries the project code as well as the Id
// (« PX4520155 - Modernisation atelier », « Cartographie PE10008 »). The
// card keeps the code as its codename; its title must not repeat it,
// otherwise the sidebar's codes-projet switch shows the code twice or never
// hides it (author, 2026-09-09/10). The raw name stays the key of the joins
// by name.

/** Separators tolerated around a code, and stripped from the title's edges. */
const SEPARATORS = "\\s\\-–—:·._/|";

// A code is a standalone token when it is not glued to a letter or a digit
// (an underscore, a dot or a slash is a separator, not a boundary), with an
// optional single bracket or parenthesis around it.
function codeRegExp(code: string): RegExp {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![0-9A-Za-z])[\\[(]?${escaped}[\\])]?(?![0-9A-Za-z])`, "gi");
}

// Collapses the scars left by excising a code: emptied brackets, doubled
// separators, dangling edges.
function tidy(s: string): string {
  return s
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(new RegExp(`(?:\\s*[${SEPARATORS}]\\s*){2,}`, "g"), " - ")
    .replace(new RegExp(`^[${SEPARATORS}]+|[${SEPARATORS}]+$`, "g"), "")
    .trim();
}

/**
 * Removes the project code from a name wherever it appears as a standalone
 * token — at the front, inside, or wrapped in brackets/parentheses — so the
 * title reads without it. The match is case-insensitive and bounded so an
 * Id that is only the prefix of a longer token (« PX45201559 » vs the code
 * « PX4520155 ») is left alone. A name reduced to its code is kept as is.
 * Inputs: the raw name and the code (the Id or embedded code); a null or
 * empty code strips nothing.
 * Output: the trimmed name without its code.
 * Failure modes: none.
 */
export function stripCode(name: string, code: string | null): string {
  const trimmed = name.trim();
  const key = code?.trim() ?? "";
  if (key === "") return trimmed;
  const cleaned = tidy(trimmed.replace(codeRegExp(key), " "));
  return cleaned === "" ? trimmed : cleaned;
}
