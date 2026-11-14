# Echoes of the Lost World

An original, cinematic open-world exploration game that runs in the browser. Phase 01 delivered the
vertical slice — a procedurally sculpted valley, the Echo Gate, five recoverable Echo Shards, the
full menu/settings/credits flow, synthesised audio and the asset pipeline. Phase 02 rebuilt the
expedition's movement around a proper over-the-shoulder third-person controller, an authored humanoid
character and a collision world that props, steps and camera booms all share. Phase 03 turns the
valley into a living region: an always-descending Crystal River with two waterfalls, streamed
scatter across five distinct regions, a full day/night cycle, and the ruins, streets and research
station that fill them.

Everything is original work. The project is inspired by the *feeling* of exploring a vast, overgrown
world — it does not use, copy or reproduce any copyrighted characters, assets, environments, stories
or designs from existing games.

Built with **PlayCanvas 2.24**, **TypeScript 5.7 (strict)**, **Vite 6** and a DOM interface styled by
hand-written CSS.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

The dev server binds `0.0.0.0` so it also works behind the sandbox preview proxy.

```bash
npm run build        # typecheck + production bundle into dist/
npm run preview      # serve the production bundle
npm test             # 95 unit/DOM tests (Vitest)
npm run typecheck    # tsc --noEmit
npm run assets       # regenerate the GLB prop library + the Wayfarer character
```

**Requirements:** a WebGL 2 or WebGPU capable browser with hardware acceleration. The renderer tries
WebGPU first and falls back to WebGL 2 automatically.

---

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | `W A S D` / arrow keys | left thumb stick |
| Look | mouse (pointer lock; click-drag fallback) | drag on the right half |
| Run | `Shift` (hold) | run toggle |
| Jump | `Space` | jump button |
| Echo pulse | `E` | pulse button |
| Pause / resume | `Esc` | pause button |
| Toggle FPS + renderer | `F3` | — |
| Mute audio | `M` | — |

Settings (display, camera, audio, accessibility) are reachable from the main menu and the pause
screen, apply immediately and persist to `localStorage`.

---

## What Phase 03 adds — the living world

**Five regions, one heightfield**
- `regions.ts` defines the **Mountain Valley** basin, the **Ancient Forest** (Whispering Grove), the
  **Abandoned City** (Glasshouse Terraces), the **Crystal River** corridor and the **Ancient Research
  Facility** (Station Theta). Region masks blend into the analytic heightfield, tint the terrain,
  name the HUD location and drive which props stream in.
- The old single terrain mesh is now a 3×3 grid of independently culled 300 m tiles at the same
  effective detail, stitched with world-space UVs, plus the far mountain ring.

**The Crystal River**
- A derived, strictly descending water profile (106 stations, ~404 m) carved from the landform, with
  a 1.35 m channel, wet banks, a blended 22 m corridor and a mouth that meets Mirrorwater exactly at
  the water line. Two designed falls (8.4 m at z≈180, 6.2 m at z≈127) break the gradient; the rest of
  the profile is relaxed between them so there are no accidental stair-step rapids.
- A scrolling ribbon mesh, vertical fall sheets, additive foam crests and pools, and drifting spray
  sprites. A stone bridge with piers, rails and lanterns crosses the gorge on the city road.

**Streaming**
- `streaming.ts` is pure, testable chunk logic: 64 m chunks, near/mid LOD rings, nearest-first load
  budgets, upgrades and distance unloads inside a world boundary.
- `ChunkManager` builds each chunk into merged ground cover (two-triangle grass blades and
  wildflowers, one draw call each) plus instanced props, colliders grouped per chunk and disposed with
  it. City blocks/towers/arches, facility pylons/dishes/blocks, crystals, ferns and reeds are placed
  by region-specific rules; hero sites are excluded so nothing intrudes on authored architecture.

**Day/night**
- `dayNightPalette.ts` interpolates ten sky keyframes — zenith, horizon, fog, sun/fill colour and
  intensity, ambient, exposure, stars and a night factor — with a seamless midnight wrap. The sun
  follows a real sinusoid (sunrise 06:00, sunset 18:00) and the moon is its antipode.
- `SkyDome` draws 26 unlit altitude bands, a 420-star additive field, and sun/moon orbs with glows.
  `Lighting` retargets the shadowed key light, sky fill and practical point lights (gate, plaza,
  reactor, bridge, grove, street lamps) every frame; `DayNight` drives fog, exposure, ambient,
  water tint, chunk emissives and landmark glow. The HUD shows a live 24-hour clock and phase.

**Hero architecture (`CivicSites.ts`)**
- A raised city square with a civic tower, apartment slabs, a gateway arch, planters and lamps; a
  reactor deck with a scaled Echo Gate ring, containment band, pylon ring, dishes, lab modules and
  conduits; the Mother Tree clearing with its stone ring and grove lights; and the river bridge with
  walkable deck, piers, rails and lanterns. Each site registers its own collision metadata.

---

## What Phase 02 adds — the controller

**Character**
- An authored humanoid, the **Wayfarer** (`wayfarer.glb`, 595 KiB, 17,738 triangles, 60 primitives,
  7 materials), built by `tools/build-character.mjs`: an expedition suit with helmet, visor, pack,
  cape, boots and a 23-node joint hierarchy. Silhouette and materials are original work.
- The glTF is *not* skinned. The runtime animates the named joints directly: `gait.ts` synthesises a
  target pose for all 23 joints from speed, grounding, vertical velocity, wading, turn rate and a
  landing impulse, and `CharacterModel` damps towards it — so transitions between idle, walk, run,
  jump and landing never snap.
- Locomotion: speed-matched cadence (no foot skating), arm/leg counter-swing, hip sway and bob,
  shoulder lift, spine lean that scales with speed, knee lift, foot roll, air tuck, landing crouch,
  cape and skirt drag, head look-ahead, and a lean into turns.
- Emissive visor and bio-luminescent trim pulse subtly. A procedural primitive rig with identical
  joint names is substituted automatically if the GLB cannot be loaded.

**Controller**
- Capsule controller with damped acceleration, walk (3.5 m/s) and run (6.6 m/s), gravity, jump
  (coyote time + input buffering), slope rejection, step-up (≤ 0.55 m) and step-down smoothing.
- Smooth heading rotation with angular damping; movement is camera-relative (W/S/A/D, arrow keys and
  the touch stick), and the character turns to face travel rather than strafing.
- The character can never end a frame below the walkable surface: the solver resolves props, then
  clamps to the sampled capsule footprint of the terrain, the water floor and any walkable platform.
- Static collision world (`collision.ts`): uniform-grid cylinders for rock clusters, spire trees,
  ruin walls, temple pillars, monolith spires, the Echo Gate plinth and jambs, the plaza dais tiers
  and every test-range object. Walls slide, low walkable tops are stepped onto, tall ones must be
  jumped onto and are dropped off with real gravity.
- Over-the-shoulder camera: 5.4 m spring boom, 0.62 m shoulder offset, mouse/pointer-lock look with
  configurable sensitivity and invert-Y, pitch and zoom clamps, sprint FOV, landing shake, and boom
  collision against both terrain and props (with a final pull-in guard).
- Footstep cadence is distance-based and picks grass/rock/water; jump, landing and boundary events
  feed audio, the camera impulse and the HUD.

**Validation range (`?range=1`)**
- A temporary, purpose-built test environment on the flat Sunken Plaza: a low step, two solid
  pillars of different sizes, a jumpable plateau, a tall wall for camera collision and a ring of
  eight posts. The HUD shows the debug state (grounded/air time, speed, rig source, collider count)
  and the banner names the range. Play at the normal spawn without the flag.

---

## What Phase 01 contains

**Engine & presentation**
- PlayCanvas application bootstrapped with a WebGPU → WebGL 2 device fallback, HDR `CameraFrame`
  pipeline (ACES tone mapping, bloom, vignette, grading, optional SSAO), automatic resolution scaling
  and four quality presets (`low`, `medium`, `high`, `ultra`).
- Responsive full-window canvas with DPR clamping and debounced resize handling.
- WebGL/WebGPU context-loss detection with an explicit recovery screen.

**World**
- 900 m analytic heightfield built from layered value/ridged noise, with a lake basin, plaza
  terrace, gate saddle, windward ridge, grove bowl and a natural amphitheatre rim that acts as the
  expedition boundary instead of an invisible wall.
- Region-aware terrain: 3×3 frustum-culled tiles with baked biome and region vertex colours plus a
  far ring of backdrop mountains.
- Crystal River with two waterfalls, foam, spray and a stone bridge; a day/night cycle driving sky,
  sun/moon, fog, exposure, water and practical lights; streamed chunk content in five regions.
- Runtime-generated detail textures (grass, stone, water normals, motes, glow, sky panorama),
  prefiltered skybox + environment atlas for image-based lighting.
- Directional sun with cascaded shadows, sky fill and flickering practical lights.
- Water surface with layered normal scrolling, fresnel and shoreline tinting.
- Landmarks: the Echo Gate, the Sunken Plaza colonnade, shrine pedestals, ruin walls.
- Atmosphere: an orbiting survey drone companion with counter-rotating rings, drifting motes, lake
  mist and an expanding Echo Pulse torus.
- Third-person camera with terrain-aware boom collision, shoulder offset, sprint FOV, landing shake,
  zoom and reduce-motion support.

**Gameplay**
- Terrain-aware traversal with damped acceleration, slope/climb rejection, gravity, wading speed
  penalties, distance-based footsteps and a soft boundary. (Phase 02 replaced the original movement
  internals with the capsule solver described above; the traversal feel and events remain.)
- The original fully procedural "Wayfarer" rig, kept as the automatic fallback for the Phase 02
  character asset.
- Five Echo Shards to recover. Collecting one plays a pickup burst, updates the HUD, the compass, the
  objective and the gate energy. Recovering all five energises the Echo Gate; returning to it
  completes the expedition.
- Echo Pulse (`E`) scans for the nearest remaining shard and reports distance and compass direction.
- Compass, coordinates/altitude, region discovery banners, wading vignette, contextual prompts,
  toasts and a live FPS readout in the HUD.
- Progress (collected shards, position, playtime) persists between sessions with a **Continue** entry
  in the menu and **New expedition** to reset the valley.

**Interface**
- Loading screen with staged progress, engine/renderer diagnostics and rotating field notes.
- Main menu: Play/Continue, New expedition, Settings, Credits — every entry is functional.
- Pause screen with session statistics, resume, settings and quit-to-menu.
- Settings: quality preset, FOV, mouse sensitivity, invert Y, master volume, bloom, vignette, film
  grain, hints, FPS counter, touch-control mode, reduce motion, reset to defaults.
- Credentials-free, asset-free UI: no external fonts, images or icon packs. All textures, models and
  audio are generated by the project.

**Robustness**
- Per-asset load with timeout, two attempts and isolated failure: a missing GLB is replaced by a
  procedural stand-in and surfaced as a menu warning instead of blocking the game.
- Fatal error screens for boot failure, runtime exceptions, unhandled rejections and context loss,
  each with a retry path. Failures are also logged with context to the console.
- Audio fails silently when Web Audio is unavailable; the game never depends on it.

---

## Architecture

```
src/
  main.ts                 entry point, fatal-boot fallback
  game/
    Game.ts               orchestrator: state machine, input routing, objectives, persistence
    config.ts             tunables, quality presets, world layout, model manifest
    core/
      Engine.ts           PlayCanvas device/application/camera/post-FX ownership
      AssetManager.ts     GLB loading with retries, progress and fallbacks
      Input.ts            keyboard/mouse/pointer-lock/touch, engine-independent
      AudioManager.ts     fully synthesised Web Audio (wind, drone, foley, UI)
      settings.ts         validated, persisted settings and progress stores
      emitter.ts          tiny typed event emitter
    player/
      PlayerController.ts input → solver → entity bridge, traversal events
      locomotion.ts       engine-free capsule solver (accel, step, jump, slide)
      gait.ts             engine-free procedural pose synthesis for 23 joints
      CharacterModel.ts   GLB rig binding, pose damping, primitive fallback rig
      ThirdPersonCamera.ts spring camera, boom collision, cinematic orbit
    world/
      heightfield.ts      the single analytic source of truth for terrain
      collision.ts        uniform-grid solid world + support/blocked queries
      collision helpers    solids.ts (prop metadata), streaming.ts (pure chunk plans)
      regions.ts          five region definitions, labels and points of interest
      riverPath.ts        river centreline, always-descending profile, waterfall detection
      dayNightPalette.ts  keyframed sky palette, sun/moon positions, phase names
      SkyDome.ts Lighting.ts DayNight.ts River.ts CivicSites.ts ChunkManager.ts
      Terrain.ts Sky.ts Water.ts Landmarks.ts Atmosphere.ts Collectibles.ts World.ts TestRange.ts
    util/                 math, noise, textures, mesh building
  ui/
    UiRoot.ts             owns every DOM surface and transitions
    screens/              loading, menu, HUD, pause, settings, credits, fatal, touch
    components/           reusable DOM controls (buttons, sliders, switches, segmented)
  styles/app.css          the entire design system
tools/build-assets.mjs    deterministic GLB writer for the nineteen prop models
tools/build-character.mjs deterministic GLB writer for the Wayfarer humanoid
tests/                    Vitest suites (math, heightfield, stores, assets, UI, boot failure,
                          collision, gait, locomotion, character asset, camera)
```

Design rules followed throughout:

- `heightfield.ts` is the only place terrain height is defined, so the mesh, the player, the camera,
  the props and the water shoreline can never disagree.
- The UI layer never imports PlayCanvas and the engine layer never touches the DOM beyond the canvas.
- Systems are constructed by `World`, which is built by `Game` and disposed in reverse order.

---

## Assets

`tools/build-assets.mjs` writes nineteen small, valid binary glTF 2.0 containers into
`public/assets/models` (rocks, monolith, pillar, gate, rune, spire tree, ruin wall, shard, drone body,
drone ring, city block/tower/arch, facility pylon/dish/block, crystal cluster, fern and reeds) plus
`manifest.json`. They are intentionally tiny and shared with primitive fallbacks, so the repository
carries no opaque binary art.

`tools/build-character.mjs` writes `wayfarer.glb` (595 KiB, 17,738 triangles, 23 named joints, seven
materials) with the same deterministic mesh-building primitives used for the props. Both scripts run
from `npm run assets`; re-running them reproduces byte-identical geometry.

All other visuals — terrain, textures, sky, water, particles, UI — are generated at runtime, and the
character's motion is synthesised in TypeScript rather than baked into animation clips.

---

## Testing

`npm test` runs 95 tests across fifteen suites:

- `math` / `heightfield` / `settings` / `assets` / `ui` / `boot` — the Phase 01 coverage: damping and
  angle maths, deterministic terrain, settings/progress sanitisation, glTF validity and manifests,
  menu/settings/pause/HUD transitions and graceful fatal-screen rendering without a graphics device.
- `collision` — grid queries, push-out from solids, wall-slide normals, support for walkable tops,
  ignoring colliders at or below the feet, camera `blocked()` tests and `clear()`.
- `gait` — every joint is posed, idle breathing, cadence grows with speed, contralateral arm/leg
  swing, airborne tuck, landing crouch, turn lean direction, wading and cape drag; all angles finite.
- `locomotion` — acceleration/braking, walk vs run, camera-relative strafing, turning to face travel,
  jump height and coyote/buffer windows, stepping onto a low platform, falling off a tall one,
  prop push-out and wall sliding, wading, boundary clamping, no terrain fall-through, slope rejection.
- `character` — parses the shipped `wayfarer.glb`: valid GLB header, every runtime-driven joint is
  present, connected hierarchy, human height with feet at the origin, emissive visor/bio materials
  and a real-time triangle budget.
- `camera` — mouse-right turns the view right, sensitivity scaling, invert-Y, pitch/zoom clamps,
  boom shortening against a solid prop and the shoulder offset in `snapToTarget`.
- `river` — monotone descent, the mouth meeting the water line, a navigable channel depth along the
  centreline, exactly two falls with no stair-stepped tail, and arc-length sampling continuity.
- `streaming` — coordinate/key round-trips, nearest-first desired chunks inside the world boundary,
  per-pass load budgets, LOD upgrades and distance unloads.
- `dayNight` — ordered keyframes, a seamless midnight wrap, continuity across the full cycle, the
  sun above the horizon between sunrise and sunset, a low-key starry night and phase names.
- `world-regions` — every point of interest classifies to its own region, names are unique, the city
  and facility pads are flat, the spawn pad is walkable, every echo shard is dry and walkable, and
  region tints differ.
- `character` runtime — binds the rig hierarchy, drives all 23 joints, damps instead of snapping,
  tucks the legs in the air and settles back to idle.

Additional verification performed: `tsc --noEmit` (clean), `vite build` (clean), and dev-server
`curl` checks for `/`, `/src/main.ts`, `/favicon.svg`, `/assets/models/manifest.json`, the prop GLBs
and `wayfarer.glb` (all `200`).

A headless WebGL stack is unavailable in the build sandbox, so the final *visual* pass (lighting,
post-processing, animation feel) must be confirmed in a real browser. The controller's logic, the
character asset, the collision world and the camera's input mapping are covered headlessly; the live
preview was used to confirm the app boots, serves and loads the new asset.

### Manual control checklist

Run the dev server, open the game, then visit `/?range=1`:

1. Click the canvas to capture the mouse; move it in all four directions — the view follows without
   inversion and the sensitivity slider changes the rate.
2. `W A S D` moves camera-relative; the character rotates smoothly to face travel; `Shift` switches
   to a run and the camera widens slightly.
3. `Space` jumps from the pad; jumping off the plateau edge falls under gravity (no snap); coyote
   jumps and buffered jumps both work; landing plays the crouch and camera impulse.
4. Walk into the low step — it is stepped onto. Walk into the pillars and the tall wall — the
   capsule slides, never penetrates. Jump onto the plateau.
5. Stand with the wall or a pillar between the camera and the character — the boom shortens instead
   of clipping. Roll the wheel to zoom.
6. Break line of sight behind the posts to confirm the boom pull-in; walk off the plaza onto the
   valley slopes, into the lake and to the boundary.
7. `F3` shows the debug stats in the range (grounded/air, m/s, `GLB RIG`, collider count).

---

## Known limits (Phase 03)

- The character is an authored, low-poly, jointed figure (17.7k triangles) — a stylised expedition
  suit rather than a scanned actor. It is not skinned and has no baked clips: motion is procedural,
  with no IK, foot planting, ragdoll or facial animation yet.
- Terrain detail is fixed per 300 m tile (no distance LOD within the basin); chunk streaming changes
  prop density, not terrain tessellation.
- The river is a carved corridor, not a fluid simulation: flow is scrolling normal maps and the two
  falls are authored meshes, so there is no buoyancy, current push or swimming.
- One objective loop; no combat, dialogue, inventory, NPCs or vehicles.
- Collision uses vertical cylinders, so overhangs, thin diagonal walls and sloped prop surfaces are
  approximated. Walkable tops are circles; small props are intentionally left non-solid.
- Position is saved at most every eight seconds and on pause/quit, so a hard tab kill can lose a few
  metres of travel (shards are saved immediately).
- No multiplayer, no cloud saves, no gamepad support; touch controls cover movement, look, run,
  jump, pulse and pause.
- Streamed chunks are built on the main thread as the player crosses a boundary, so the first pass
  into a new region can hitch for a frame while props and colliders are created.
- The controller test range (`?range=1`) and its debug HUD remain temporary scaffolding.

---

*Echoes of the Lost World — Phase 03 · v0.3.0*
