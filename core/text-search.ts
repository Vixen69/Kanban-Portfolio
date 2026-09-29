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

// A keystroke folds the query once, not once per card; a card is folded
// once for its lifetime — the fold builds new card objects, never mutates
// them (ADR 051: typing in front of the room, on a CPU without GPU).
let lastQuery = "";
let lastNeedle = "";
const haystacks = new WeakMap<object, string>();

function needleOf(query: string): string {
  if (query !== lastQuery) {
    lastQuery = query;
    lastNeedle = foldText(query);
  }
  return lastNeedle;
}

// Title and code folded, joined by a line break a folded needle never holds
// (foldText turns every whitespace into one space): no match across both.
function haystackOf(card: { title: string; codename: string | null }): string {
  let haystack = haystacks.get(card);
  if (haystack === undefined) {
    haystack = `${foldText(card.title)}\n${foldText(card.codename ?? "")}`;
    haystacks.set(card, haystack);
  }
  return haystack;
}

/**
 * True when a card's title or code projet contains the query, both folded.
 * Inputs: the card (title, codename — read once per card object), the
 * query as typed. Output: the flag — an empty or blank query matches every
 * card. Failure: none.
 */
export function cardMatchesQuery(card: { title: string; codename: string | null }, query: string): boolean {
  const needle = needleOf(query);
  if (needle === "") return true;
  return haystackOf(card).includes(needle);
}
