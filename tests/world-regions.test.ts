import { describe, expect, it } from 'vitest';
import {
  areaNameAt,
  findSpawnPoint,
  heightAt,
  regionAtPoint,
  regionTintAt,
  regionDefinitionAt,
  slopeDegreesAt,
} from '../src/game/world/heightfield';
import { POINTS_OF_INTEREST, REGIONS, REGION_LIST } from '../src/game/world/regions';
import { SHARD_LOCATIONS } from '../src/game/config';

describe('world regions', () => {
  it('classifies each point of interest into its own region', () => {
    for (const poi of POINTS_OF_INTEREST) {
      expect(regionAtPoint(poi.x, poi.z)).toBe(poi.region);
    }
    expect(regionAtPoint(46, -34)).toBe('valley');
  });

  it('has a unique, descriptive name for every region', () => {
    const names = REGION_LIST.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    expect(REGIONS.city.name).toBe('Abandoned City');
    expect(areaNameAt(-186, -18)).toBe('The Glasshouse Terraces');
    expect(areaNameAt(-100, 190)).toBe('Station Theta');
    expect(areaNameAt(190, -104)).toBe('The Mother Tree');
    expect(areaNameAt(46, -34)).toBe('The Sunken Plaza');
  });

  it('flattens the city and facility pads for building', () => {
    const city = REGIONS.city.center;
    const facility = REGIONS.facility.center;
    expect(slopeDegreesAt(city.x, city.z)).toBeLessThan(4);
    expect(slopeDegreesAt(facility.x, facility.z)).toBeLessThan(4);
    expect(Math.abs(heightAt(city.x + 6, city.z) - heightAt(city.x - 6, city.z))).toBeLessThan(1.2);
  });

  it('raises the highlands and keeps the spawn trail walkable', () => {
    expect(heightAt(-100, 190)).toBeGreaterThan(25);
    const spawn = findSpawnPoint();
    expect(slopeDegreesAt(spawn.x, spawn.z)).toBeLessThan(14);
    expect(heightAt(spawn.x, spawn.z)).toBeGreaterThan(-1);
    expect(regionDefinitionAt(spawn.x, spawn.z).kind).toBe('wild');
  });

  it('keeps every echo shard dry and walkable', () => {
    for (const shard of SHARD_LOCATIONS) {
      expect(heightAt(shard.x, shard.z)).toBeGreaterThan(0);
      expect(slopeDegreesAt(shard.x, shard.z)).toBeLessThan(30);
    }
  });

  it('tints each region distinctly', () => {
    const tint = (x: number, z: number): number[] => regionTintAt(x, z, 1);
    const city = tint(-198, -25);
    const facility = tint(-100, 190);
    const forest = tint(190, -104);
    const valley = tint(46, -34);
    expect(city).not.toEqual(facility);
    expect(forest).not.toEqual(valley);
    expect(city[0]).toBeGreaterThan(forest[0]);
    expect(facility[0]).toBeCloseTo(facility[1], 0);
  });
});
