/**
 * Seeded pseudo-random number generator (mulberry32).
 * Returns a factory that creates RNG instances from a numeric seed.
 */

export function createRNG(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 1;

  function next() {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns float in [0, 1) */
  function random() {
    return next();
  }

  /** Returns float in [min, max) */
  function range(min, max) {
    return min + next() * (max - min);
  }

  /** Returns integer in [min, max] inclusive */
  function int(min, max) {
    return Math.floor(min + next() * (max - min + 1));
  }

  /** Picks one element from an array */
  function pick(arr) {
    return arr[Math.floor(next() * arr.length)];
  }

  /** Shuffles array in-place using Fisher-Yates */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return { random, range, int, pick, shuffle };
}

/**
 * Converts a string seed to a numeric seed via simple hash.
 */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
