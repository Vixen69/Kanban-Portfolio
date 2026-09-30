// Day-count sums of the plan de charge (ADR 058, determinism): the raw
// values are added — exactly, to the millionth of a day, so the sum is the
// same whatever the rows' order — and rounded to two decimals ONCE, when
// the bucket is read. Rounding every partial sum made 8 × 0,125 j.h read
// 1,04 and let the row order decide the last hundredth. Pure.

/**
 * Adds two day counts, exact to the millionth of a day (the float noise
 * of the addition is dropped, the order of the additions no longer
 * matters for values of at most six decimals).
 * Inputs: the running sum, the value. Output: the new sum. Failure: none.
 */
export function addDays(sum: number, value: number): number {
  return Math.round((sum + value) * 1e6) / 1e6;
}

/**
 * A day count at two decimals — the precision the board shows and stores.
 * Input: a raw sum. Output: the rounded value. Failure modes: none.
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Rounds a { jh, done } bucket in place, once, when the sums are complete.
 * Input: the bucket (mutated). Output: none. Failure modes: none.
 */
export function roundBucket(bucket: { jh: number; done: number }): void {
  bucket.jh = round2(bucket.jh);
  bucket.done = round2(bucket.done);
}
