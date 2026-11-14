/**
 * Analytic world heightfield.
 *
 * The terrain mesh is generated from these exact functions, and every runtime
 * system (player grounding, camera collision, prop placement, water shoreline,
 * chunk streaming) samples the same field — so nothing floats or sinks.
 * Deterministic across machines.
 *
 * Phase 03 adds three built regions (Ancient Forest, Abandoned City, Research
 * Facility) and carves the Crystal River from a derived, always-descending
 * water profile, including two waterfalls.
 */
import { WORLD } from '../config';
import { clamp, lerp, smoothstep, distance2D } from '../util/math';
import { detailNoise, terrainNoise } from '../util/noise';
import { REGIONS, regionAt, regionLabel, regionDefinition, type RegionDefinition, type RegionId } from './regions';
import { buildRiverProfile, riverDistanceAt, type RiverWaterfall } from './riverPath';

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
const CITY = REGIONS.city;
const FACILITY = REGIONS.facility;
const FOREST = REGIONS.forest;

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
  // Valley → Abandoned City, crossing the western terraces.
  [
    { x: 18, z: 8 },
    { x: -24, z: 6 },
    { x: -70, z: -8 },
    { x: -118, z: -14 },
    { x: -164, z: -20 },
    { x: -198, z: -25 },
  ],
  // Valley → Research Facility, climbing the northern shelf.
  [
    { x: 18, z: 8 },
    { x: 6, z: 52 },
    { x: -18, z: 96 },
    { x: -52, z: 142 },
    { x: -84, z: 172 },
    { x: -100, z: 190 },
  ],
  // Forest road.
  [
    { x: 46, z: -22 },
    { x: 96, z: -54 },
    { x: 140, z: -76 },
    { x: 176, z: -92 },
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

/** Broad landform plus the region masks, before the river is carved. */
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

  // Forest basin: a shallow, sheltered bowl that reads as old growth.
  const forestD = distance2D(x, z, FOREST.center.x, FOREST.center.z);
  const forestMask = smoothstep(FOREST.radius * 1.08, FOREST.radius * 0.4, forestD);
  const forestFloor = 2.4 + terrainNoise.fbm(x * 0.05 + 8, z * 0.05 - 3, 3) * 1.5;
  h = lerp(h, forestFloor, forestMask * 0.62);

  // Abandoned city: a broad artificial plateau stepping down to the valley.
  const cityD = distance2D(x, z, CITY.center.x, CITY.center.z);
  const cityMask = smoothstep(CITY.radius * 1.42, CITY.radius * 0.62, cityD);
  const cityNoise = terrainNoise.fbm(x * 0.035 - 12, z * 0.035 + 5, 2) * 0.22;
  const cityPlateau = 9.8 + cityNoise;
  h = lerp(h, cityPlateau, cityMask * 0.93);

  // Research facility: a terraced northern shelf with a flat reactor deck.
  const facilityD = distance2D(x, z, FACILITY.center.x, FACILITY.center.z);
  const facilityMask = smoothstep(FACILITY.radius * 1.5, FACILITY.radius * 0.74, facilityD);
  const terraces = clamp(Math.floor((FACILITY.radius - facilityD) / 11), 0, 5) * 0.42;
  const deck = smoothstep(34, 22, facilityD);
  const facilityHeight = 33.4 + terraces + deck * 1.4 + terrainNoise.fbm(x * 0.05, z * 0.05, 2) * 0.14;
  h = lerp(h, facilityHeight, facilityMask * 0.95);

  // Windward ridge — a long, walkable backbone heading north-west.
  const ridgeD = distanceToSegment(x, z, -196, 132, -58, 24);
  const ridgeBump = (1 - smoothstep(14, 92, ridgeD)) * 24;
  h += ridgeBump * (1 - cityMask * 0.6);

  // A soft bowl for the Whispering Grove.
  const groveD = distance2D(x, z, 182, -96);
  h -= smoothstep(78, 8, groveD) * 3.2;

  // Natural amphitheatre rim: the expedition boundary is geology, not an invisible wall.
  const r = Math.hypot(x, z);
  const rim = smoothstep(300, 430, r);
  h += rim * (66 + terrainNoise.fbm(x * 0.006, z * 0.006, 4) * 46);

  return h;
}

/* -------------------------------------------------------------------------- */
/* Crystal River                                                              */
/* -------------------------------------------------------------------------- */

let profileCache: ReturnType<typeof buildRiverProfile> | null = null;

/** Derived, always-descending water profile (built once from the raw landform). */
export function riverProfile(): ReturnType<typeof buildRiverProfile> {
  if (!profileCache) profileCache = buildRiverProfile(baseLandform, WORLD.waterLevel);
  return profileCache;
}

/** Water surface height nearest a world position. */
export function riverSurfaceAt(x: number, z: number): number {
  return riverProfile().sample(x, z).surfaceY;
}

/** How far a point is from the river centreline. */
export function riverDistance(x: number, z: number): number {
  return riverDistanceAt(x, z);
}

export const waterfalls: readonly RiverWaterfall[] = riverProfile().waterfalls;

/** Carve the channel and blend it into the surrounding banks. */
function carveRiver(x: number, z: number, h: number): number {
  const sample = riverProfile().sample(x, z);
  const channelHalf = Math.max(3, sample.width * 0.5);
  const d = sample.distance;
  if (d > channelHalf + 26) return h;

  const bed = sample.surfaceY - 1.35 + detailNoise.fbm(x * 0.2, z * 0.2, 2) * 0.12;
  if (d <= channelHalf) return Math.min(h, bed);

  // Banks rise out of the water; near the lake mouth they merge with the shore.
  const mouth = smoothstep(0.86, 0.99, sample.t);
  const bank = Math.max(h, lerp(sample.surfaceY + 0.85, h, mouth));
  const blend = smoothstep(channelHalf, channelHalf + 22, d);
  return lerp(bed, bank, blend);
}

/** Final terrain height at a world position (metres). */
export function heightAt(x: number, z: number): number {
  return carveRiver(x, z, baseLandform(x, z));
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

/** Region membership for a point, including the river corridor. */
export function regionAtPoint(x: number, z: number): RegionId {
  return regionAt(x, z, riverDistance(x, z));
}

/** Region definition for the point (used for tinting and scatter rules). */
export function regionDefinitionAt(x: number, z: number): RegionDefinition {
  return regionDefinition(regionAtPoint(x, z));
}

/**
 * Soft region tint, used by the terrain, scatter and atmosphere.
 * Regions blend into their neighbours rather than switching at a hard line.
 */
export function regionTintAt(x: number, z: number, base = 1): [number, number, number] {
  let r = base;
  let g = base;
  let b = base;
  const ids: RegionId[] = ['forest', 'city', 'facility', 'river'];
  for (const id of ids) {
    const region = REGIONS[id];
    const d = id === 'river' ? riverDistance(x, z) * 2.4 : distance2D(x, z, region.center.x, region.center.z);
    const radius = id === 'river' ? 84 : region.radius;
    const mask = smoothstep(radius, radius * 0.55, d);
    if (mask <= 0) continue;
    r = lerp(r, region.tint[0], mask * 0.55);
    g = lerp(g, region.tint[1], mask * 0.55);
    b = lerp(b, region.tint[2], mask * 0.55);
  }
  return [r, g, b];
}

/** Display name used by the HUD (region or nearby point of interest). */
export function areaNameAt(x: number, z: number): string {
  return regionLabel(x, z, riverDistance(x, z));
}

/** True when a prop can sit here without intersecting water or hero sites. */
export function isScatterAllowed(x: number, z: number, minHeight = WORLD.waterLevel + 0.7): boolean {
  if (heightAt(x, z) < minHeight) return false;
  if (distance2D(x, z, LAKE.x, LAKE.z) < LAKE_R * 0.42) return false;
  if (distance2D(x, z, WORLD.plazaCenter.x, WORLD.plazaCenter.z) < 26) return false;
  if (distance2D(x, z, WORLD.gateCenter.x, WORLD.gateCenter.z) < 34) return false;
  if (distance2D(x, z, WORLD.spawn.x, WORLD.spawn.z) < 14) return false;
  if (riverDistance(x, z) < 12) return false;
  return true;
}

/**
 * Scenic spawn: an elevated meadow with the plaza and lake both in frame.
 *
 * The river's carved bank can be very steep right at the nominal spawn, so the
 * search walks a small spiral for the flattest nearby ground instead of
 * dropping the player onto a 50-degree slope.
 */
export function findSpawnPoint(): { x: number; y: number; z: number; heading: number } {
  let bestX: number = WORLD.spawn.x;
  let bestZ: number = WORLD.spawn.z;
  let bestScore = Infinity;
  for (let radius = 0; radius <= 26; radius += 2) {
    const steps = radius === 0 ? 1 : Math.max(8, Math.round(radius * 1.6));
    for (let step = 0; step < steps; step++) {
      const angle = (step / steps) * Math.PI * 2;
      const x = WORLD.spawn.x + Math.cos(angle) * radius;
      const z = WORLD.spawn.z + Math.sin(angle) * radius;
      const height = heightAt(x, z);
      if (height < WORLD.waterLevel + 1.4) continue;
      if (riverDistance(x, z) < 9) continue;
      const slope = Math.max(
        slopeDegreesAt(x, z),
        slopeDegreesAt(x + 3.5, z),
        slopeDegreesAt(x - 3.5, z),
        slopeDegreesAt(x, z + 3.5),
        slopeDegreesAt(x, z - 3.5),
      );
      const score = slope + radius * 0.35;
      if (score < bestScore) {
        bestScore = score;
        bestX = x;
        bestZ = z;
      }
    }
    // A genuinely flat pad is worth taking without looking further out.
    if (bestScore < 14) break;
  }
  const x = bestX;
  const z = bestZ;
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
