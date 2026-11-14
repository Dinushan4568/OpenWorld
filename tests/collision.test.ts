import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../src/game/world/collision';

const makeWorld = () => new CollisionWorld();

describe('collision world', () => {
  it('registers colliders and reports their count', () => {
    const world = makeWorld();
    expect(world.count).toBe(0);
    world.add({ x: 0, z: 0, radius: 1, base: 0, top: 2, walkable: false, kind: 'pillar' });
    expect(world.count).toBe(1);
    world.clear();
    expect(world.count).toBe(0);
  });

  it('pushes a capsule out of a solid pillar', () => {
    const world = makeWorld();
    world.add({ x: 0, z: 0, radius: 1, base: 0, top: 3, walkable: false, kind: 'pillar' });
    const push = world.resolve(0.2, 0, 0.4, 0, 1.8);
    expect(push.hit).toBe(true);
    const distance = Math.hypot(push.x, push.z);
    expect(distance).toBeCloseTo(1.4, 2);
    expect(push.nx).toBeGreaterThan(0.9);
  });

  it('ignores colliders the feet are standing on or above', () => {
    const world = makeWorld();
    world.add({ x: 0, z: 0, radius: 2, base: 0, top: 1, walkable: true, kind: 'plateau' });
    const push = world.resolve(0, 0, 0.4, 1.02, 1.8);
    expect(push.hit).toBe(false);
    expect(push.x).toBe(0);
    expect(push.z).toBe(0);
  });

  it('lets a capsule pass underneath a high collider', () => {
    const world = makeWorld();
    world.add({ x: 0, z: 0, radius: 1, base: 2.5, top: 5, walkable: false, kind: 'arch' });
    expect(world.resolve(0, 0, 0.4, 0, 1.8).hit).toBe(false);
  });

  it('supports walkable platforms within step height', () => {
    const world = makeWorld();
    world.add({ x: 0, z: 0, radius: 3, base: 0, top: 0.5, walkable: true, kind: 'dais' });
    expect(world.supportAt(0, 0, 0, 0.55)).toBe(0.5);
    expect(world.supportAt(2.9, 0, 0, 0.55)).toBe(0.5);
    expect(world.supportAt(3.2, 0, 0, 0.55)).toBe(-Infinity);
    // Too high to step onto from the ground.
    world.add({ x: 20, z: 0, radius: 3, base: 0, top: 2, walkable: true, kind: 'wall-top' });
    expect(world.supportAt(20, 0, 0, 0.55)).toBe(-Infinity);
    // But supported once the character is above it.
    expect(world.supportAt(20, 0, 1.8, 0.55)).toBe(2);
  });

  it('answers camera point queries inside and outside props', () => {
    const world = makeWorld();
    world.add({ x: 0, z: 0, radius: 1, base: 0, top: 2, walkable: false, kind: 'pillar' });
    expect(world.blocked(0, 1, 0, 0.2)).toBe(true);
    expect(world.blocked(2, 1, 0, 0.2)).toBe(false);
    expect(world.blocked(0, 3, 0, 0.2)).toBe(false);
  });

  it('de-duplicates colliders that span multiple grid cells', () => {
    const world = new CollisionWorld();
    world.add({ x: 0, z: 0, radius: 12, base: 0, top: 3, walkable: false, kind: 'huge' });
    const hits = world.query(0, 0, 1);
    expect(hits.filter((collider) => collider.kind === 'huge')).toHaveLength(1);
  });
});
