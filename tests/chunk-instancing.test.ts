// @vitest-environment jsdom
import * as pc from 'playcanvas';
import { describe, expect, it } from 'vitest';
import { QUALITY_PROFILES } from '../src/game/config';
import type { AssetManager } from '../src/game/core/AssetManager';
import { ChunkManager } from '../src/game/world/ChunkManager';
import { createMeshData, buildMesh } from '../src/game/util/meshBuilder';
import { DEFAULT_STREAMING } from '../src/game/world/streaming';

describe('instanced chunk scatter', () => {
  it('draws many props through a handful of instanced batches', async () => {
    const canvas = document.createElement('canvas');
    const device = await pc.createGraphicsDevice(canvas, { deviceTypes: ['null'] } as never);
    const app = new pc.Application(canvas, { graphicsDevice: device } as never);
    const data = createMeshData();
    data.positions.push(-1, 0, -1, 1, 0, -1, 0, 2, 0);
    data.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    data.uvs.push(0, 0, 1, 0, 0.5, 1);
    data.colors.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    data.indices.push(0, 1, 2);
    const mesh = buildMesh(device, data, 'test-conifer');
    const material = new pc.StandardMaterial();
    material.update();
    const assets = {
      getRenderable: () => ({ mesh, material }),
      instantiate: () => null,
      createFallback: () => new pc.Entity('fallback'),
    } as unknown as AssetManager;
    const config = { ...DEFAULT_STREAMING, nearRadius: 12, midRadius: 12 };
    const chunks = new ChunkManager(app, assets, QUALITY_PROFILES.high, undefined, config);

    await chunks.preload(32, 32, async () => undefined);
    expect(chunks.stats.near).toBe(1);
    expect(chunks.stats.instances).toBeGreaterThan(10);
    expect(chunks.stats.entities).toBeLessThan(chunks.stats.instances);
    expect(chunks.stats.pending).toBe(0);

    chunks.dispose();
    mesh.destroy();
    material.destroy();
    expect(chunks.root.parent).toBeNull();
  });
});
