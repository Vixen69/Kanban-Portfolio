// Aggregated signalements: cell-level anomalies are counted per message
// with up to 8 line numbers kept — a thousand-row export stays readable in
// the report while the ~20-project manual verification can still locate
// the occurrences. Shared by the contract readers (SP_total, then étapes
// 3-4).

/** One aggregated anomaly: occurrence count + the first line numbers. */
export interface Tally {
  count: number;
  lines: number[];
}

/** How many line numbers an aggregate keeps. */
const KEPT_LINES = 8;

/**
 * Adds one occurrence to the aggregate under `key`.
 * Inputs: the aggregate map, the message key, the 1-based source line.
 * Outputs: none (mutates the map). Failure modes: none.
 */
export function tallyInto(map: Map<string, Tally>, key: string, line: number): void {
  const entry = map.get(key);
  if (entry === undefined) map.set(key, { count: 1, lines: [line] });
  else {
    entry.count++;
    if (entry.lines.length < KEPT_LINES) entry.lines.push(line);
  }
}

/**
 * Renders one aggregate as its French report suffix:
 * « N cellule(s), ligne(s) 2, 3, … ».
 * Inputs: the tally. Outputs: the label. Failure modes: none.
 */
export function tallyLabel(t: Tally): string {
  const suffix = t.count > t.lines.length ? ", …" : "";
  return `${t.count} cellule(s), ligne(s) ${t.lines.join(", ")}${suffix}`;
}
