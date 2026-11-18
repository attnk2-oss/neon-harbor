// A small seeded random number generator (mulberry32) with the few helpers the city builder
// and the AI need. The same seed gives the same Port Kessel and the same staged screenshots.

export function createRandom(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;

  function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A float in [min, max). */
  random.range = (min, max) => min + random() * (max - min);

  /** An integer in [min, max]. */
  random.int = (min, max) => Math.floor(min + random() * (max - min + 1));

  /** One element of an array. */
  random.pick = (items) => items[Math.floor(random() * items.length) % items.length];

  /** True with probability p. */
  random.chance = (p) => random() < p;

  /** -1 or 1. */
  random.sign = () => (random() < 0.5 ? -1 : 1);

  /** A shuffled copy, leaving the original alone. */
  random.shuffle = (items) => {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      const swap = copy[index];
      copy[index] = copy[other];
      copy[other] = swap;
    }
    return copy;
  };

  return random;
}

/**
 * A stable 0..1 value for an integer coordinate pair: used for per-window, per-roof and
 * per-puddle detail so the renderer can vary it without touching the simulation's RNG.
 */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
