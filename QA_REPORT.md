# Echoes of the Lost World — Production QA & Deployment Report

**Release:** v0.8.0 · Phase 08 — Production Release  
**Date:** 2026-11-14  
**Role:** QA / web-game deployment review  
**Scope:** all 15 requested areas, release build, error/loading surfaces, static-host deployment.

> **Evidence rule applied:** a feature is only marked as tested when a command in this repository
> exercised it. Visual rendering, GPU frame time, audible output and real-browser input were **not**
> exercised in this sandbox (no headless Chromium/Firefox/Playwright is installed); those paths are
> explicitly labelled as not tested rather than assumed.

---

## 1. Executive summary

| Item | Result |
| --- | --- |
| TypeScript (strict) | **0 errors** (`npx tsc --noEmit`, exit 0) |
| Automated suite | **31 files / 197 tests passed** (`npx vitest run`) |
| Production build | **PASS** — 1,463 modules, 6.49 s; `tsc` + Vite + release QA + compression |
| Release asset QA | **PASS** — 24 build assets, 20 GLBs, boot markers, hashed entry/chunk |
| Compression | **3,582.0 kB raw → 1,017.1 kB gzip → 732.2 kB brotli** (26 files) |
| Served production artefact | **PASS** — Vite preview and a static server returned 200 with correct MIME/cache/encoding |
| Critical runtime leaks fixed | Loading rAF/tip timer, HUD timers, AudioContext, UI roots, Game double-dispose, corrupt-save shared array |
| Browser/GPU visual validation | **NOT TESTED** — no browser binary in the environment |
| Audible audio / real IndexedDB / touch / pointer lock | **NOT TESTED in a real browser**; logic/fake implementations tested |

The game was not stripped down to pass QA: the fixes are additive lifecycle, error-surface,
asset-path and deployment changes. No existing feature was removed.

---

## 2. Test matrix — 15 requested areas

| # | Area | Executed evidence | Result / boundary |
| --- | --- | --- | --- |
| 1 | **Main menu** | `tests/ui.test.ts` (8 tests): menu/settings/credits/pause screen DOM, play callbacks, progress summary, warning copy; `tests/boot.test.ts` boots the shell and reaches the menu/fatal path; `tests/production-assets.test.ts` checks the shipped shell. | **Tested (DOM/logic).** Visual styling and real pointer interaction not exercised. |
| 2 | **Game loading** | `tests/boot.test.ts` (no-device fatal path), `tests/loading-ui.test.ts` (show → progress → fatal hides spinner → dispose removes every child), `tests/production-assets.test.ts` (`<noscript>`, `__echoesReportBootFailure`, module script, boot shell), `node tools/qa-production.mjs` on `dist/index.html`. | **Tested (DOM/build).** The 15 s network watchdog text and error listener are shipped and asserted; the timeout was not elapsed in a real browser. |
| 3 | **Character movement** | `tests/locomotion.test.ts` (solver + progression modifiers), `tests/gait.test.ts` (walk/run/jump gait synthesis), `tests/character.test.ts` (asset + runtime binding). | **Tested (logic).** No rendered character on screen. |
| 4 | **Camera** | `tests/camera.test.ts` (third-person boom, collision-aware framing, invert/Y, sensitivity). | **Tested (logic).** No rendered camera. |
| 5 | **Terrain collision** | `tests/collision.test.ts`, `tests/heightfield.test.ts`, collision portions of `tests/locomotion.test.ts` (slope/step/water). | **Tested (logic).** No GPU/terrain visual check. |
| 6 | **Open-world exploration** | `tests/streaming.test.ts`, `tests/chunk-instancing.test.ts` (real null-device chunk field, instancing, disposal), `tests/world-regions.test.ts`, `tests/civic-sites.test.ts`, `tests/river.test.ts`, `tests/dayNight.test.ts`, `tests/resource-nodes.test.ts`, plus `npm run benchmark`. | **Tested (systems/CPU).** A full walk across the rendered world was not possible. |
| 7 | **Robotic creature AI** | `tests/creatures-brain.test.ts`, `tests/creatures-species.test.ts`, `tests/creatures-runtime.test.ts` (manager in the open world). | **Tested (logic/runtime).** No visual patrol/encounter observation. |
| 8 | **Missions** | `tests/story-flow.test.ts`, `tests/story-state.test.ts`, `tests/story-world.test.ts`, `tests/story-ui.test.ts`. | **Tested (logic/world/UI).** Full playthrough through the rendered world not performed. |
| 9 | **RPG progression** | `tests/progression.test.ts` (XP/levels, skills, abilities, resources, equipment, save/load, validation), `tests/progression-ui.test.ts`. | **Tested (logic/UI).** |
| 10 | **Inventory** | Equipment/resource/crafting cases in `tests/progression.test.ts`; character-sheet equip/unequip/upgrade/craft callbacks in `tests/progression-ui.test.ts`. | **Tested (logic/UI).** Drag/visual inventory interaction not exercised. |
| 11 | **Save / load** | `tests/settings.test.ts` (settings + progress, corrupt JSON recovery, fresh-array regression), save/load groups and the final-save-before-close case in `tests/progression.test.ts`, `tests/story-state.test.ts`; `fake-indexeddb` used for the progression store. | **Tested (JSDOM + fake IndexedDB).** A real browser reload / IndexedDB quota failure was not exercised. |
| 12 | **Audio** | `tests/audio.test.ts`: no-AudioContext fallback, graph construction against a fake AudioContext, mute/volume, footsteps/jump/pulse/UI calls, `dispose()` closes the context and is idempotent. | **Tested (API/lifecycle), NOT audible.** Headless sandbox cannot listen; no audio-device test. |
| 13 | **Settings** | `tests/settings.test.ts` (sanitisation/clamping, persistence, reset), `tests/ui.test.ts` (settings/credits/pause), preference application in `tests/loading-ui.test.ts`; production shell checks. | **Tested (logic/DOM).** Real slider feel, pointer lock and persisted browser settings not observed. |
| 14 | **Browser compatibility** | Static audit of `src/styles/app.css` and runtime feature use; WebGL 2/WebGPU fallback is implemented in `Engine.ts`; `tests/boot.test.ts` exercises the no-device fatal path; production shell includes a `<noscript>` and module watchdog. | **NOT TESTED in real Chrome/Firefox/Safari/Edge.** The fallback path and static compatibility were tested; no browser matrix was run. |
| 15 | **Performance** | `npm run benchmark` (null graphics device); production build timing; gzip/brotli transfer budget; static-server headers; no GPU counters available. | **Partially tested (CPU/transfer), GPU FPS NOT TESTED.** See §5. |

### Asset / build checks (cross-cutting)

- `node tools/qa-production.mjs` — every local `src`/`href` exists, boot/error markers present,
  hashed entry + `playcanvas-*` chunk present, 20 GLBs have glTF 2 magic/version and match the
  manifest byte counts. Output: `[qa] PASS ...`.
- `tests/production-assets.test.ts` — model URL/file parity, boot shell IDs, `<noscript>`,
  watchdog marker, `_headers` cache/MIME rules, `.nojekyll`.
- `tests/assets.test.ts`, `tests/character.test.ts` — generated prop library and Wayfarer asset.
- Browser probe: no `chromium`, `firefox`, `playwright` or `puppeteer` binary is installed, so
  automated visual/GPU tests were not attempted and are not claimed.

---

## 3. Fixes applied in this phase

| Defect / risk | Fix | Evidence |
| --- | --- | --- |
| Loading screen left a `requestAnimationFrame` loop and tip interval alive after teardown | `LoadingScreen.dispose()` sets a guard, stops tip timer/timeout and removes the surface; `show/hide` own the timer lifecycle. | `tests/loading-ui.test.ts`; `tsc` clean. |
| Fatal error could replace the menu while the loading spinner stayed on top | `UiRoot.showFatal()` hides loading first; `LoadingScreen.hide()` stops timers. | `tests/loading-ui.test.ts`; `tests/boot.test.ts`. |
| HUD toast/banner/scan timers survived UI teardown | `Hud.dispose()` clears timers, dismisses toasts and removes the HUD root; `hide()` also hides the scan panel. | `tests/loading-ui.test.ts` asserts zero UI children after `UiRoot.dispose()`. |
| Every UI screen remained mounted after `UiRoot.dispose()` (duplicate HUDs on HMR/re-init) | Dispose now destroys menu, touch, pause, credits, settings, dialogue, journal, puzzle, character, atmosphere and fade. | Same test. |
| `AudioContext` was never closed | `AudioManager.dispose()` nulls the graph and closes the context exactly once; guarded against a second call. | `tests/audio.test.ts` (context `closed === true`; repeated dispose safe). |
| Game teardown did not flush progress and could double-dispose | `Game.dispose()` saves progress, removes event handlers, disposes audio/input/systems and guards re-entry; `ProgressionSystem.dispose()` drains in-flight saves before closing IndexedDB. | New `drains the final save before closing IndexedDB` test passes; existing boot/UI suites; `tsc` clean. **Real page unload not browser-tested.** |
| Corrupt local progress could fall back to a shared mutable empty array | Fallback uses `blankProgress()`; regression test confirms a corrupt store starts fresh and does not mutate `EMPTY_PROGRESS`. | `tests/settings.test.ts` new case passes. |
| Subpath builds emitted root-relative asset URLs | Vite `base` is configurable via `VITE_BASE`; `MODEL_URLS` now resolves the base correctly; favicon is relative; QA script honours the base. | `VITE_BASE=/echoes/ npm run build:prod`; HTML contained `/echoes/assets/...`, bundle contained `/echoes/assets/models/...`. |
| Module-load failure left a permanent spinner | `<noscript>` panel plus inline 15 s watchdog with error capture and Reload; `main.ts` reports `game.boot()` rejections into a body-level fatal panel. | Shipped markup assertions in `tests/production-assets.test.ts` / `qa-production.mjs`; boot test. |
| Production host had no cache/MIME/security policy | `public/_headers`, `netlify.toml`, `vercel.json`, `.nojekyll`; static server mirrors them. | `tests/production-assets.test.ts`; curl headers. |
| No release artefact verification or transfer budget | `tools/qa-production.mjs`, `tools/precompress.mjs`, `tools/serve-dist.mjs`, npm scripts. | `npm run build:prod` PASS; compression numbers below. |

### Version / build changes

- `package.json`, `package-lock.json`: **0.8.0**.
- `GAME.phase`: **Phase 08 — Production Release**; `GAME.version`: **0.8.0**.
- Added scripts: `qa:assets`, `compress`, `build:prod`, `serve:dist`; `preview` binds `0.0.0.0:4173`.

---

## 4. Known limitations

1. **No real-browser/GPU validation.** The environment has no Chromium/Firefox/Playwright. Rendering,
   shader compilation, animations as seen on screen, touch input, pointer lock, audio output and
   the 15 s watchdog under a failed network are **not** observed. Do not treat the automated suite
   as a substitute for a device/GPU pass.
2. **PlayCanvas chunk is large.** The engine chunk is 2.36 MB raw / 607 kB gzip / 468 kB brotli.
   First load on a slow link will spend time downloading and parsing it. There is no engine
   code-splitting or service-worker pre-cache.
3. **No authored compressed textures.** Props and the Wayfarer are small GLBs with no image
   textures; runtime textures are generated. KTX2/Basis is not used (deliberate, documented in the
   README).
4. **Saves are origin-scoped.** localStorage/IndexedDB data does not follow a hostname, port or
   scheme change. Private browsing/quota failures fall back to memory but cannot persist.
5. **Context loss is terminal.** A lost WebGL context shows the fatal panel and requires reload; the
   restore handler only logs. No automatic scene rebuild.
6. **Save-on-dispose is not browser-tested.** The code path is covered by unit-level save/load
   tests, but a real page-close transaction was not observed.
7. **Dev-only audit findings.** `npm audit` reports 6 vulnerabilities (3 moderate, 1 high,
   2 critical) in Vite/Vitest/Tinypool/esbuild/@vitest/mocker — **development tooling**, not shipped
   runtime code. They were not force-upgraded because that would be a major toolchain change in a
   production-hardening pass. The shipped dependency is PlayCanvas.
8. **Bundle size warning.** Vite reports a >500 kB chunk (the engine); this is expected and is
   documented rather than hidden. No gzip/brotli double-counting is used in the transfer figures.
9. **Test-only scaffolding remains.** `?range=1` and its debug HUD are still present; they are not
   linked from the production menu.
10. **Browser compatibility matrix is unverified.** WebGL 2/WebGPU fallback is implemented, but
    Safari/Firefox/Edge, mobile GPU drivers, reduced-motion and high-contrast settings were not run
    in real browsers. The CSS audit found no `:has`, `subgrid` or `color-mix`; `svh` has a `vh`
    fallback; `backdrop-filter` is prefixed.
11. **No automated visual regression or asset-pixel comparison.** Model byte integrity and glTF
    version are checked; appearance is not.
12. **No multiplayer/cloud sync/telemetry**, by design; there is no backend.

---

## 5. Performance measurements

All figures below were produced by commands in this checkout on 2026-11-14. CPU benchmark uses the
PlayCanvas **null graphics device** and therefore excludes rasterisation, shader cost and GPU
memory bandwidth.

### 5.1 Production build

| Artefact | Raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| `index.html` | 5,197 B | 2,154 B | 1,639 B |
| `assets/index-DLGaWReU.css` | 64,150 B | 12,319 B | 10,760 B |
| `assets/index-B2xbdbYg.js` (game) | 415,744 B | 127,691 B | 107,094 B |
| `assets/playcanvas-DOmavAsH.js` | 2,357,142 B | 605,190 B | 467,839 B |
| `assets/models/wayfarer.glb` | 609,292 B | 172,905 B | 68,055 B |
| **All 26 compressed inputs** | **3,582.0 kB** | **1,017.1 kB** | **732.2 kB** |

- Build: **1,463 modules transformed, 6.49 s** (Vite + strict `tsc`).
- Release QA: 24 build assets, 3.49 MB raw; all references and 20 GLBs pass.
- Hash-named bundles: `/assets/index-B2xbdbYg.js`, `/assets/index-DLGaWReU.css`,
  `/assets/playcanvas-DOmavAsH.js`.
- Static verification: 200 + correct `Content-Type` for `/`, JS, CSS, `manifest.json`,
  `wayfarer.glb` and `favicon.svg`; brotli response for the JS decoded to the exact file SHA-256;
  `.glb` served as `model/gltf-binary`; missing `.glb` returned **404** rather than HTML.

### 5.2 World streaming CPU benchmark

`npm run benchmark` (null device, 2026-11-14):

```text
Preload (spawn, 9 m radius ring): 132.9 ms
Path: 95 updates, 1.13 ms average, 0.16 ms median, 6.09 ms p95, 12.38 ms worst
Resident chunks: 56 (19 near / 37 mid)
Instanced props: 9749 across 180 render entities
Pending queue: 0
```

These numbers vary with machine load/patch state; a previous Phase 07 run measured 79.0 ms preload
and 0.73 ms average. The point is the shape: sub-millisecond median, occasional multi-millisecond
worst-case chunk construction, no pending queue at the end. **No FPS, draw-call or GPU frame-time
measurement exists**; use F3 in a real browser for those.

### 5.3 What was not measured

- FPS / 1% lows / GPU frame time.
- Time-to-first-render on a cold network.
- Mobile thermal/battery behaviour.
- Real IndexedDB write latency or audio latency.
- Memory retention in a browser over a long session (only lifecycle tests and teardown paths).

---

## 6. Deployment instructions (summary)

Full details, host-specific config, cache rules, Nginx example and rollback are maintained in
[`DEPLOYMENT.md`](DEPLOYMENT.md). The short version:

```bash
npm ci
npm run build:prod       # tsc + vite build + qa:assets + gzip/brotli
npm test
npm run serve:dist       # local CDN-like verification on 0.0.0.0:4174
```

- Publish **`dist/`**; no server runtime or API is required.
- Keep `index.html` `no-cache`; serve hashed `/assets/*` immutable; serve GLBs as
  `model/gltf-binary`.
- For a project subpath: `VITE_BASE=/repo/ npm run build:prod` (same env for QA); do not mix bases.
- Enable the provided `_headers`/`netlify.toml` or `vercel.json`; the CSP needs `'unsafe-inline'`
  for the inline boot watchdog and `blob:` for engine workers.
- Do **not** rewrite `/assets/*` to `index.html`. Only a missing HTML route may fall back.
- Use HTTPS and one canonical origin so localStorage/IndexedDB saves remain addressable.
- Verify after deploy: boot shell → menu, fresh-origin Continue disabled, new expedition HUD,
  settings persist after reload, no console errors, `favicon.svg`, `manifest.json` and
  `wayfarer.glb` return 200.

**Requirements:** WebGL 2 or WebGPU, JavaScript, hardware acceleration. Pointer lock/audio need a
user gesture. No cross-origin isolation headers are required.

---

## 7. Release sign-off

- **Ship-blocking automated failures:** none observed (`tsc` exit 0; 197/197 tests pass; build and
  release QA exit 0).
- **Ship-blocking manual/GPU failures:** unknown — visual and real-browser validation were not
  possible here. Treat the build as **automated-QA green / real-device QA pending**.
- **Regressions removed:** none intentionally; all changes are additive or lifecycle/error-path
  fixes.
