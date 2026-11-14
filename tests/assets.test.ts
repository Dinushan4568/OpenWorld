import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_FILES, MODEL_URLS, SHARD_LOCATIONS } from '../src/game/config';

describe('generated assets', () => {
  const modelDir = join(process.cwd(), 'public/assets/models');

  it('declares a URL for every model', () => {
    for (const name of Object.keys(MODEL_FILES) as Array<keyof typeof MODEL_FILES>) {
      expect(MODEL_URLS[name]).toContain(MODEL_FILES[name]);
      expect(MODEL_URLS[name].startsWith('/assets/models/')).toBe(true);
    }
  });

  it('ships valid binary glTF containers', () => {
    for (const file of Object.values(MODEL_FILES)) {
      const buffer = readFileSync(join(modelDir, file));
      expect(buffer.toString('utf8', 0, 4)).toBe('glTF');
      expect(buffer.readUInt32LE(4)).toBe(2);
      expect(buffer.length).toBeGreaterThan(500);
    }
  });

  it('keeps the manifest in sync with the model list', () => {
    const manifest = JSON.parse(readFileSync(join(modelDir, 'manifest.json'), 'utf8')) as {
      models: Array<{ file: string }>;
    };
    const shipped = manifest.models.map((entry) => entry.file).sort();
    const declared = Object.values(MODEL_FILES).sort();
    expect(declared).toEqual(shipped);
  });

  it('defines five reachable shard locations inside the playable boundary', () => {
    expect(SHARD_LOCATIONS).toHaveLength(5);
    for (const shard of SHARD_LOCATIONS) {
      expect(Math.hypot(shard.x, shard.z)).toBeLessThan(330);
      expect(shard.id).toMatch(/^shard_/);
    }
  });
});
