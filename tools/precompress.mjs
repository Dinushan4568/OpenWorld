/**
 * Precompress the static production bundle.
 *
 * Hosts that support gzip_static / brotli_static (nginx, some CDNs) can serve
 * these files directly. Hosts with automatic compression can ignore them; the
 * script still prints the transfer-size budget useful for release notes.
 */
import { constants, createBrotliCompress, createGzip } from 'node:zlib';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const extensions = new Set(['.js', '.css', '.html', '.svg', '.json', '.glb']);
let rawBytes = 0;
let gzipBytes = 0;
let brotliBytes = 0;
let files = 0;

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

try {
  await fs.access(root);
} catch {
  console.error(`[compress] ${root} does not exist. Run "npm run build" first.`);
  process.exit(1);
}

for await (const path of walk(root)) {
  if (!extensions.has(path.slice(path.lastIndexOf('.')).toLowerCase())) continue;
  const stat = await fs.stat(path);
  if (stat.size === 0) continue;
  await pipeline(createReadStream(path), createGzip({ level: 9 }), createWriteStream(`${path}.gz`));
  await pipeline(
    createReadStream(path),
    createBrotliCompress({
      params: {
        // 11 is the smallest output; release builds can afford the extra CPU.
        [constants.BROTLI_PARAM_QUALITY]: 11,
      },
    }),
    createWriteStream(`${path}.br`),
  );
  const gz = (await fs.stat(`${path}.gz`)).size;
  const br = (await fs.stat(`${path}.br`)).size;
  rawBytes += stat.size;
  gzipBytes += gz;
  brotliBytes += br;
  files += 1;
  console.log(
    `${relative(root, path).padEnd(42)} ${stat.size.toLocaleString().padStart(10)} B  ` +
      `${gz.toLocaleString().padStart(10)} gz  ${br.toLocaleString().padStart(10)} br`,
  );
}

const kb = (value) => `${(value / 1024).toFixed(1)} kB`;
console.log(`\n[compress] ${files} files · raw ${kb(rawBytes)} · gzip ${kb(gzipBytes)} · brotli ${kb(brotliBytes)}`);
