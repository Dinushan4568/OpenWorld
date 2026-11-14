import { describe, expect, it } from 'vitest';
import {
  SKY_KEYFRAMES,
  keyDirection,
  phaseName,
  sampleSky,
  sunPosition,
  wrapHour,
} from '../src/game/world/dayNightPalette';

const channels = (hour: number): number[] => {
  const s = sampleSky(hour);
  return [...s.zenith, ...s.horizon, ...s.fog, ...s.sunColor, ...s.ambient, s.exposure, s.stars, s.night];
};

describe('day/night palette', () => {
  it('has ordered keyframes covering a full day', () => {
    expect(SKY_KEYFRAMES.length).toBeGreaterThanOrEqual(8);
    expect(SKY_KEYFRAMES[0].hour).toBe(0);
    for (let i = 1; i < SKY_KEYFRAMES.length; i++) {
      expect(SKY_KEYFRAMES[i].hour).toBeGreaterThan(SKY_KEYFRAMES[i - 1].hour);
    }
    expect(SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1].hour).toBe(24);
  });

  it('wraps midnight without a jump in any colour channel', () => {
    const before = channels(23.999);
    const after = channels(0.001);
    for (let i = 0; i < before.length; i++) {
      expect(Math.abs(before[i] - after[i])).toBeLessThan(0.02);
    }
    expect(wrapHour(-1)).toBeCloseTo(23, 6);
    expect(wrapHour(25)).toBeCloseTo(1, 6);
  });

  it('is continuous across the whole cycle', () => {
    for (let hour = 0; hour < 24; hour += 0.05) {
      const a = channels(hour);
      const b = channels(hour + 0.05);
      for (let i = 0; i < a.length; i++) {
        expect(Math.abs(a[i] - b[i])).toBeLessThan(0.06);
      }
    }
  });

  it('raises the sun between sunrise and sunset and the moon at night', () => {
    const noon = sunPosition(12);
    const midnight = sunPosition(0);
    expect(noon.elevation).toBeGreaterThan(0.9);
    expect(noon.aboveHorizon).toBe(true);
    expect(midnight.elevation).toBeLessThan(0);
    expect(midnight.aboveHorizon).toBe(false);
    for (let hour = 6.4; hour < 17.6; hour += 0.5) {
      expect(sunPosition(hour).aboveHorizon).toBe(true);
    }
    expect(sunPosition(5.5).aboveHorizon).toBe(false);
    expect(sunPosition(18.5).aboveHorizon).toBe(false);
  });

  it('gives the night a low-key palette and strong stars', () => {
    const night = sampleSky(0.5);
    const day = sampleSky(12);
    expect(night.night).toBeGreaterThan(0.85);
    expect(day.night).toBeLessThan(0.05);
    expect(night.stars).toBeGreaterThan(0.6);
    expect(day.stars).toBeLessThan(0.05);
    expect(night.sunIntensity).toBeLessThan(day.sunIntensity);
    expect(night.ambient[0]).toBeLessThan(day.ambient[0]);
    expect(night.exposure).toBeGreaterThan(0.4);
    const dir = keyDirection(12);
    expect(Math.hypot(dir[0], dir[1], dir[2])).toBeCloseTo(1, 5);
  });

  it('names the phases of the day', () => {
    expect(phaseName(2)).toBe('Night');
    expect(phaseName(5.2)).toBe('Dawn');
    expect(phaseName(12)).toBe('Midday');
    expect(phaseName(18.6)).toBe('Sunset');
    expect(phaseName(21)).toBe('Night');
  });
});
