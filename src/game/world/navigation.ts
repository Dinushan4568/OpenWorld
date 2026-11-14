/**
 * Bridges the analytic heightfield, the static collision grid and the
 * engine-free locomotion solver.
 */
import { WORLD } from '../config';
import type { LocomotionWorld } from '../player/locomotion';
import type { CollisionWorld } from './collision';
import { heightAt, normalAt } from './heightfield';

/** Sample the highest terrain point under a capsule footprint. */
export function capsuleGroundHeight(x: number, z: number, radius: number): number {
  let highest = heightAt(x, z);
  const r = radius * 0.78;
  highest = Math.max(highest, heightAt(x + r, z), heightAt(x - r, z));
  highest = Math.max(highest, heightAt(x, z + r), heightAt(x, z - r));
  // Diagonal samples catch sharp ridge corners the axis samples can miss.
  const d = r * 0.7;
  highest = Math.max(highest, heightAt(x + d, z + d), heightAt(x - d, z + d));
  highest = Math.max(highest, heightAt(x + d, z - d), heightAt(x - d, z - d));
  return highest;
}

export function createLocomotionWorld(collision?: CollisionWorld): LocomotionWorld {
  return {
    terrainHeight: (x, z) => heightAt(x, z),
    groundHeight: capsuleGroundHeight,
    normalY: (x, z) => normalAt(x, z)[1],
    waterLevel: WORLD.waterLevel,
    boundaryRadius: WORLD.boundaryRadius,
    collision,
  };
}
