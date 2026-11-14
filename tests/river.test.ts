import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/game/config';
import {
  riverDistance,
  riverProfile,
  riverSurfaceAt,
  heightAt,
  waterfalls,
} from '../src/game/world/heightfield';

describe('river profile', () => {
  const profile = riverProfile();

  it('descends monotonically from source to lake', () => {
    let previous = Infinity;
    for (const station of profile.stations) {
      expect(station.y).toBeLessThanOrEqual(previous + 1e-6);
      previous = station.y;
    }
  });

  it('meets Mirrorwater at the water line', () => {
    const mouth = profile.stations[profile.stations.length - 1];
    expect(mouth.y).toBeCloseTo(WORLD.waterLevel, 5);
  });

  it('keeps a navigable channel along the centreline', () => {
    for (let i = 2; i < profile.stations.length - 2; i += 6) {
      const station = profile.stations[i];
      const bed = heightAt(station.x, station.z);
      expect(station.y - bed).toBeGreaterThan(0.9);
      expect(station.y - bed).toBeLessThan(2.1);
      expect(riverDistance(station.x, station.z)).toBeLessThan(0.5);
      expect(riverSurfaceAt(station.x, station.z)).toBeCloseTo(station.y, 1);
    }
  });

  it('drops over exactly two waterfalls, with no stair-stepped tail', () => {
    expect(waterfalls.length).toBe(2);
    for (const fall of waterfalls) {
      expect(fall.drop).toBeGreaterThan(5.5);
    }
    // Every remaining station-to-station step is a gentle gradient.
    for (let i = 1; i < profile.stations.length; i++) {
      const drop = profile.stations[i - 1].y - profile.stations[i].y;
      const atFall = waterfalls.some((fall) => Math.abs(fall.drop - drop) < 0.05);
      if (!atFall) expect(drop).toBeLessThan(1.3);
    }
  });

  it('samples a continuous surface by arc length', () => {
    for (let d = 0; d <= profile.length; d += 7) {
      const a = profile.surfaceAtDistance(d);
      const b = profile.surfaceAtDistance(d + 0.01);
      expect(Math.abs(a - b)).toBeLessThan(0.05);
      expect(a).toBeLessThanOrEqual(profile.stations[0].y + 1e-6);
    }
  });
});
