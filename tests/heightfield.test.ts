import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/game/config';
import {
  depthAt,
  findSpawnPoint,
  heightAt,
  normalAt,
  steepnessAt,
} from '../src/game/world/heightfield';

describe('heightfield', () => {
  it('is deterministic', () => {
    const a = heightAt(12.5, -40.25);
    const b = heightAt(12.5, -40.25);
    expect(a).toBe(b);
    expect(Number.isFinite(a)).toBe(true);
  });

  it('keeps the lake below the water line and the spawn above it', () => {
    expect(heightAt(WORLD.lakeCenter.x, WORLD.lakeCenter.z)).toBeLessThan(WORLD.waterLevel);
    const spawn = findSpawnPoint();
    expect(spawn.y).toBeGreaterThan(WORLD.waterLevel);
    expect(spawn.y).toBeCloseTo(heightAt(spawn.x, spawn.z), 5);
    expect(distanceToCentre(spawn.x, spawn.z)).toBeLessThan(WORLD.boundaryRadius);
  });

  it('produces a unit-length surface normal', () => {
    const n = normalAt(30, 30);
    expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 4);
    expect(n[1]).toBeGreaterThan(0);
  });

  it('reports water depth consistent with the water level', () => {
    // depthAt returns metres above the water surface, so submerged ground is negative.
    const centre = depthAt(WORLD.lakeCenter.x, WORLD.lakeCenter.z);
    expect(centre).toBeLessThan(0);
    const spawn = findSpawnPoint();
    expect(depthAt(spawn.x, spawn.z)).toBeGreaterThan(0);
  });

  it('keeps terrain steepness in [0, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const t = steepnessAt(i * 7 - 150, i * -5 + 90);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
});

function distanceToCentre(x: number, z: number): number {
  return Math.hypot(x, z);
}
