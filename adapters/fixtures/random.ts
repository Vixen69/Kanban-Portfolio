// Seeded PRNG so every run of the fixtures adapter yields the same board.
// mulberry32: tiny, deterministic, good enough for synthetic data.

/** A deterministic pseudo-random helper bound to one seed. */
export interface SeededRandom {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy (Fisher-Yates); the input is not mutated. */
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * Creates a seeded PRNG (mulberry32).
 * Input: an integer seed. Output: a SeededRandom.
 * Failure: none — any number is coerced to a 32-bit seed.
 */
export function createSeededRandom(seed: number): SeededRandom {
  let state = seed | 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) throw new Error("pick: tableau vide");
    return item;
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  };
  return { next, int, pick, shuffle };
}
