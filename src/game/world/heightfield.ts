/**
 * Analytic world heightfield.
 *
 * The terrain mesh is generated from these exact functions, and every runtime system
 * (player grounding, camera collision, prop placement, water shoreline) samples the same
 * field — so nothing floats or sinks. Deterministic across machines.
 */
import { WORLD } from '../config';
import { clamp, lerp, smoothstep, distance2D } from '../util/math';
import { detailNoise, terrainNoise } from '../util/noise';

export interface Vec2Like {
  x: number;
  z: number;
}

export interface SurfaceSample {
  height: number;
  slope: number; // 1 = flat, 0 = vertical (normal.y)
  normal: [number, number, number];
}

const LAKE = WORLD.lakeCenter;
const LAKE_R = WORLD.lakeRadius;

/** Natural trail polylines across the valley (used for terrain tinting). */
const TRAILS: ReadonlyArray<ReadonlyArray<Vec2Like>> = [
  [
    { x: 12, z: 22 },
    { x: 18, z: 8 },
    { x: 32, z: -6 },
    { x: 46, z: -22 },
    { x: 78, z: -6 },
    { x: 116, z: 30 },
    { x: 146, z: 58 },
  ],
  [
    { x: 20, z: 12 },
    { x: -12, z: -4 },
    { x: -48, z: -20 },
    { x: -84, z: -52 },
    { x: -104, z: -96 },
  ],
];

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz || 1e-6;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / lenSq, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function trailInfluence(x: number, z: number): number {
  let best = Infinity;
  for (const trail of TRAILS) {
    for (let i = 0; i < trail.length - 1; i++) {
      const d = distanceToSegment(x, z, trail[i].x, trail[i].z, trail[i + 1].x, trail[i + 1].z);
      if (d < best) best = d;
    }
  }
  return 1 - smoothstep(2.2, 5.5, best);
}

/** Broad landform before local features are applied. */
function baseLandform(x: number, z: number): number {
  const hills = terrainNoise.fbm(x * 0.0042, z * 0.0042, 5) * 21;
  const ridges = terrainNoise.ridged(x * 0.0021 + 3.7, z * 0.0021 - 6.1, 5) * 40;
  const mid = terrainNoise.fbm(x * 0.014 + 21.4, z * 0.014 - 8.2, 3) * 5.2;
  const micro = detailNoise.fbm(x * 0.085, z * 0.085, 2) * 0.55;

  let h = hills + ridges * 0.52 + mid + micro + 2.5;

  // Valley basin for Mirrorwater.
  const lakeD = distance2D(x, z, LAKE.x, LAKE.z);
  const lakeMask = smoothstep(LAKE_R * 1.02, LAKE_R * 0.2, lakeD);
  const lakeFloor = -8.4 + terrainNoise.fbm(x * 0.03, z * 0.03, 2) * 1.6;
  h = lerp(h, lakeFloor, lakeMask);

  // Raised terrace for the Sunken Plaza ruins.
  const plazaD = distance2D(x, z, WORLD.plazaCenter.x, WORLD.plazaCenter.z);
  const plazaMask = smoothstep(38, 15, plazaD);
  const plazaHeight = 4.1 + terrainNoise.fbm(x * 0.05, z * 0.05, 2) * 0.35;
  h = lerp(h, plazaHeight, plazaMask * 0.94);

  // Flat saddle where the Echo Gate stands.
  const gateD = distance2D(x, z, WORLD.gateCenter.x, WORLD.gateCenter.z);
  const gateMask = smoothstep(46, 18, gateD);
  h = lerp(h, 9.6 + terrainNoise.fbm(x * 0.04, z * 0.04, 2) * 0.6, gateMask * 0.88);

  // Windward ridge — a long, walkable backbone heading north-west.
  const ridgeD = distanceToSegment(x, z, -196, 132, -58, 24);
  const ridgeBump = (1 - smoothstep(14, 92, ridgeD)) * 24;
  h += ridgeBump;

  // A soft bowl for the Whispering Grove.
  const groveD = distance2D(x, z, 182, -96);
  h -= smoothstep(78, 8, groveD) * 3.2;

  // Natural amphitheatre rim: the expedition boundary is geology, not an invisible wall.
  const r = Math.hypot(x, z);
  const rim = smoothstep(300, 430, r);
  h += rim * (66 + terrainNoise.fbm(x * 0.006, z * 0.006, 4) * 46);

  return h;
}

/** Final terrain height at a world position (metres). */
export function heightAt(x: number, z: number): number {
  return baseLandform(x, z);
}

/** Terrain normal via central differences. */
export function normalAt(x: number, z: number, epsilon = 0.75): [number, number, number] {
  const hL = heightAt(x - epsilon, z);
  const hR = heightAt(x + epsilon, z);
  const hD = heightAt(x, z - epsilon);
  const hU = heightAt(x, z + epsilon);
  const nx = hL - hR;
  const nz = hD - hU;
  const ny = 2 * epsilon;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export function sampleSurface(x: number, z: number): SurfaceSample {
  const normal = normalAt(x, z);
  return { height: heightAt(x, z), slope: normal[1], normal };
}

export function steepnessAt(x: number, z: number): number {
  return 1 - normalAt(x, z)[1];
}

/** Approximate slope in degrees — used by the HUD to describe the terrain. */
export function slopeDegreesAt(x: number, z: number): number {
  const n = normalAt(x, z);
  return Math.acos(clamp(n[1], -1, 1)) * (180 / Math.PI);
}

/** Height above the water surface (negative = submerged). */
export function depthAt(x: number, z: number): number {
  return heightAt(x, z) - WORLD.waterLevel;
}

export function isInWater(x: number, z: number): boolean {
  return heightAt(x, z) < WORLD.waterLevel + 0.1;
}

/** Distance to the nearest shoreline; useful for sand tinting and shore props. */
export function shoreProximity(x: number, z: number): number {
  return Math.abs(heightAt(x, z) - WORLD.waterLevel);
}

/**
 * Blend of biomes used for vertex colouring and scatter density.
 * Values are 0..1 and always sum to ~1.
 */
export function biomeWeights(x: number, z: number): { sand: number; grass: number; rock: number; highland: number } {
  const h = heightAt(x, z);
  const normalY = normalAt(x, z)[1];
  const moisture = clamp(terrainNoise.fbm(x * 0.012 + 40, z * 0.012 - 12, 3) * 0.5 + 0.5, 0, 1);

  const sand = clamp(1 - smoothstep(0.9, 3.2, Math.abs(h - WORLD.waterLevel) + moisture * 0.3), 0, 1);
  const steep = smoothstep(0.78, 0.94, normalY);
  const rock = clamp((1 - steep) * 1.4 + smoothstep(26, 44, h) * 0.35, 0, 1);
  const highland = smoothstep(24, 52, h + moisture * 4);
  const grass = clamp(1 - rock - sand * 0.85 - highland * 0.5, 0, 1);
  const total = sand + grass + rock + highland || 1;
  return { sand: sand / total, grass: grass / total, rock: rock / total, highland: highland / total };
}

/** True when a prop can sit here without intersecting the lake or the ruins. */
export function isScatterAllowed(x: number, z: number, minHeight = WORLD.waterLevel + 0.7): boolean {
  if (heightAt(x, z) < minHeight) return false;
  if (distance2D(x, z, LAKE.x, LAKE.z) < LAKE_R * 0.42) return false;
  if (distance2D(x, z, WORLD.plazaCenter.x, WORLD.plazaCenter.z) < 26) return false;
  if (distance2D(x, z, WORLD.gateCenter.x, WORLD.gateCenter.z) < 34) return false;
  if (distance2D(x, z, WORLD.spawn.x, WORLD.spawn.z) < 14) return false;
  return true;
}

/** Scenic spawn: elevated meadow with the plaza and lake both in frame. */
export function findSpawnPoint(): { x: number; y: number; z: number; heading: number } {
  const x = WORLD.spawn.x;
  const z = WORLD.spawn.z;
  const y = heightAt(x, z);
  const heading = Math.atan2(WORLD.plazaCenter.x - x, WORLD.plazaCenter.z - z);
  return { x, y, z, heading };
}

/** Distance from the world centre (expedition boundary feedback). */
export function distanceFromCentre(x: number, z: number): number {
  return Math.hypot(x, z);
}

/** Height used for the far-ring mountains (low frequency, non-walkable backdrop). */
export function farHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const ring = smoothstep(620, 1080, r);
  const ridge = terrainNoise.ridged(x * 0.0035 + 71, z * 0.0035 - 17, 4);
  const hills = terrainNoise.fbm(x * 0.0028 - 40, z * 0.0028 + 22, 4) * 20;
  return -12 + ring * (150 + ridge * 220) + hills * (0.2 + ring * 0.9);
}
