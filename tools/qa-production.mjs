/**
 * Static production QA: verifies that every local URL emitted by the build
 * exists, that the GLB payloads and manifest agree, and that the boot/error
 * surfaces survived bundling. Run after `npm run build`.
 */
import { promises as fs } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const basePath = (process.env.VITE_BASE ?? '/').replace(/\/?$/, '/');
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (!/\.(?:gz|br)$/.test(entry.name)) out.push(path);
  }
  return out;
}

try {
  await fs.access(join(dist, 'index.html'));
} catch {
  console.error('[qa] dist/index.html is missing. Run "npm run build" first.');
  process.exit(1);
}

const html = await fs.readFile(join(dist, 'index.html'), 'utf8');
for (const required of ['id="boot-shell"', 'id="game-canvas"', 'id="ui-root"', '<noscript', '__echoesReportBootFailure']) {
  assert(html.includes(required), `index.html is missing ${required}`);
}
assert(!html.includes('/src/main.ts'), 'index.html still points at the development entry point');

const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
for (const ref of refs) {
  if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(ref)) continue;
  const local = ref.startsWith(basePath) ? ref.slice(basePath.length) : ref.replace(/^\//, '');
  const path = resolve(dist, local);
  try {
    const stat = await fs.stat(path);
    assert(stat.isFile() && stat.size > 0, `empty referenced file: ${ref}`);
  } catch {
    failures.push(`index.html references missing file: ${ref}`);
  }
}

const modelDir = join(dist, 'assets/models');
const manifestPath = join(modelDir, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const modelFiles = new Set(manifest.models.map((entry) => entry.file));
assert(modelFiles.size === 20, `manifest should list 20 models, found ${modelFiles.size}`);

for (const entry of manifest.models) {
  const file = join(modelDir, entry.file);
  try {
    const buffer = await fs.readFile(file);
    assert(buffer.toString('utf8', 0, 4) === 'glTF', `${entry.file} has no glTF magic`);
    assert(buffer.readUInt32LE(4) === 2, `${entry.file} is not glTF 2`);
    assert(buffer.length === entry.bytes, `${entry.file} size ${buffer.length} != manifest ${entry.bytes}`);
    assert(buffer.length > 500, `${entry.file} is suspiciously small`);
  } catch (error) {
    failures.push(`${entry.file}: ${error.message}`);
  }
}

const assetFiles = await walk(join(dist, 'assets'));
assert(assetFiles.some((file) => file.endsWith('.js')), 'no JavaScript bundle emitted');
assert(assetFiles.some((file) => file.endsWith('.css')), 'no CSS bundle emitted');
assert(assetFiles.some((file) => /index-[^/]+\.js$/.test(file)), 'no hashed entry bundle emitted');
assert(assetFiles.some((file) => /playcanvas-[^/]+\.js$/.test(file)), 'no cacheable PlayCanvas bundle emitted');

const total = (await Promise.all(assetFiles.map(async (file) => (await fs.stat(file)).size))).reduce((a, b) => a + b, 0);
console.log(`[qa] ${assetFiles.length} build assets · ${(total / 1024 / 1024).toFixed(2)} MB raw`);
if (failures.length) {
  console.error('[qa] FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('[qa] PASS: index references, boot/error surfaces, 20 GLBs and hashed bundles are present.');
