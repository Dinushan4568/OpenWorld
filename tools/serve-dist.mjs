#!/usr/bin/env node
/**
 * Dependency-free static server for release verification.
 *
 * It intentionally mirrors what a CDN/static host should do with this build:
 * correct MIME types, immutable caching for hashed assets, and pre-compressed
 * .br/.gz variants when the client advertises support. It is not intended to
 * replace a production CDN.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 4174);
const host = process.env.HOST ?? '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function chooseEncoding(req, filePath) {
  const accepted = String(req.headers['accept-encoding'] ?? '');
  if (/\bbr\b/.test(accepted) && existsSync(`${filePath}.br`)) return { suffix: '.br', encoding: 'br' };
  if (/\bgzip\b/.test(accepted) && existsSync(`${filePath}.gz`)) return { suffix: '.gz', encoding: 'gzip' };
  return { suffix: '', encoding: null };
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const relative = normalize(pathname).replace(/^([/\\])+/, '');
  let filePath = join(root, relative);
  const traversal = relative(root, filePath);
  if (traversal.startsWith('..') || isAbsolute(traversal)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Only a missing document falls back to the app shell. Missing hashed assets
  // must 404 rather than returning HTML with a JavaScript content type.
  if (!existsSync(filePath) && !extname(filePath)) {
    filePath = join(root, 'index.html');
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  const { suffix, encoding } = chooseEncoding(req, filePath);
  const served = filePath + suffix;
  const stat = statSync(served);
  const hashed = /[.-][A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(filePath);
  const headers = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': filePath.endsWith('index.html') || filePath.endsWith('_headers')
      ? 'no-cache'
      : hashed
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
    Vary: 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff',
  };
  if (encoding) headers['Content-Encoding'] = encoding;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(served).pipe(res);
});

server.listen(port, host, () => {
  console.log(`[serve-dist] ${root} on http://${host}:${port}`);
});
