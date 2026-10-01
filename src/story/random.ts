export type Random = () => number;

/**
 * A private, seedable PRNG stream. Identical seeds replay identical stories.
 * Mirrors engine/random.ts so the story module stays self-contained.
 */
export function createRandom(seed?: string | number): Random {
  if (seed === undefined) return Math.random;
  if (typeof seed === 'number' && !Number.isFinite(seed)) {
    throw new RangeError('The story seed must be finite.');
  }

  let state = 2166136261;
  for (const character of String(seed)) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
