# Deploying Echoes of the Lost World

The game is a fully static Vite build. There is no server runtime, database, API key or
environment-specific secret. The browser needs WebGL 2 or WebGPU, JavaScript enabled and enough
memory to hold the PlayCanvas engine chunk.

## Build and verify

```bash
npm ci
npm run typecheck
npm test                 # 197 tests across 31 suites
npm run build:prod       # tsc + vite build + asset QA + gzip/brotli pre-compression
```

`build:prod` runs three checks that should gate every deployment:

1. `npm run build` — strict TypeScript and the production Vite bundle into `dist/`.
2. `npm run qa:assets` — checks the boot/error markers in `dist/index.html`, every local
   `src`/`href`, all 20 GLBs (glTF 2 magic/version + manifest byte parity) and the hashed entry
   bundles.
3. `npm run compress` — writes `.gz` and `.br` siblings for HTML, JS, CSS, SVG, JSON and GLB files
   and prints the raw/gzip/brotli transfer budget.

To inspect the exact artefact locally:

```bash
npm run preview          # Vite preview on 0.0.0.0:4173
# or, closer to a CDN:
npm run serve:dist       # dependency-free static server on 0.0.0.0:4174
```

`serve:dist` serves pre-compressed variants when the request advertises `br`/`gzip`, applies
`model/gltf-binary` to GLBs, immutable caching to hashed assets and `no-cache` to `index.html`.
It is a verification tool, not a production replacement for a CDN.

## Host configuration

| Host | Configuration |
| --- | --- |
| Netlify | `netlify.toml` is checked in (`npm run build:prod`, publish `dist`); `public/_headers` supplies CSP, MIME and cache rules. |
| Cloudflare Pages | Build command `npm run build:prod`, output `dist`; `_headers` is copied into the build automatically. |
| Vercel | `vercel.json` is checked in; build command `npm run build:prod`, output `dist`. |
| GitHub Pages | Build with `VITE_BASE=/<repository>/ npm run build:prod`, publish `dist`; `.nojekyll` is included in `public/`. |
| Nginx/Apache | Serve `dist/` as the document root. Do not rewrite `/assets/*` to `index.html`; only missing HTML routes may fall back to the shell. |
| Any CDN | Enable gzip/brotli static pre-compressed file support if available; otherwise let the CDN compress on the fly. |

### Root vs project subpath

The default `base` is `/`, which is correct for a custom domain or an apex host. For GitHub Pages
project sites, or any host that serves the game under `/repo/`, build with the same base used by the
host:

```bash
VITE_BASE=/echoes/ npm run build:prod
# QA reads VITE_BASE too:
VITE_BASE=/echoes/ npm run qa:assets
```

Both `index.html` script URLs and the runtime `MODEL_URLS` use the configured base. The favicon is
relative (`./favicon.svg`) so it works on both a root and a project page. Rebuild with a new base
whenever the deployment path changes; do not mix artefacts from two bases.

### Nginx example

```nginx
server {
    listen 80;
    server_name echoes.example.com;
    root /var/www/echoes/dist;
    index index.html;

    gzip_static on;
    brotli_static on;              # if the ngx_brotli module is installed

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;        # never return HTML for a missing asset
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    types {
        model/gltf-binary glb;
        application/wasm wasm;
    }
}
```

If `gzip_static`/`brotli_static` are unavailable, serve the raw files and enable dynamic
`gzip on;` / `brotli on;` instead. The `.br`/`.gz` siblings are optional; the raw files are always
present and correct.

### Vercel security headers

`vercel.json` currently sets cache and GLB MIME rules. Add the same CSP used by `_headers` if the
host does not read Netlify/Cloudflare `_headers`:

```text
default-src 'self'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self';
worker-src 'self' blob:; child-src 'self' blob:; font-src 'self' data:
```

The inline `unsafe-inline` allowance is required by the boot watchdog and the `noscript`/first-paint
shell; the game code itself is served from `self`.

## Caching

- `index.html` — `no-cache`; it names hashed bundles, so a deploy is picked up immediately.
- `/assets/index-*.js`, `/assets/index-*.css`, `/assets/playcanvas-*.js` — one year, `immutable`.
  The hashes change when content changes.
- `/assets/models/*.glb` and `manifest.json` — filenames are stable, so use a bounded cache
  (for example one day) or version the directory when models change. The HTML headers file uses
  the general `/assets/*` immutable rule because the models are release artefacts; if you update a
  GLB in place, purge the CDN or change its filename and manifest entry.
- Pre-compressed `.gz`/`.br` siblings inherit the underlying file's MIME type; never serve them
  without `Content-Encoding`.

## Health checks after deploy

```bash
curl -sI https://your-host/ | grep -Ei 'HTTP/|content-type|cache-control'
curl -sI https://your-host/assets/models/wayfarer.glb | grep -Ei 'HTTP/|content-type|content-encoding'
curl -s -o /dev/null -w '%{http_code}\n' https://your-host/assets/models/missing.glb   # expect 404
```

Then open the game and verify: the loading shell disappears into the main menu, `Continue` is
disabled on a fresh origin, a new expedition reaches the HUD, settings persist after reload and
the browser console has no uncaught errors. The full QA matrix and known limitations are in
[QA_REPORT.md](QA_REPORT.md).

## Browser and storage notes

- Requires a browser with WebGL 2 or WebGPU; WebGPU is tried first and WebGL 2 is the fallback.
- Settings use `localStorage`; progress and the RPG profile use IndexedDB with a memory fallback.
  Saves are origin-scoped: changing hostname/port (including `http://` vs `https://`) starts a new
  profile. Use one canonical HTTPS origin in production.
- Pointer lock and gamepad/touch input require a user gesture; the first click starts audio and
  pointer lock. No cross-origin isolation headers are required.
- The build has no service worker. Do not add a cache-first service worker without a versioned
  update strategy, or players can stay on an old bundle.

## Rollback

Keep the previous `dist/` (or the previous deployment) available. Because `index.html` is
uncached and all bundles are content-hashed, reverting the deployment and purging `index.html` is
enough; hashed assets from the old release remain safe in the CDN cache.

## Release command summary

```bash
npm ci
npm run build:prod
npm test
npm run serve:dist
```
