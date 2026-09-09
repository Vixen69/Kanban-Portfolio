// The Sciforma « Nom » often repeats the project Id in front of the label
// (« PX4520155 - Modernisation atelier »). The card keeps the Id as its
// codename; its title must be the label alone, otherwise the sidebar's
// codes-projet switch shows the code twice or never hides it (author,
// 2026-09-09). The raw name stays the key of the joins by name.

/** Separators tolerated between the code and the label. */
const SEPARATORS = "\\s\\-–—:·._/|";

/**
 * Removes the project code when the name starts with it — the code alone,
 * or wrapped in brackets / parentheses, followed by any run of separators
 * (space, dash, colon, dot, underscore, slash, pipe). The match is
 * case-insensitive and stops at a word boundary: an Id that is only the
 * prefix of a longer token is left alone. A name reduced to its code is
 * kept as is.
 * Inputs: the raw name and the code (the Id); a null or empty code strips
 * nothing.
 * Output: the trimmed name without its leading code.
 * Failure modes: none.
 */
export function stripCodePrefix(name: string, code: string | null): string {
  const trimmed = name.trim();
  const key = code?.trim() ?? "";
  if (key === "") return trimmed;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = new RegExp(`^[\\[(]?\\s*${escaped}\\s*[\\])]?(?=$|[${SEPARATORS}])`, "i");
  const m = trimmed.match(head);
  if (m === null) return trimmed;
  const rest = trimmed.slice(m[0].length).replace(new RegExp(`^[${SEPARATORS}]+`), "").trim();
  return rest === "" ? trimmed : rest;
}
