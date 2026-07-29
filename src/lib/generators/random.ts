/**
 * Seedable pseudo-random generator shared by every generator module.
 *
 * Using an explicit seed makes generation reproducible (a given seed always
 * yields the same NPC/shop/name), which powers "regenerate", shareable results,
 * and — importantly — deterministic unit tests. `mulberry32` is a tiny, fast,
 * well-distributed 32-bit PRNG; we don't need cryptographic quality here.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Pick one element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Pick `count` distinct elements (or fewer if the array is smaller). */
  sample<T>(items: readonly T[], count: number): T[];
  /** True with the given probability (0..1). */
  chance(probability: number): boolean;
  /** Weighted pick. */
  weighted<T>(entries: readonly { value: T; weight: number }[]): T;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash an arbitrary string into a 32-bit seed (so seeds can be words). */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Create an RNG from a numeric or string seed (random if omitted). */
export function createRng(seed?: number | string): Rng {
  const numericSeed =
    seed === undefined
      ? (Math.random() * 2 ** 32) >>> 0
      : typeof seed === "string"
        ? hashSeed(seed)
        : seed >>> 0;
  const rand = mulberry32(numericSeed);

  const rng: Rng = {
    next: rand,
    int: (min, max) => min + Math.floor(rand() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error("pick() on empty array");
      return items[Math.floor(rand() * items.length)]!;
    },
    sample: (items, count) => {
      const pool = [...items];
      const out: (typeof items)[number][] = [];
      const n = Math.min(count, pool.length);
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(rand() * pool.length);
        out.push(pool.splice(idx, 1)[0]!);
      }
      return out;
    },
    chance: (probability) => rand() < probability,
    weighted: (entries) => {
      const total = entries.reduce((sum, e) => sum + e.weight, 0);
      let threshold = rand() * total;
      for (const entry of entries) {
        threshold -= entry.weight;
        if (threshold <= 0) return entry.value;
      }
      return entries[entries.length - 1]!.value;
    },
  };
  return rng;
}

/** A short, human-friendly random seed string (for the seed field default). */
export function randomSeedString(): string {
  return Math.random().toString(36).slice(2, 8);
}
