import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  chunkCenter,
  chunkCoordAt,
  chunkKey,
  desiredChunks,
  parseChunkKey,
  planStreaming,
  DEFAULT_STREAMING,
  type ChunkLod,
} from '../src/game/world/streaming';

describe('chunk streaming', () => {
  it('maps world positions to stable coordinates and back', () => {
    expect(chunkCoordAt(0, 0)).toEqual({ ix: 0, iz: 0 });
    expect(chunkCoordAt(-1, -1)).toEqual({ ix: -1, iz: -1 });
    expect(chunkCoordAt(CHUNK_SIZE * 2 + 5, CHUNK_SIZE * -3 - 5)).toEqual({ ix: 2, iz: -4 });
    const coord = { ix: -3, iz: 7 };
    expect(parseChunkKey(chunkKey(coord.ix, coord.iz))).toEqual(coord);
    expect(parseChunkKey('nonsense')).toBeNull();
    const centre = chunkCenter(coord);
    expect(centre).toEqual({ x: -3 * CHUNK_SIZE + CHUNK_SIZE / 2, z: 7 * CHUNK_SIZE + CHUNK_SIZE / 2 });
  });

  it('orders desired chunks nearest-first and respects the world boundary', () => {
    const chunks = desiredChunks(18, 8);
    expect(chunks.length).toBeGreaterThan(20);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].distance).toBeGreaterThanOrEqual(chunks[i - 1].distance);
    }
    for (const chunk of chunks) {
      expect(chunk.distance).toBeLessThanOrEqual(DEFAULT_STREAMING.midRadius + 1e-6);
      expect(chunk.lod).toBe(chunk.distance <= DEFAULT_STREAMING.nearRadius ? 'near' : 'mid');
      expect(Math.hypot(chunk.centerX, chunk.centerZ)).toBeLessThanOrEqual(
        DEFAULT_STREAMING.worldRadius + CHUNK_SIZE,
      );
    }
  });

  it('loads a near and a mid chunk per pass, then unloads what is far behind', () => {
    const plan = planStreaming(0, 0, new Map());
    expect(plan.load.filter((d) => d.lod === 'near')).toHaveLength(1);
    expect(plan.load.filter((d) => d.lod === 'mid')).toHaveLength(2);
    expect(plan.unload).toHaveLength(0);

    const resident = new Map<string, ChunkLod>();
    resident.set(chunkKey(0, 0), 'near');
    resident.set(chunkKey(-6, 0), 'mid');
    const moved = planStreaming(600, 0, resident);
    expect(moved.unload.map((c) => c.key)).toContain(chunkKey(-6, 0));
  });

  it('upgrades resident mid chunks that come close', () => {
    const resident = new Map<string, ChunkLod>([[chunkKey(0, 0), 'mid']]);
    const plan = planStreaming(10, 10, resident);
    expect(plan.upgrade.map((c) => c.key)).toContain(chunkKey(0, 0));
    expect(plan.load.map((c) => c.key)).not.toContain(chunkKey(0, 0));
  });
});
