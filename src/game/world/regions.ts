/**
 * The five connected regions of the expedition.
 *
 * Pure data and maths — no engine imports — so region membership, naming and
 * palette decisions can be unit-tested in Node and shared by the terrain,
 * scatter, HUD and collision systems.
 */
import { distance2D } from '../util/math';

export type RegionId = 'valley' | 'forest' | 'city' | 'river' | 'facility';

export type RegionKind = 'wild' | 'urban' | 'tech';

export interface RegionDefinition {
  id: RegionId;
  name: string;
  subtitle: string;
  kind: RegionKind;
  /** Region anchor (metres). */
  center: { x: number; z: number };
  /** Nominal radius used for naming and scatter weighting. */
  radius: number;
  /** Ground tint multiplier applied to the shared terrain palette (linear RGB). */
  tint: [number, number, number];
  /** Horizon/fog tint used while this region dominates the view. */
  haze: [number, number, number];
  /** Ambient discovery banner copy. */
  discovery: string;
}

export const REGIONS: Record<RegionId, RegionDefinition> = {
  valley: {
    id: 'valley',
    name: 'Mountain Valley',
    subtitle: 'Mirrorwater basin',
    kind: 'wild',
    center: { x: 20, z: 60 },
    radius: 132,
    tint: [1.0, 1.0, 1.0],
    haze: [0.45, 0.56, 0.55],
    discovery: 'The valley opens around a drowned basin and a broken skyline.',
  },
  forest: {
    id: 'forest',
    name: 'Ancient Forest',
    subtitle: 'The Whispering Grove',
    kind: 'wild',
    center: { x: 176, z: -92 },
    radius: 108,
    tint: [0.72, 0.94, 0.74],
    haze: [0.3, 0.43, 0.37],
    discovery: 'Older than the ruins, and still growing through them.',
  },
  city: {
    id: 'city',
    name: 'Abandoned City',
    subtitle: 'The drowned high street',
    kind: 'urban',
    center: { x: -198, z: -25 },
    radius: 96,
    tint: [0.88, 0.85, 0.8],
    haze: [0.42, 0.45, 0.45],
    discovery: 'Concrete terraces, dead signals and a forest moving in.',
  },
  river: {
    id: 'river',
    name: 'Crystal River',
    subtitle: 'The falling water road',
    kind: 'wild',
    center: { x: 4, z: 96 },
    radius: 120,
    tint: [0.82, 0.96, 1.0],
    haze: [0.4, 0.55, 0.58],
    discovery: 'Cold water, mineral light, and two falls cutting the valley.',
  },
  facility: {
    id: 'facility',
    name: 'Ancient Research Facility',
    subtitle: 'Station Theta',
    kind: 'tech',
    center: { x: -100, z: 190 },
    radius: 82,
    tint: [0.8, 0.9, 0.92],
    haze: [0.35, 0.44, 0.46],
    discovery: 'The machines are still waiting for a question.',
  },
};

export const REGION_LIST: readonly RegionDefinition[] = [
  REGIONS.valley,
  REGIONS.forest,
  REGIONS.city,
  REGIONS.river,
  REGIONS.facility,
];

/** River corridor half-width used for region naming. */
export const RIVER_CORRIDOR = 34;

/** Named points of interest, used for sub-labels and compass copy. */
export const POINTS_OF_INTEREST: ReadonlyArray<{ name: string; x: number; z: number; region: RegionId }> = [
  { name: 'The Echo Gate', x: 152, z: 74, region: 'valley' },
  { name: 'The Sunken Plaza', x: 46, z: -34, region: 'valley' },
  { name: 'River Bridge', x: 6, z: 30, region: 'river' },
  { name: 'Upper Falls', x: 2, z: 184, region: 'river' },
  { name: 'The Glasshouse Terraces', x: -186, z: -18, region: 'city' },
  { name: 'Station Theta', x: -100, z: 190, region: 'facility' },
  { name: 'The Mother Tree', x: 190, z: -104, region: 'forest' },
];

export function regionDefinition(id: RegionId): RegionDefinition {
  return REGIONS[id];
}

/**
 * Highest-priority region containing a point.
 *
 * Built-up regions win over wild ones so a city block inside a valley still
 * reads as the city; the river corridor is checked late because it threads
 * through the valley rather than replacing it.
 */
export function regionAt(x: number, z: number, riverDistance: number): RegionId {
  if (distance2D(x, z, REGIONS.city.center.x, REGIONS.city.center.z) < REGIONS.city.radius) return 'city';
  if (distance2D(x, z, REGIONS.facility.center.x, REGIONS.facility.center.z) < REGIONS.facility.radius) return 'facility';
  if (distance2D(x, z, REGIONS.forest.center.x, REGIONS.forest.center.z) < REGIONS.forest.radius) return 'forest';
  if (riverDistance < RIVER_CORRIDOR) return 'river';
  return 'valley';
}

/** Region-aware display name, with the point-of-interest name when close. */
export function regionLabel(x: number, z: number, riverDistance: number): string {
  const id = regionAt(x, z, riverDistance);
  let nearest: { name: string; distance: number } | null = null;
  for (const poi of POINTS_OF_INTEREST) {
    if (poi.region !== id) continue;
    const distance = distance2D(x, z, poi.x, poi.z);
    if (distance < 46 && (!nearest || distance < nearest.distance)) nearest = { name: poi.name, distance };
  }
  return nearest ? nearest.name : REGIONS[id].name;
}
