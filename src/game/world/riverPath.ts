/**
 * Crystal River geometry: centreline, descending water profile and waterfalls.
 *
 * The profile is derived from the terrain beneath the river so the channel sits
 * naturally in the valley, then forced to fall continuously with two deliberate
 * breaks. Everything here is pure maths and deterministic.
 */
import { clamp, lerp } from '../util/math';

export interface RiverPoint {
  x: number;
  z: number;
  width: number;
}

/** Centreline from the northern highlands to the Mirrorwater basin. */
export const RIVER_POINTS: readonly RiverPoint[] = [
  { x: 6, z: 316, width: 6 },
  { x: 0, z: 280, width: 7 },
  { x: -8, z: 246, width: 8 },
  { x: -4, z: 216, width: 9 },
  { x: 2, z: 192, width: 10 },
  { x: 2, z: 178, width: 9 },
  { x: 6, z: 168, width: 10 },
  { x: 6, z: 142, width: 11 },
  { x: 8, z: 132, width: 10 },
  { x: 10, z: 118, width: 11 },
  { x: 12, z: 88, width: 12 },
  { x: 14, z: 58, width: 12 },
  { x: 10, z: 30, width: 13 },
  { x: 4, z: 8, width: 14 },
  { x: -14, z: -18, width: 16 },
  { x: -34, z: -38, width: 20 },
  { x: -58, z: -58, width: 24 },
];

export interface RiverStation {
  x: number;
  z: number;
  width: number;
  /** Arc distance along the centreline from the source. */
  distance: number;
  /** Water surface height. */
  y: number;
}

export interface RiverWaterfall {
  x: number;
  z: number;
  topY: number;
  bottomY: number;
  width: number;
  /** Yaw so a waterfall quad faces across the flow. */
  angle: number;
  drop: number;
}

export interface RiverSample {
  /** Distance from the centreline (metres). */
  distance: number;
  /** Water surface height at the nearest point on the centreline. */
  surfaceY: number;
  /** Channel half-width at that point. */
  width: number;
  /** 0..1 arc-length position along the river. */
  t: number;
  station: number;
}

interface Projection {
  distance: number;
  station: number;
  t: number;
}

const stationSpacing = 4;

/** Arc length at the start of each centreline segment (meters). */
const SEGMENT_STARTS: number[] = (() => {
  const starts = [0];
  for (let i = 0; i < RIVER_POINTS.length - 1; i++) {
    starts.push(starts[i] + Math.hypot(RIVER_POINTS[i + 1].x - RIVER_POINTS[i].x, RIVER_POINTS[i + 1].z - RIVER_POINTS[i].z));
  }
  return starts;
})();

function projectToPolyline(x: number, z: number): Projection {
  let best: Projection = { distance: Infinity, station: 0, t: 0 };
  for (let i = 0; i < RIVER_POINTS.length - 1; i++) {
    const a = RIVER_POINTS[i];
    const b = RIVER_POINTS[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz || 1e-6;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / lenSq, 0, 1);
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < best.distance) best = { distance, station: i, t };
  }
  return best;
}

/** Straight-line distance to the river centreline (used for region naming). */
export function riverDistanceAt(x: number, z: number): number {
  return projectToPolyline(x, z).distance;
}

/** Waterfalls are detected from the finished profile. */
function detectWaterfalls(stations: readonly RiverStation[]): RiverWaterfall[] {
  const falls: RiverWaterfall[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    const drop = a.y - b.y;
    const run = a.distance === b.distance ? 0 : b.distance - a.distance;
    if (drop < 3.4 || run > 9) continue;
    // A drop below the lake surface is underwater, not a visible waterfall.
    if (b.y <= -1.2) continue;
    // Avoid reporting every sample of the same fall.
    const last = falls[falls.length - 1];
    if (last && Math.hypot(last.x - a.x, last.z - a.z) < 14) continue;
    falls.push({
      x: (a.x + b.x) * 0.5,
      z: (a.z + b.z) * 0.5,
      topY: a.y,
      bottomY: b.y,
      width: Math.min(a.width, b.width) * 1.25,
      angle: Math.atan2(b.x - a.x, b.z - a.z),
      drop,
    });
  }
  return falls;
}

export interface RiverProfile {
  stations: readonly RiverStation[];
  waterfalls: readonly RiverWaterfall[];
  length: number;
  sample(x: number, z: number): RiverSample;
  /** Centreline point at 0..1 arc length (used by meshes and tests). */
  at(t: number): { x: number; z: number; y: number; width: number };
  /** Surface height at an arc-length distance. */
  surfaceAtDistance(distance: number): number;
}

/**
 * Build the descending river profile.
 *
 * @param baseHeight Terrain height before the river is carved.
 * @param mouthY Water level where the river meets Mirrorwater.
 */
export function buildRiverProfile(baseHeight: (x: number, z: number) => number, mouthY: number): RiverProfile {
  // Resample the centreline at a fixed spacing so drops are uniform.
  const resampled: RiverPoint[] = [];
  for (let i = 0; i < RIVER_POINTS.length - 1; i++) {
    const a = RIVER_POINTS[i];
    const b = RIVER_POINTS[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(length / stationSpacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      resampled.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), width: lerp(a.width, b.width, t) });
    }
  }
  const last = RIVER_POINTS[RIVER_POINTS.length - 1];
  resampled.push({ x: last.x, z: last.z, width: last.width });

  // Raw water heights derived from the land, never below the lake surface.
  const raw: number[] = resampled.map((point) => Math.max(mouthY, baseHeight(point.x, point.z) - 0.85));

  // Flow downhill: each station is at or below the one before it.
  const surface: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    surface.push(i === 0 ? raw[0] : Math.min(raw[i], surface[i - 1] - 0.012));
  }

  // Two deliberate falls at the natural cliff lines (z = 180 and z = 128).
  const lips = [180, 128];
  const drops = [8.4, 6.2];
  const anchors: number[] = [0];
  for (let f = 0; f < lips.length; f++) {
    let index = 1;
    let best = Infinity;
    for (let i = 1; i < raw.length - 2; i++) {
      const delta = Math.abs(resampled[i].z - lips[f]);
      if (delta < best) {
        best = delta;
        index = i;
      }
    }
    surface[index + 1] = surface[index] - drops[f];
    anchors.push(index, index + 1);
    // Downstream follows the land again, but never uphill or above the lip.
    for (let i = index + 2; i < raw.length; i++) {
      surface[i] = Math.min(raw[i], surface[i - 1] - 0.012);
    }
  }

  // Meet Mirrorwater exactly at the water line.
  surface[surface.length - 1] = mouthY;
  anchors.push(surface.length - 1);

  // Grade the water surface between fixed anchors. Real rivers hold a long,
  // even gradient between drops; relaxing the interior removes the stair-steps
  // where the raw land happens to fall away, without touching the two falls.
  const relax = (a: number, b: number): void => {
    if (b - a < 3) return;
    for (let pass = 0; pass < 24; pass++) {
      for (let i = a + 1; i < b; i++) {
        surface[i] = (surface[i - 1] + surface[i + 1]) * 0.5;
      }
    }
  };
  for (let i = 1; i < anchors.length; i++) {
    relax(anchors[i - 1], anchors[i]);
  }

  // Guarantee a monotone descent end to end.
  for (let i = 1; i < surface.length; i++) {
    if (surface[i] > surface[i - 1]) surface[i] = surface[i - 1] - 0.002;
  }

  const stations: RiverStation[] = [];
  let distance = 0;
  for (let i = 0; i < resampled.length; i++) {
    const point = resampled[i];
    if (i > 0) {
      const prev = resampled[i - 1];
      distance += Math.hypot(point.x - prev.x, point.z - prev.z);
    }
    stations.push({ x: point.x, z: point.z, width: point.width, distance, y: surface[i] });
  }

  const length = stations[stations.length - 1].distance;
  const waterfalls = detectWaterfalls(stations);

  const surfaceAtDistance = (target: number): number => {
    const clamped = clamp(target, 0, length);
    let low = 0;
    let high = stations.length - 1;
    while (low < high - 1) {
      const mid = (low + high) >> 1;
      if (stations[mid].distance <= clamped) low = mid;
      else high = mid;
    }
    const a = stations[low];
    const b = stations[high];
    const span = b.distance - a.distance || 1;
    return lerp(a.y, b.y, clamp((clamped - a.distance) / span, 0, 1));
  };

  const sample = (x: number, z: number): RiverSample => {
    const projection = projectToPolyline(x, z);
    const a = RIVER_POINTS[projection.station];
    const b = RIVER_POINTS[projection.station + 1] ?? a;
    const lengthAcross = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const along = SEGMENT_STARTS[projection.station] + lengthAcross * projection.t;
    return {
      distance: projection.distance,
      surfaceY: surfaceAtDistance(along),
      width: lerp(a.width, b.width, projection.t),
      t: length > 0 ? along / length : 0,
      station: 0,
    };
  };

  const at = (t: number): { x: number; z: number; y: number; width: number } => {
    const target = clamp(t, 0, 1) * length;
    let low = 0;
    let high = stations.length - 1;
    while (low < high - 1) {
      const mid = (low + high) >> 1;
      if (stations[mid].distance <= target) low = mid;
      else high = mid;
    }
    const a = stations[low];
    const b = stations[high];
    const span = b.distance - a.distance || 1;
    const f = clamp((target - a.distance) / span, 0, 1);
    return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), y: lerp(a.y, b.y, f), width: lerp(a.width, b.width, f) };
  };

  return { stations, waterfalls, length, sample, at, surfaceAtDistance };
}

