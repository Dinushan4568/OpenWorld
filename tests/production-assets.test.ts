import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_FILES, MODEL_URLS } from '../src/game/config';

describe('production shell and asset integrity', () => {
  const root = process.cwd();

  it('has the loading shell, game canvas, UI root and boot failure fallback', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).toContain('id="boot-shell"');
    expect(html).toContain('id="game-canvas"');
    expect(html).toContain('id="ui-root"');
    expect(html).toContain('<noscript');
    expect(html).toContain('__echoesReportBootFailure');
    expect(html).toContain('type="module"');
    expect(html).toContain('favicon.svg');
  });

  it('ships every declared GLB at the URL the game requests', () => {
    const modelDir = join(root, 'public/assets/models');
    for (const [name, file] of Object.entries(MODEL_FILES)) {
      expect(MODEL_URLS[name as keyof typeof MODEL_FILES]).toBe(`/assets/models/${file}`);
      const buffer = readFileSync(join(modelDir, file));
      expect(buffer.toString('utf8', 0, 4)).toBe('glTF');
      expect(buffer.readUInt32LE(4)).toBe(2);
    }
  });

  it('ships static-host headers and Pages metadata', () => {
    const headers = readFileSync(join(root, 'public/_headers'), 'utf8');
    expect(headers).toContain('Cache-Control: public, max-age=31536000, immutable');
    expect(headers).toContain('/assets/models/*.glb');
    expect(headers).toContain('Content-Type: model/gltf-binary');
    expect(readFileSync(join(root, 'public/.nojekyll'), 'utf8')).toBe('');
  });
});
