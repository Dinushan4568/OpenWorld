import { describe, expect, it } from 'vitest';
import {
  CREATURE_SPAWNS,
  SPECIES,
  SPECIES_ORDER,
  spawnsOfKind,
  type SpeciesDefinition,
} from '../src/game/creatures/species';
import { heightAt, isInWater, slopeDegreesAt } from '../src/game/world/heightfield';

describe('creature species catalogue', () => {
  it('defines exactly four original species with unique identities', () => {
    expect(SPECIES_ORDER).toHaveLength(4);
    const names = new Set<string>();
    const palettes = new Set<string>();
    const weaknesses = new Set<string>();
    for (const kind of SPECIES_ORDER) {
      const species = SPECIES[kind];
      expect(species.kind).toBe(kind);
      expect(species.name.length).toBeGreaterThan(3);
      expect(species.codename.length).toBeGreaterThan(2);
      expect(species.classification.length).toBeGreaterThan(8);
      expect(species.behaviour.length).toBeGreaterThan(40);
      expect(species.temperamentLine.length).toBeGreaterThan(20);
      names.add(species.name);
      palettes.add(species.palette.plate.join(','));
      weaknesses.add(species.weakness.label);
    }
    expect(names.size).toBe(4);
    expect(palettes.size).toBe(4);
    expect(weaknesses.size).toBe(4);
  });

  it('gives each species a distinct silhouette and rig', () => {
    const rigSizes = new Map<string, number>();
    for (const kind of SPECIES_ORDER) {
      const species = SPECIES[kind];
      expect(species.rig.height).toBeCloseTo(species.heightMetres, 1);
      expect(species.rig.joints.length).toBeGreaterThanOrEqual(9);
      rigSizes.set(kind, species.rig.joints.length);
      const names = new Set(species.rig.joints.map((joint) => joint.name));
      expect(names.size).toBe(species.rig.joints.length);
      for (const joint of species.rig.joints) {
        expect(Number.isFinite(joint.pivot[0])).toBe(true);
        if (joint.parent) expect(names.has(joint.parent)).toBe(true);
      }
      // Every creature must have a head, a body and something that moves.
      const roles = new Set(species.rig.joints.map((joint) => joint.role));
      expect(roles.has('body')).toBe(true);
      expect(roles.has('head')).toBe(true);
      expect(roles.has('leg') || roles.has('wing')).toBe(true);
    }
    expect(new Set(rigSizes.values()).size).toBeGreaterThan(1);
  });

  it('builds each species from the same reusable behaviours but different traits', () => {
    const kinds = SPECIES_ORDER.map((kind) => SPECIES[kind]);
    const speeds = new Set(kinds.map((species) => species.motion.walkSpeed.toFixed(2)));
    const temperaments = new Set(kinds.map((species) => species.temperament.aggression.toFixed(2)));
    const fovs = new Set(kinds.map((species) => species.senses.fovDegrees));
    expect(speeds.size).toBeGreaterThan(2);
    expect(temperaments.size).toBeGreaterThan(2);
    expect(fovs.size).toBeGreaterThan(1);
    // One species flies, one is a heavy grazer, one is a guardian, one is small.
    expect(kinds.some((species) => species.motion.flightAltitude > 0)).toBe(true);
    expect(kinds.some((species) => species.massKg > 2000)).toBe(true);
    expect(kinds.some((species) => species.temperament.aggression > 0.8)).toBe(true);
    expect(kinds.some((species) => species.massKg < 100)).toBe(true);
  });

  it('carries readable, non-violent weakness clues for every species', () => {
    const categories = new Set<string>();
    for (const kind of SPECIES_ORDER) {
      const weakness = SPECIES[kind].weakness;
      categories.add(weakness.category);
      expect(weakness.label.length).toBeGreaterThan(6);
      expect(weakness.clue.length).toBeGreaterThan(40);
      expect(weakness.exploit.length).toBeGreaterThan(60);
      expect(weakness.exploit.toLowerCase()).toContain('pulse');
      const text = `${weakness.clue} ${weakness.exploit}`.toLowerCase();
      for (const banned of ['blood', 'gore', 'kill', 'wound', 'corpse', 'dissect']) {
        expect(text.includes(banned)).toBe(false);
      }
    }
    expect(categories.size).toBe(4);
  });
});

describe('creature roster', () => {
  it('places every species in the existing open world', () => {
    for (const kind of SPECIES_ORDER) {
      expect(spawnsOfKind(kind).length).toBeGreaterThanOrEqual(2);
    }
    expect(CREATURE_SPAWNS.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(CREATURE_SPAWNS.map((spawn) => spawn.id));
    expect(ids.size).toBe(CREATURE_SPAWNS.length);
    // Both routine types must exist: walkers with routes and free roamers.
    expect(CREATURE_SPAWNS.filter((spawn) => spawn.patrol.length >= 3).length).toBeGreaterThanOrEqual(6);
    expect(CREATURE_SPAWNS.filter((spawn) => spawn.patrol.length === 0).length).toBeGreaterThanOrEqual(2);
  });

  it('anchors ground creatures on walkable, dry terrain', () => {
    for (const spawn of CREATURE_SPAWNS) {
      const species: SpeciesDefinition = SPECIES[spawn.kind];
      const flies = spawn.kind === 'drifter';
      if (!flies) {
        expect(isInWater(spawn.x, spawn.z)).toBe(false);
        expect(slopeDegreesAt(spawn.x, spawn.z)).toBeLessThan(species.maxSlope);
        expect(Number.isFinite(heightAt(spawn.x, spawn.z))).toBe(true);
      }
      expect(spawn.patrol.length === 0 || spawn.patrol.length >= 3).toBe(true);
      for (const point of spawn.patrol) {
        expect(Number.isFinite(heightAt(point.x, point.z))).toBe(true);
        // Ground routes must be terrain a walker can tolerate; gliders cross cliffs.
        if (!flies) expect(slopeDegreesAt(point.x, point.z)).toBeLessThan(spawn.kind === 'grazer' ? 40 : 55);
      }
    }
  });

  it('gives each encounter species its own cinematic copy', () => {
    for (const kind of ['grazer', 'warden'] as const) {
      const encounter = SPECIES[kind].encounter;
      expect(encounter).toBeDefined();
      expect(encounter?.title.length).toBeGreaterThan(6);
      expect(encounter?.subtitle.length).toBeGreaterThan(20);
      expect(encounter?.range).toBeGreaterThan(15);
    }
  });
});
