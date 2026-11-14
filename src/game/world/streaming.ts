/**
 * Chunk streaming maths: which chunks should be resident, at what level of
 * detail, and which should be retired. Engine-free so the policy can be tested
 * in Node.
 */

export const CHUNK_SIZE = 64;

export type ChunkLod = 'near' | 'mid';

export interface ChunkCoord {
  ix: number;
  iz: number;
}

export interface ChunkDecision extends ChunkCoord {
  key: string;
  centerX: number;
  centerZ: number;
  /** Distance from the player to the chunk centre. */
  distance: number;
  lod: ChunkLod;
}

export interface StreamingConfig {
  /** Chunks whose centre is within this distance get full detail. */
  nearRadius: number;
  /** Chunks within this distance get a merged, low-detail silhouette. */
  midRadius: number;
  /** Resident chunks beyond this distance are retired. */
  unloadRadius: number;
  /** Hard cap on near chunks loaded in a single frame. */
  nearLoadsPerFrame: number;
  midLoadsPerFrame: number;
  /** Chunks are only considered inside this world radius. */
  worldRadius: number;
}

export const DEFAULT_STREAMING: StreamingConfig = {
  nearRadius: 96,
  midRadius: 310,
  unloadRadius: 360,
  nearLoadsPerFrame: 1,
  midLoadsPerFrame: 2,
  worldRadius: 340,
};

export function chunkKey(ix: number, iz: number): string {
  return `${ix}|${iz}`;
}

export function chunkCoordAt(x: number, z: number): ChunkCoord {
  return { ix: Math.floor(x / CHUNK_SIZE), iz: Math.floor(z / CHUNK_SIZE) };
}

export function chunkCenter(coord: ChunkCoord): { x: number; z: number } {
  return {
    x: coord.ix * CHUNK_SIZE + CHUNK_SIZE * 0.5,
    z: coord.iz * CHUNK_SIZE + CHUNK_SIZE * 0.5,
  };
}

/** Deterministic 32-bit hash for a chunk + salt. */
export function chunkSeed(ix: number, iz: number, salt = 0): number {
  let h = (ix * 374761393 + iz * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Distance from a point to a chunk's nearest edge (0 inside the chunk). */
export function distanceToChunk(x: number, z: number, coord: ChunkCoord): number {
  const minX = coord.ix * CHUNK_SIZE;
  const minZ = coord.iz * CHUNK_SIZE;
  const maxX = minX + CHUNK_SIZE;
  const maxZ = minZ + CHUNK_SIZE;
  const dx = Math.max(minX - x, 0, x - maxX);
  const dz = Math.max(minZ - z, 0, z - maxZ);
  return Math.hypot(dx, dz);
}

export function lodForDistance(distance: number, config: StreamingConfig = DEFAULT_STREAMING): ChunkLod | null {
  if (distance <= config.nearRadius) return 'near';
  if (distance <= config.midRadius) return 'mid';
  return null;
}

/**
 * Every chunk that should exist around a player position, nearest first.
 * Chunk centres are used for LOD so a chunk never flickers at a boundary.
 */
export function desiredChunks(
  playerX: number,
  playerZ: number,
  config: StreamingConfig = DEFAULT_STREAMING,
): ChunkDecision[] {
  const centre = chunkCoordAt(playerX, playerZ);
  const reach = Math.ceil(config.midRadius / CHUNK_SIZE) + 1;
  const decisions: ChunkDecision[] = [];
  for (let ix = centre.ix - reach; ix <= centre.ix + reach; ix++) {
    for (let iz = centre.iz - reach; iz <= centre.iz + reach; iz++) {
      const c = chunkCenter({ ix, iz });
      const distance = Math.hypot(c.x - playerX, c.z - playerZ);
      const lod = lodForDistance(distance, config);
      if (!lod) continue;
      // Keep a half-chunk margin inside the expedition boundary.
      if (Math.hypot(c.x, c.z) > config.worldRadius + CHUNK_SIZE) continue;
      decisions.push({ ix, iz, key: chunkKey(ix, iz), centerX: c.x, centerZ: c.z, distance, lod });
    }
  }
  decisions.sort((a, b) => a.distance - b.distance);
  return decisions;
}

/**
 * Decide the streaming work for this frame.
 *
 * `resident` maps a chunk key to its current LOD. A near chunk that is already
 * resident at mid detail is reported for an upgrade; a mid chunk resident at
 * near detail only changes when the player has moved away far enough for the
 * chunk to be retired entirely, which avoids rebuild thrash at the ring edge.
 */
export interface StreamPlan {
  load: ChunkDecision[];
  upgrade: ChunkDecision[];
  unload: Array<ChunkCoord & { key: string }>;
}

export function planStreaming(
  playerX: number,
  playerZ: number,
  resident: ReadonlyMap<string, ChunkLod>,
  config: StreamingConfig = DEFAULT_STREAMING,
): StreamPlan {
  const desired = desiredChunks(playerX, playerZ, config);
  const plan: StreamPlan = { load: [], upgrade: [], unload: [] };
  const wanted = new Set<string>();

  for (const decision of desired) {
    wanted.add(decision.key);
    const current = resident.get(decision.key);
    if (!current) {
      if (decision.lod === 'near') {
        if (plan.load.filter((d) => d.lod === 'near').length < config.nearLoadsPerFrame) plan.load.push(decision);
      } else if (plan.load.filter((d) => d.lod === 'mid').length < config.midLoadsPerFrame) {
        plan.load.push(decision);
      }
    } else if (current === 'mid' && decision.lod === 'near') {
      if (plan.upgrade.length < config.nearLoadsPerFrame) plan.upgrade.push(decision);
    }
  }

  for (const [key] of resident) {
    if (wanted.has(key)) continue;
    const coord = parseChunkKey(key);
    if (!coord) continue;
    const centre = chunkCenter(coord);
    const distance = Math.hypot(centre.x - playerX, centre.z - playerZ);
    if (distance > config.unloadRadius) plan.unload.push({ ...coord, key });
  }

  return plan;
}

export function parseChunkKey(key: string): ChunkCoord | null {
  const parts = key.split('|');
  if (parts.length !== 2) return null;
  const ix = Number(parts[0]);
  const iz = Number(parts[1]);
  if (!Number.isFinite(ix) || !Number.isFinite(iz)) return null;
  return { ix, iz };
}

/** Number of chunks a radius covers (used for the loading screen copy). */
export function chunkCoverageArea(config: StreamingConfig = DEFAULT_STREAMING): number {
  return Math.PI * config.nearRadius * config.nearRadius;
}
