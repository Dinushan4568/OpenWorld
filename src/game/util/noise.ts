/**
 * Deterministic noise toolkit.
 * Value noise with quintic interpolation and a seeded permutation table — the same
 * coordinates always produce the same landscape on every machine.
 */

const PERM_SIZE = 512;

export interface Noise2D {
  readonly seed: number;
  noise(x: number, y: number): number;
  fbm(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
  ridged(x: number, y: number, octaves?: number): number;
}

/** Cheap integer hash → [0, 1). */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function createNoise2D(seed = 1337): Noise2D {
  // Build a permutation table so lattice hashing is decorrelated from the seed.
  const perm = new Uint16Array(PERM_SIZE);
  const rand = (() => {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  for (let i = 0; i < PERM_SIZE; i++) perm[i] = i % 256;
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }

  const noise = (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);

    const p00 = perm[(perm[xi & 255] + (yi & 255)) & 511] / 255;
    const p10 = perm[(perm[(xi + 1) & 255] + (yi & 255)) & 511] / 255;
    const p01 = perm[(perm[xi & 255] + ((yi + 1) & 255)) & 511] / 255;
    const p11 = perm[(perm[(xi + 1) & 255] + ((yi + 1) & 255)) & 511] / 255;

    // Blend hash-derived lattice values; then push the result through a smooth
    // curve so octaves stack without visible axis alignment.
    const a = p00 + (p10 - p00) * u;
    const b = p01 + (p11 - p01) * u;
    const value = a + (b - a) * v;
    return value * 2 - 1;
  };

  const fbm = (x: number, y: number, octaves = 5, lacunarity = 2.03, gain = 0.5): number => {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq + o * 37.7, y * freq - o * 19.3) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  };

  const ridged = (x: number, y: number, octaves = 5): number => {
    let amp = 0.55;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(noise(x * freq + o * 11.9, y * freq + o * 5.1));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.11;
    }
    return norm > 0 ? sum / norm : 0;
  };

  return { seed, noise, fbm, ridged };
}

/** Shared world noise instances (deterministic seeds). */
export const terrainNoise = createNoise2D(90210);
export const detailNoise = createNoise2D(4242);
export const scatterNoise = createNoise2D(7);
export { hash2 };
