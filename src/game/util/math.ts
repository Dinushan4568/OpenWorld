/** Small, dependency-free math helpers shared by gameplay, world building and UI. */

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const inverseLerp = (a: number, b: number, v: number): number => (a === b ? 0 : clamp((v - a) / (b - a), 0, 1));

/** Frame-rate independent exponential smoothing. `lambda` is the convergence rate per second. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

export const smootherstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const wrapAngle = (angle: number): number => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export const dampAngle = (current: number, target: number, lambda: number, dt: number): number =>
  current + wrapAngle(target - current) * (1 - Math.exp(-lambda * dt));

export const distance2D = (ax: number, az: number, bx: number, bz: number): number =>
  Math.hypot(bx - ax, bz - az);

/** sRGB (0..1) to linear — PlayCanvas expects linear vertex colours. */
export const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

export const rgbToLinear = (r: number, g: number, b: number): [number, number, number] => [
  srgbToLinear(r),
  srgbToLinear(g),
  srgbToLinear(b),
];

/** Format seconds as m:ss for the HUD. */
export const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** Simple deterministic PRNG (mulberry32) returning floats in [0, 1). */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomRange = (rng: () => number, min: number, max: number): number => min + rng() * (max - min);

export const pick = <T>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length];
