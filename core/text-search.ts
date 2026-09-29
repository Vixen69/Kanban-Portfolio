// Search text folding (author, 2026-09-29: « securite » must find
// « Sécurité »): case, accents, typographic apostrophes and runs of spaces
// never decide a match — the operator types fast, in front of the room.

/**
 * Folds a text for search: lowercase, accents stripped (NFD, combining
 * marks removed), typographic apostrophes as ', œ/æ spelled out, runs of
 * spaces as one, trimmed.
 * Input: any text. Output: the folded text. Failure: none.
 */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\u2019\u2018`\u00b4]/g, "'")
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when a card's title or code projet contains the query, both folded.
 * Inputs: the card (title, codename), the query as typed. Output: the
 * flag — an empty or blank query matches every card. Failure: none.
 */
export function cardMatchesQuery(card: { title: string; codename: string | null }, query: string): boolean {
  const needle = foldText(query);
  if (needle === "") return true;
  return foldText(card.title).includes(needle) || foldText(card.codename ?? "").includes(needle);
}
