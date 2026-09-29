// Number display of the whole interface. Two rules, one place:
//
//  · aggregates (column headers, canal labels, metrics KPIs) are read at
//    portfolio scale — whole units, decimals would be noise;
//  · card- and fiche-level figures keep AT MOST ONE decimal — enough to be
//    faithful (24,5 j.h), never enough to be unreadable (24,52999999).
//
// French grouping and comma throughout. Editing paths never format: an
// <input type="number"> needs the raw value, comma-free.

const UNIT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const DEC = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/**
 * Aggregate figure, whole units (k€, j.h, counts at portfolio scale).
 * Inputs: a number. Outputs: the fr-FR string ("1 250"). Failure modes:
 * none — a non-finite value renders as "—" rather than "NaN".
 */
export function fmtUnit(value: number): string {
  return Number.isFinite(value) ? UNIT.format(value) : "—";
}

/**
 * Card- or fiche-level figure, at most one decimal ("24,5", "1 250").
 * Inputs: a number. Outputs: the fr-FR string. Failure modes: none — a
 * non-finite value renders as "—".
 */
export function fmtNum(value: number): string {
  return Number.isFinite(value) ? DEC.format(value) : "—";
}
