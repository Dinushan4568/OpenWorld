/**
 * Headless CPU benchmark for world streaming and instanced scatter.
 *
 * This deliberately uses PlayCanvas' null graphics device: it measures the
 * JavaScript-side work that causes frame hitches (chunk construction, merged
 * ground cover, instance buffers, stream planning) without needing a GPU. Run
 * with `npm run benchmark`.
 */
import { JSDOM } from 'jsdom';
import * as pc from 'playcanvas';
import { QUALITY_PROFILES } from '../src/game/config';
import type { AssetManager } from '../src/game/core/AssetManager';
import { ChunkManager } from '../src/game/world/ChunkManager';
import { DEFAULT_STREAMING } from '../src/game/world/streaming';
import { percentile } from '../src/game/core/adaptive';
import { buildMesh, createMeshData } from '../src/game/util/meshBuilder';

const dom = new JSDOM('<!doctype html><html><body><canvas id="bench"></canvas></body></html>', {
  pretendToBeVisual: true,
});
const g = globalThis as unknown as { window: unknown; document: unknown; requestAnimationFrame: unknown };
g.window = dom.window;
g.document = dom.window.document;
g.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  callback(performance.now());
  return 0;
};

const canvas = dom.window.document.getElementById('bench') as unknown as HTMLCanvasElement;
const device = await pc.createGraphicsDevice(canvas, { deviceTypes: ['null'] } as never);
const app = new pc.Application(canvas, { graphicsDevice: device } as never);

const data = createMeshData();
data.positions.push(-1, 0, -1, 1, 0, -1, 0, 2, 0);
data.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
data.uvs.push(0, 0, 1, 0, 0.5, 1);
data.colors.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
data.indices.push(0, 1, 2);
const mesh = buildMesh(device, data, 'benchmark-prop');
const material = new pc.StandardMaterial();
material.update();
const assets = {
  getRenderable: () => ({ mesh, material }),
  instantiate: () => null,
  createFallback: () => new pc.Entity('fallback'),
} as unknown as AssetManager;

const chunks = new ChunkManager(app, assets, QUALITY_PROFILES.high, undefined, DEFAULT_STREAMING);
const preloadStart = performance.now();
await chunks.preload(18, 8, async () => undefined);
const preloadMs = performance.now() - preloadStart;

let total = 0;
let worst = 0;
let steps = 0;
const samples: number[] = [];
for (let x = 18; x <= 300; x += 3) {
  const start = performance.now();
  chunks.update(x, 8);
  const elapsed = performance.now() - start;
  total += elapsed;
  worst = Math.max(worst, elapsed);
  samples.push(elapsed);
  steps += 1;
}

console.log('World streaming CPU benchmark (null graphics device)');
console.log(`  Preload (spawn, 9 m radius ring): ${preloadMs.toFixed(1)} ms`);
console.log(
  `  Path: ${steps} updates, ${(total / steps).toFixed(2)} ms average, ${percentile(samples, 0.5).toFixed(2)} ms median, ${percentile(samples, 0.95).toFixed(2)} ms p95, ${worst.toFixed(2)} ms worst`,
);
console.log(`  Resident chunks: ${chunks.stats.loaded} (${chunks.stats.near} near / ${chunks.stats.mid} mid)`);
console.log(`  Instanced props: ${chunks.stats.instances} across ${chunks.stats.entities} render entities`);
console.log(`  Pending queue: ${chunks.stats.pending}`);
console.log('  Note: excludes GPU rasterisation; use F3 in the running game for draw calls and frame time.');

chunks.dispose();
mesh.destroy();
material.destroy();
