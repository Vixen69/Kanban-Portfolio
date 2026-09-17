// The log's sequence number, read from an event id. Its own module so the
// fold (state.ts) and the restore filter (restore.ts) can both use it
// without importing each other.

/**
 * Numeric suffix of an event id ("evt-12" -> 12) — the log's sequence
 * number. Lexicographic comparison would order "evt-10" before "evt-9"
 * and break insertion-order replays.
 * Input: the event id. Output: the sequence, 0 when unreadable. Failure: none.
 */
export function eventSequence(id: string): number {
  const sequence = Number(id.slice(id.lastIndexOf("-") + 1));
  return Number.isNaN(sequence) ? 0 : sequence;
}
