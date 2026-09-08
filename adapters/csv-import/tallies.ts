// Aggregated signalements: cell-level anomalies are counted per message
// with up to 8 line numbers kept — a thousand-row export stays readable in
// the report while the ~20-project manual verification can still locate
// the occurrences. Shared by the contract readers (SP_total, then étapes
// 3-4).

/** One aggregated anomaly: occurrence count + the first line numbers. */
export interface Tally {
  count: number;
  lines: number[];
  /** Up to 3 distinct raw values, when the caller passes them (unreadable cells). */
  samples?: string[];
}

/** How many line numbers an aggregate keeps. */
const KEPT_LINES = 8;
/** How many distinct raw samples an aggregate keeps. */
const KEPT_SAMPLES = 3;

/**
 * Adds one occurrence to the aggregate under `key`.
 * Inputs: the aggregate map, the message key, the 1-based source line, an
 * optional raw sample (the offending cell, kept distinct, 3 at most).
 * Outputs: none (mutates the map). Failure modes: none.
 */
export function tallyInto(map: Map<string, Tally>, key: string, line: number, sample?: string): void {
  const entry = map.get(key) ?? { count: 0, lines: [], samples: [] };
  entry.count++;
  if (entry.lines.length < KEPT_LINES) entry.lines.push(line);
  const samples = entry.samples ?? (entry.samples = []);
  if (sample !== undefined && samples.length < KEPT_SAMPLES && !samples.includes(sample)) samples.push(sample);
  map.set(key, entry);
}

/**
 * Renders one aggregate as its French report suffix:
 * « N cellule(s), ligne(s) 2, 3, … — ex. « valeur » ».
 * Inputs: the tally. Outputs: the label. Failure modes: none.
 */
export function tallyLabel(t: Tally): string {
  const suffix = t.count > t.lines.length ? ", …" : "";
  const samples = (t.samples ?? []).map((s) => `« ${s} »`).join(", ");
  return `${t.count} cellule(s), ligne(s) ${t.lines.join(", ")}${suffix}${samples === "" ? "" : ` — ex. ${samples}`}`;
}
