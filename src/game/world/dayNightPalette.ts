/**
 * Time-of-day colour and lighting keyframes.
 *
 * Pure data + interpolation, so the cycle can be tested without a GPU.
 * Hours are 0..24 and wrap seamlessly at midnight.
 */
import { clamp, lerp } from '../util/math';

export type Rgb = [number, number, number];

export interface SkyKeyframe {
  hour: number;
  zenith: Rgb;
  horizon: Rgb;
  fog: Rgb;
  sunColor: Rgb;
  sunIntensity: number;
  fillColor: Rgb;
  fillIntensity: number;
  ambient: Rgb;
  exposure: number;
  stars: number;
  /** 0 = full day, 1 = deep night: drives emissive lamps and crystal glow. */
  night: number;
}

export interface SkySample extends Omit<SkyKeyframe, 'hour'> {
  hour: number;
}

export const SKY_KEYFRAMES: readonly SkyKeyframe[] = [
  {
    hour: 0,
    zenith: [0.012, 0.02, 0.05],
    horizon: [0.03, 0.05, 0.09],
    fog: [0.02, 0.035, 0.06],
    sunColor: [0.55, 0.68, 1],
    sunIntensity: 0.2,
    fillColor: [0.08, 0.11, 0.2],
    fillIntensity: 0.16,
    ambient: [0.018, 0.026, 0.048],
    exposure: 0.62,
    stars: 1,
    night: 1,
  },
  {
    hour: 4.6,
    zenith: [0.03, 0.05, 0.11],
    horizon: [0.12, 0.12, 0.2],
    fog: [0.075, 0.085, 0.14],
    sunColor: [0.6, 0.7, 1],
    sunIntensity: 0.16,
    fillColor: [0.1, 0.13, 0.24],
    fillIntensity: 0.16,
    ambient: [0.025, 0.035, 0.06],
    exposure: 0.66,
    stars: 0.85,
    night: 0.92,
  },
  {
    hour: 6,
    zenith: [0.14, 0.22, 0.4],
    horizon: [0.85, 0.45, 0.28],
    fog: [0.45, 0.33, 0.3],
    sunColor: [1, 0.6, 0.4],
    sunIntensity: 0.95,
    fillColor: [0.26, 0.3, 0.46],
    fillIntensity: 0.22,
    ambient: [0.06, 0.08, 0.12],
    exposure: 0.8,
    stars: 0.12,
    night: 0.36,
  },
  {
    hour: 7.6,
    zenith: [0.22, 0.4, 0.64],
    horizon: [0.75, 0.73, 0.64],
    fog: [0.56, 0.6, 0.59],
    sunColor: [1, 0.86, 0.68],
    sunIntensity: 1.7,
    fillColor: [0.4, 0.55, 0.7],
    fillIntensity: 0.3,
    ambient: [0.1, 0.13, 0.16],
    exposure: 0.97,
    stars: 0,
    night: 0,
  },
  {
    hour: 12,
    zenith: [0.22, 0.44, 0.72],
    horizon: [0.65, 0.75, 0.8],
    fog: [0.52, 0.64, 0.68],
    sunColor: [1, 0.96, 0.9],
    sunIntensity: 2.05,
    fillColor: [0.45, 0.62, 0.78],
    fillIntensity: 0.36,
    ambient: [0.12, 0.15, 0.18],
    exposure: 1.02,
    stars: 0,
    night: 0,
  },
  {
    hour: 16.5,
    zenith: [0.24, 0.42, 0.66],
    horizon: [0.8, 0.72, 0.58],
    fog: [0.62, 0.6, 0.52],
    sunColor: [1, 0.84, 0.6],
    sunIntensity: 1.75,
    fillColor: [0.42, 0.52, 0.64],
    fillIntensity: 0.28,
    ambient: [0.1, 0.12, 0.14],
    exposure: 0.98,
    stars: 0,
    night: 0,
  },
  {
    hour: 18,
    zenith: [0.18, 0.26, 0.44],
    horizon: [0.95, 0.5, 0.28],
    fog: [0.6, 0.4, 0.32],
    sunColor: [1, 0.55, 0.32],
    sunIntensity: 1.15,
    fillColor: [0.3, 0.32, 0.45],
    fillIntensity: 0.22,
    ambient: [0.07, 0.08, 0.11],
    exposure: 0.86,
    stars: 0.04,
    night: 0.42,
  },
  {
    hour: 19.3,
    zenith: [0.07, 0.1, 0.2],
    horizon: [0.45, 0.24, 0.2],
    fog: [0.24, 0.2, 0.22],
    sunColor: [0.8, 0.42, 0.32],
    sunIntensity: 0.3,
    fillColor: [0.16, 0.18, 0.28],
    fillIntensity: 0.16,
    ambient: [0.04, 0.05, 0.08],
    exposure: 0.75,
    stars: 0.38,
    night: 0.76,
  },
  {
    hour: 20.6,
    zenith: [0.02, 0.035, 0.09],
    horizon: [0.09, 0.09, 0.15],
    fog: [0.055, 0.07, 0.11],
    sunColor: [0.55, 0.68, 1],
    sunIntensity: 0.19,
    fillColor: [0.09, 0.12, 0.21],
    fillIntensity: 0.15,
    ambient: [0.02, 0.03, 0.055],
    exposure: 0.66,
    stars: 0.92,
    night: 1,
  },
  {
    hour: 24,
    zenith: [0.012, 0.02, 0.05],
    horizon: [0.03, 0.05, 0.09],
    fog: [0.02, 0.035, 0.06],
    sunColor: [0.55, 0.68, 1],
    sunIntensity: 0.2,
    fillColor: [0.08, 0.11, 0.2],
    fillIntensity: 0.16,
    ambient: [0.018, 0.026, 0.048],
    exposure: 0.62,
    stars: 1,
    night: 1,
  },
];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Interpolate the palette at an hour (wrapping across midnight). */
export function sampleSky(hour: number): SkySample {
  const h = ((hour % 24) + 24) % 24;
  let a = SKY_KEYFRAMES[0];
  let b = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1];
  for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
    if (h >= SKY_KEYFRAMES[i].hour && h <= SKY_KEYFRAMES[i + 1].hour) {
      a = SKY_KEYFRAMES[i];
      b = SKY_KEYFRAMES[i + 1];
      break;
    }
  }
  const span = b.hour - a.hour || 1;
  const t = clamp((h - a.hour) / span, 0, 1);
  return {
    hour: h,
    zenith: mix(a.zenith, b.zenith, t),
    horizon: mix(a.horizon, b.horizon, t),
    fog: mix(a.fog, b.fog, t),
    sunColor: mix(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    fillColor: mix(a.fillColor, b.fillColor, t),
    fillIntensity: lerp(a.fillIntensity, b.fillIntensity, t),
    ambient: mix(a.ambient, b.ambient, t),
    exposure: lerp(a.exposure, b.exposure, t),
    stars: lerp(a.stars, b.stars, t),
    night: lerp(a.night, b.night, t),
  };
}

export interface SunPosition {
  direction: Rgb;
  elevation: number;
  azimuth: number;
  aboveHorizon: boolean;
}

/**
 * Sun direction for an hour. Sunrise is at 06:00 and sunset at 18:00; the moon
 * is the antipode, so one key light can serve both.
 */
export function sunPosition(hour: number, azimuthOffset = 2.08, maxElevation = 1.05): SunPosition {
  const h = ((hour % 24) + 24) % 24;
  const dayPhase = (h - 6) / 12;
  const elevation = Math.sin(dayPhase * Math.PI) * maxElevation;
  const azimuth = azimuthOffset + dayPhase * Math.PI;
  const cos = Math.cos(elevation);
  return {
    direction: [Math.sin(azimuth) * cos, Math.sin(elevation), Math.cos(azimuth) * cos],
    elevation,
    azimuth,
    aboveHorizon: elevation > 0.015,
  };
}

/** Key-light direction: the sun by day, the moon by night. */
export function keyDirection(hour: number, azimuthOffset = 2.08): Rgb {
  const sun = sunPosition(hour, azimuthOffset);
  if (sun.aboveHorizon) return sun.direction;
  return [-sun.direction[0], -sun.direction[1], -sun.direction[2]];
}

export function phaseName(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h < 4.6) return 'Night';
  if (h < 6.4) return 'Dawn';
  if (h < 11) return 'Morning';
  if (h < 15) return 'Midday';
  if (h < 17.8) return 'Afternoon';
  if (h < 19.4) return 'Sunset';
  if (h < 20.8) return 'Dusk';
  return 'Night';
}

/** Wrap an hour into 0..24 with smooth wrapping. */
export function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}
