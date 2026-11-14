# Echoes of the Lost World

An original, cinematic open-world exploration game that runs in the browser. Phase 01 delivered the
vertical slice — a procedurally sculpted valley, the Echo Gate, five recoverable Echo Shards, the
full menu/settings/credits flow, synthesised audio and the asset pipeline. Phase 02 rebuilt the
expedition's movement around a proper over-the-shoulder third-person controller, an authored humanoid
character and a collision world that props, steps and camera booms all share. Phase 03 turns the
valley into a living region: an always-descending Crystal River with two waterfalls, streamed
scatter across five distinct regions, a full day/night cycle, and the ruins, streets and research
station that fill them. Phase 04 adds the valley's robotic wildlife: four original machine species
with their own bodies, patrols, personalities, scannable weaknesses and cinematic first encounters.
Phase 05 adds the story layer: an original Chapter One with three main missions, three side missions,
two ancient-technology puzzles, three characters, branching dialogue, a mission journal, a codex of
recovered memories and two endings. Mission progress is saved locally and every mission is playable
from the world, not just described in data. Phase 06 adds the field record: a complete RPG
progression layer with experience and levels, a five-discipline skill tree, nine exploration
abilities, resources, equipment upgrades, crafting, a character sheet and validated IndexedDB saves.

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
npm test             # 182 unit/DOM/integration tests (Vitest)
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
| Scan robotic creature | `F` | scan button |
| Interact / talk / read | `R` | use button |
| Mission journal | `J` | log button |
| Pause / resume | `Esc` | pause button |
| Toggle FPS + renderer | `F3` | — |
| Mute audio | `M` | — |

Settings (display, camera, audio, accessibility) are reachable from the main menu and the pause
screen, apply immediately and persist to `localStorage`.

---

## What Phase 05 adds — Chapter One, the Silence That Answers

The valley did not lose its people. It stored them.

Four hundred and twelve years ago the **Quiet** — a solar winter — made the surface uninhabitable.
The Halcyon Compact copied the population of Mirrorwater into the **Echo Lattice** and asked a
caretaker to wait for a witness. The witness never came. The machines kept tending an empty world.

You play an expedition archivist who walks into that waiting. **Iona Vale** has listened to the ruins
for thirty years; **Kesh Adeyemi**, nine fingers and four missing caches, knows the city better than
she admits; **SABLE-9** has kept the Continuity Vault alone since the last technician stopped
answering. Their chapter ends at the Echo Gate with the Choir of 41,892 stored voices — carry them
home as memory, or open the lattice and let them return.

### Missions and objectives

All six missions are authored in `src/game/story/content.ts`, tracked by the engine-free
`MissionSystem`, and completed through real world interactions.

| Mission | Type | Given by | Objectives | Reward |
| --- | --- | --- | --- | --- |
| **The Cartographer's Silence** | Main | Iona Vale | Speak with Iona · recover Mara Vale's survey ledger · return it | +40 marks · Survey Lens (scan range 58 → 70 m) |
| **The Vault That Waited** | Main | Iona Vale | Reach Station Theta · find SABLE-9 · align the Continuity Lock · take the key · report back | +80 marks · Resonance Capacitor (pulse cooldown 3.2 → 2.2 s) |
| **The Witness Array** | Main | Iona Vale | Recover all five Echo Shards · meet Iona at the gate · align the Witness Array · answer the Choir | +150 marks · the Continuity Archive |
| **The Surveyor's Shadow** | Side | Iona Vale | Recover three survey stakes · return them | +35 marks · Mara Vale's bearings |
| **Nine-Fingers' Bargain** | Side | Kesh Adeyemi | Recover three salvage caches · return them | +45 marks · Kesh's field kit |
| **Caretaker's Memory** | Side | SABLE-9 | Scan a Scuttler, Grazer and Drifter · return the fragments | +60 marks · Caretaker Cipher |

Objective kinds are `talk`, `reach`, `interact`, `scan`, `shards`, `puzzle` and `choice`. The HUD
shows the tracked objective, progress counters and a compass marker; the journal (`J`) lists every
main and side mission, objective state, reward, carried relic and recovered archive fragment.
Completing a mission awards marks, items, codex entries and, for the main thread, a permanent
gameplay upgrade.

### Dialogue, characters and story progression

- Branching conversations are data (`DialogueDefinition` → nodes → choices → effects), with
  requirements for mission state, flags and chapter completion. Higher-priority conversations
  replace repeats, so Iona's request changes after the ledger, after the vault and after the
  ending. Choices can set flags, give items, add codex entries, start missions, move a character
  and finally record an ending.
- The dialogue overlay supports mouse and keyboard (numbers `1–4`, `Esc`), keeps focus inside the
  conversation, and frames the speaker's name, role and topic.
- Three original characters have bespoke world presence: Iona's staff, satchel and amber signal;
  Kesh's pack and hovering drone; SABLE-9's projector plinth, holographic bust and rotating rings.
  They turn toward the player, carry quest markers and relocate as the story demands.
- Story progression is a versioned local save (`eotlw.story.v1`) holding active/completed missions,
  per-objective counters and scanned targets, flags, marks, items, codex, seen conversations,
  read memorials and the chosen ending. Corrupt or old data is sanitised, and an interrupted save
  repairs itself to the next unlocked mission.

### Ancient technology puzzles

Two deterministic three-dial mechanisms use the fiction of the Continuity Project:
- **The Continuity Lock** at Station Theta — *"second note, first silence, fourth light."*
- **The Witness Array** at the Echo Gate — *"what the valley kept, what the vault lost, what the
  witness carries."*

Each dial cycles symbols; the interface supplies the remembered cadence, reports a failed alignment
without punishment, and can be left at any time. Solving the correct combination completes the
current objective and persists immediately.

### Environmental storytelling

- Five readable memorials carry recorded voices from before the Quiet (the Sunken Plaza, Glasshouse
  Terraces, Station Theta, Mother Tree and Mirrorwater lake). They are permanent, optional archive
  fragments and each adds a codex entry.
- The survey ledger, survey stakes, salvage caches, continuity key and gate witness are physical
  objects placed on the terrain, hidden until their mission makes them relevant and removed when
  recovered. Their lights, rings, holograms and idle motion make the valley's ancient technology
  legible without a quest arrow.
- Codex entries cover the Quiet, the Halcyon Compact, the Echo Lattice, the caretakers, the Choir,
  the gate and the characters. The journal keeps them after the chapter ends.

### Both endings

The final choice is permanent in the save and reflected in the ending card and journal:
- **The Names We Carry** (`preserve`) — the Choir becomes a library, carried home as memory.
- **The Long Return** (`broadcast`) — the lattice reopens and the valley is no longer quiet.

After the ending, the world remains explorable, the journal retains the full chapter and the gate
stays lit.

---

## What Phase 04 adds — robotic wildlife

Four original machine species live in the existing valley. They are not set dressing: each walks a
route, notices you, reacts to the world, returns home, can be scanned, and remembers being catalogued.

| Species | Class | Habitat | Threat | Fictional environmental weakness |
| --- | --- | --- | --- | --- |
| **SC-07 Mossback Scuttler** | hexapedal scavenger | forest floor, plaza edge | 1 | *Phototropic overload* — solar vanes lock onto an echo pulse |
| **GR-02 Cinderhull Grazer** | quadruped furnace | valley meadow, grove | 3 | *Resonance-blind knee servos* — reactor hum desynchronises its stride |
| **DR-11 Glasswing Drifter** | thermal glider | above the falls and lake | 2 | *Thermal dependency* — cold spray forces it to settle |
| **WD-01 Verdigris Warden** | armoured custodian | city square, Station Theta | 4 | *Echo-keyed aegis* — the shield locks for a breath when pulsed |

**One brain, four personalities**
- `creatures/brain.ts` is a single deterministic state machine reused by every species:
  **perception** (sight cone with concealment, hearing, proximity), **steering** (slope, water,
  prop and neighbour avoidance), **routine** (idle → patrol → wait, or roaming around a den),
  **event reaction** (surges, beacons, reactor hum, wind and echo pulses), **threat response**
  (flee, stand-and-display, controlled advance) and **homing** (a leash plus an explicit return
  state). Species differ only by numbers — the Scuttler bolts, the Warden advances, the Grazer
  holds its ground, the Drifter banks away.
- Patrol waypoints that are unreachable (wedged inside a ruin) time out and advance instead of
  trapping the creature. Walking slowly shrinks the silhouette the machine can resolve; sprinting
  makes you easier to notice and louder.
- Nothing is random at runtime: each individual seeds its own wander and idle rhythm from its id.

**Scanning, clues and avoidance**
- `F` scans the nearest machine in the camera cone (58 m, terrain and prop line of sight) and opens
  a specimen panel: classification, state, distance, size, mass, awareness, temperament,
  behaviour and an **environmental weakness** expressed as a fictional puzzle clue plus a tactic.
- Scan reports name the world feature to exploit. They are hints, not violence: pulse a Scuttler
  from uphill, lure the Grazer across the facility hum, pull the Drifter through the falls' spray,
  or stagger the Warden from beyond its post and slip past. The HUD counts catalogued species (0–4).
- A danger chip warns when a nearby machine is watching, challenging, investigating or bolting,
  and its state is visible on the creature itself through eye colour, glow intensity and posture.

**Cinematic first encounters**
- The first time you meet a Grazer, Drifter or Warden, the camera eases into a slow orbit of the
  machine, the HUD letterboxes, movement pauses, and the creature performs a species-specific
  display (rear up, wingspread, aegis raise) before returning to its routine. Each species is
  framed once, so the world stays playable.

**Non-graphic energy interaction**
- The Echo pulse (`E`) is a fictional resonance, never a weapon. Machines within 34 m are dazed
  for a moment — the Scuttler's vanes fold, the Drifter lists, the Grazer stalls, the Warden's
  aegis rings — then they reboot and go back to being wary. No damage, no defeat states.

**Procedural mechanical bodies**
- `CreatureModel.ts` builds four rigs from a local geometry kit (`geometry.ts`): faceted armour
  plates, brass pistons, ribbed heat sinks, rivets, sensor lenses, exhausts, vanes, wings, tails,
  shields and pikes. Each rigid joint merges into one opaque mesh plus optional emissive mesh,
  so each creature costs roughly a dozen draw calls and all nine together about 130.
- Materials are metallic PBR with per-vertex paint, plus unlit emissive conduits and lenses. The
  glow breathes with state, brightens at night, flares on a pulse, and the two large species carry
  a small coloured point light.
- Animation is procedural: tripod gait, diagonal quadruped gait, stomping biped, wingbeats with
  lagged tips, hover ring, tail sway, head tracking, jaw and aegis displays, all damped so states
  never snap.

**Where to find them**
- Scuttlers: forest floor near the Mother Tree (patrol), and the trail edge at `(56, 4)` (free
  roamer).
- Grazers: the meadow at `(96, 40)` and the grove at `(150, -70)`.
- Drifters: above the upper falls at `(2, 168)` (thermal circuit) and over Mirrorwater at
  `(-70, -58)` (free roamer).
- Wardens: the Glasshouse Terraces square around `(-198, -25)` and the Station Theta deck
  perimeter at `(-100, 190)`.

All names, silhouettes, palettes, behaviour copy and weakness clues in this system are original to
this project.

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

`npm test` runs 182 tests across twenty-six suites:

- `math` / `heightfield` / `settings` / `assets` / `ui` / `boot` — the Phase 01 coverage: damping and
  angle maths, deterministic terrain, settings/progress sanitisation, glTF validity and manifests,
  menu/settings/pause/HUD transitions, the specimen scan panel, danger readout and encounter
  letterbox, and graceful fatal-screen rendering without a graphics device.
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
  boom shortening against a solid prop, the shoulder offset in `snapToTarget` and the encounter
  `frameOn` orbit with its timed release.
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
- `civic-sites` — the always-resident city square, reactor deck, Mother Tree and river bridge build
  against a headless PlayCanvas device, register their colliders and dispose their materials.
- `creatures-species` — all nine roster points are dry, walkable and inside the basin, species
  metadata is complete and unique, every rig joint exists, patrols have at least three reachable
  stops (or are deliberate free roamers), and encounter/weakness copy is present for the codex.
- `creatures-brain` — deterministic sight cones, slow-walk concealment, sprint noise, hearing and
  proximity, patrol/wait/roam routines, flee/display/advance responses, environmental reactions,
  leash return, waypoint timeouts, pulse daze recovery, night-scaled sight and seed-stable idling.
- `creatures-runtime` — a headless PlayCanvas null device builds all nine bodies, ticks them for
  twenty seconds without leaving the terrain, scans a specimen through the camera cone, dazes a
  machine with the pulse, frames a first encounter and disposes the rig cleanly.
- `story-flow` — the whole of Chapter One without a renderer: all six missions in one run, both
  endings, reward/mark accounting, journal completion, side missions, save/reload and corrupt-save
  recovery, and the fact that optional memorials never duplicate their archive entry.
- `story-state` — mission sanitisation, overlap repair, interrupt recovery, reward idempotency and a
  fresh-story reset.
- `story-world` — headless PlayCanvas builds all three characters and sixteen story objects, checks
  every placement is grounded and interactable, plays the main chapter through proximity prompts and
  real objects, and walks every side objective, character and memorial.
- `story-ui` — dialogue rendering and keyboard/number responses, both puzzle dial states and the
  single-fire solve callback, and the journal's missions, objectives, rewards and archive.
- `progression` — XP, levelups, cap, skill prerequisites, point budgeting, ability unlocks, derived
  stats, resource yield, scan samples, node one-shots, equip/upgrade/craft, discounts, IndexedDB
  round-trip, reset and corrupt-save repair.
- `progression-ui` — all five character-sheet tabs, Learn/Upgrade/Equip/Unequip/Craft callbacks,
  close paths and the HUD level/stamina readouts.
- `resource-nodes` — all twenty caches build grounded, nearest interaction, gather hiding and the
  survey-marker state.
- `locomotion` progression — Vault Step's mid-air jump and the water-speed multiplier; the shared
  `DEFAULT_TUNING` constant is never mutated.

Additional verification performed: `tsc --noEmit` (clean), `vite build` (clean), and dev-server
`curl` checks for `/`, `/src/main.ts`, `/favicon.svg`, `/assets/models/manifest.json`, the prop GLBs
and `wayfarer.glb` (all `200`).

A headless WebGL stack is unavailable in the build sandbox, so the final *visual* pass (lighting,
post-processing, animation feel) must be confirmed in a real browser. The controller's logic, the
character asset, the collision world and the camera's input mapping are covered headlessly; the
running dev server was checked for the app shell, every source module and all GLB payloads (HTTP 200).

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

## What Phase 06 adds — the Field Record

The expedition now has a persistent character progression layer. Everything below is playable from
the world and survives a reload.

### Ten connected systems

1. **Player XP** — awarded for shards, first scans, missions, puzzles, gathered resources, recovered
   memories, both endings, equipment upgrades and crafting. Every source runs through one multiplier
   (`xpBonus`) so utility gear genuinely accelerates the character.
2. **Character levels** — levels 1–20. Each level grants 2 skill points. The XP curve is
   `100 + (level − 1) × 60`; level 20 is the cap and the HUD switches to a cap state.
3. **Skill tree** — 15 skills in five disciplines, each with three tiers and ranks. Tier 2 requires
   rank 1 of its foundation; tier 3 requires rank 2 of the tier below. Ranks cost skill points and
   apply immediately to derived stats.
4. **Exploration abilities** — nine unlockable abilities granted at specific ranks:
   Survey Instinct, Wayfinder, Cache Sense, Vault Step (double jump), Water Stride, Scan Sample,
   Overclock, Field Medic and Salvage Eye. Each one is wired into gameplay rather than being a label.
5. **Inventory** — resources, armoury equipment, active loadout and known field blueprints share one
   character sheet with the expedition record.
6. **Collectible resources** — 20 authored cache nodes around the valley produce echo-glass,
   ferro-scrap, bio-fibre, lattice-fragment and storm-salt. Nodes are one-shot, animate in the world,
   appear on the compass with Survey Instinct and yield more with Cache Sense.
7. **Equipment management** — four slots (tool, suit, pack rig, scanner). Eight items exist: four
   starter items and four tier-two items. Equipment contributes base stats plus per-level stats.
8. **Equipment upgrades** — every item upgrades through three levels with escalating resource costs.
   Salvage Eye and Salvage Master discount those costs; each upgrade refunds XP.
9. **Player statistics** — distance travelled, time in the valley, shards, scans, missions, puzzles,
   resources, memories, upgrades, skill ranks and total XP. The character sheet exposes the full
   record plus category mastery.
10. **Save/load progression** — a single versioned profile in IndexedDB (`echoes-progression`),
    debounced after every change and flushed on pause, quit, visibility loss and page unload. Every
    load is validated and repaired; corrupt levels, skills, equipment, resources and counters cannot
    crash the game or grant impossible items.

### The five disciplines

| Discipline | Tier 1 | Tier 2 | Tier 3 |
| --- | --- | --- | --- |
| Exploration | Field Survey (+yield, Survey Instinct) | Ruin Lore (+XP, Cache Sense) | Wayfinder (+movement, Wayfinder) |
| Movement | Trailcraft (+movement) | Vaulting (+jump, Vault Step) | Endurance (+stamina) |
| Scanning | Optic Tuning (+scan range) | Field Analysis (+XP, Scan Sample) | Catalogue (+yield) |
| Survival | Hardy (+stamina) | Watercraft (+water speed, Water Stride) | Field Medicine (+regen, Field Medic) |
| Technology | Capacitor (−pulse cooldown, Overclock) | Lattice Decipher (+XP, Salvage Eye) | Salvage Master (+upgrade discount) |

### The character sheet

Press **C** (or **K**) during an expedition, or choose **Field record** on the pause screen. The
five tabs are **Overview**, **Skills**, **Inventory**, **Equipment** and **Statistics**:

- Overview: level, XP bar, all eleven live attributes, current loadout, ability collection.
- Skills: category sections, rank pips, prerequisites, effects, ability unlocks and live
  Learn/Upgrade/Locked buttons. Buttons disable exactly when the cost or prerequisite is unmet.
- Inventory: resource cards, recipe cards, level requirements and a working Craft button.
- Equipment: loadout slots with Unequip, owned gear with Equip, upgrade level/cost/next stats and a
  working Upgrade button, plus the field crafting bench.
- Statistics: the expedition record, attribute provenance and category mastery bars.

The HUD adds a level badge, XP bar, unspent skill-point cue and stamina bar. Sprinting drains
stamina; survival skills raise the pool and regeneration. The compass uses a distinct marker for
resource caches and Wayfinder expands the survey from one to three nearby cache signals.

### Persistence and validation

The profile is a plain serialisable `ProgressionProfile` written to IndexedDB through an injectable
`ProgressionPersistence` interface. `validateProfile` is applied to every read:

- levels and XP clamp to the legal range; skill-point spending is capped by level;
- unknown or prerequisite-invalid skills are removed before stats are derived;
- equipment, equipped slots and resources are checked against authored content;
- gathered nodes, scanned species, puzzles, shards, missions, memories and endings are filtered to
  known IDs and de-duplicated;
- every statistic is a bounded finite number; malformed records become a clean starter profile.

A fresh expedition clears the IndexedDB record together with shards and Chapter One. Continuing
imports previous Chapter One progress (shards, completed missions, solved puzzles, memories and the
ending) into the field record exactly once, so upgrading an existing save does not lose earned XP.

### Phase 06 tests

`progression` — XP, levelups, cap, skill prerequisites, point budgeting, ability unlocks, derived
stats, resource yield, scan samples, node one-shotting, equipment equip/upgrade/craft, discount
maths, IndexedDB round-trip, reset and corrupt-save repair. `progression-ui` — all five tabs,
Learn/Upgrade/Equip/Unequip/Craft callbacks, close paths and HUD level/stamina readouts.
`resource-nodes` — all 20 caches build grounded, nearest interaction, gather hiding and survey state.
`locomotion` — Vault Step air jump and water-speed modifiers. The full suite is **182 tests across
26 files**.

### Phase 06 manual checklist

1. Start an expedition, press `C`; the sheet opens with level 1, 2 skill points and four equipped
   starter items. Switch all five tabs and close with the button, backdrop or Escape.
2. Spend points in Skills. Confirm the HUD skill-point cue clears and movement/scan/pulse numbers
   change on Overview.
3. Walk to a cache (for example near the Plaza) and press `R`; the crystal disappears, the resource
   count rises and XP appears. Try the same cache again — it reports already gathered.
4. Scan a machine with `F`; first scans grant XP. Unlock Field Analysis rank 2 and confirm a first
   scan also deposits a sample resource.
5. Unlock Vaulting rank 2 and press Space twice in the air; then test Watercraft in the lake.
6. Gather materials, craft a tier-two item on the Inventory/Equipment bench, equip it and upgrade it.
7. Open pause → Field record, then close back to pause. Reload the page and continue: level, skills,
   resources, equipment, gathered nodes and statistics must all be present.
8. Corrupt the browser's IndexedDB record (or use devtools) and reload: the game must start from a
   validated profile and report that recovery happened instead of failing to boot.

### Known limits (Phase 06)

- Progression is local to this browser origin. There is no cloud sync, account or cross-device save.
- Chapter One plus one full resource/equipment pass supports roughly levels 1–8. Level 20 and the
  complete 15-skill tree are deliberate headroom for later chapters rather than being reachable in
  this build.
- Character progression is horizontal and exploration-focused: there is no combat levelling, loot
  rarity, sockets, enchantments, talent respec or item durability.
- All eight equipment items are hand-authored; crafting uses fixed recipes, not procedural rolls.
- Resource nodes are one-shot per profile and do not respawn. Twenty nodes are enough for the full
  upgrade/recipe economy, but a player who spends everything cannot farm more in the same profile.
- Statistics are counters, not a telemetry system: no per-session charts, achievements or leaderboards.
- The sheet is keyboard/pointer accessible with ARIA tabs and disabled-button reasons, but it has not
  been audited against every screen reader.
- The HUD indicates stamina and XP, but there is no separate health, hunger or temperature system.

## Earlier-phase limits (Phase 01–05)

- The character is an authored, low-poly, jointed figure (17.7k triangles) — a stylised expedition
  suit rather than a scanned actor. It is not skinned and has no baked clips: motion is procedural,
  with no IK, foot planting, ragdoll or facial animation yet.
- Terrain detail is fixed per 300 m tile (no distance LOD within the basin); chunk streaming changes
  prop density, not terrain tessellation.
- The river is a carved corridor, not a fluid simulation: flow is scrolling normal maps and the two
  falls are authored meshes, so there is no buoyancy, current push or swimming.
- One authored chapter. Story content is finite; there is no procedural quest generator, combat,
  vehicle or companion system. Robotic creatures cannot be damaged or defeated — the Echo pulse
  only dazes them, and they always reboot.
- Dialogue is presented as text with a speaker card; there is no voice acting or facial animation.
  SABLE-9's hologram and the two puzzles are stylised interfaces rather than simulated systems.
- Collision uses vertical cylinders, so overhangs, thin diagonal walls and sloped prop surfaces are
  approximated. Walkable tops are circles; small props are intentionally left non-solid.
- Position is saved at most every eight seconds and on pause/quit, so a hard tab kill can lose a few
  metres of travel (shards are saved immediately).
- No multiplayer, no cloud saves, no gamepad support; touch controls cover movement, look, run,
  jump, pulse, scan, journal, field record and pause.
- Streamed chunks are built on the main thread as the player crosses a boundary, so the first pass
  into a new region can hitch for a frame while props and colliders are created.
- Chapter progress, settings, shard position and the field record are four separate local saves. Story NPCs and props
  are not streamed; all nineteen story objects and three characters stay resident for the session.
- Creatures avoid solids and steep ground through local probing rather than pathfinding, so a very
  narrow gap or a perfectly walled-in patrol point may be skipped by the 18 s waypoint timeout. They
  have no rigid-body collision with each other or the player.
- The controller test range (`?range=1`) and its debug HUD remain temporary scaffolding.

---

*Echoes of the Lost World — Phase 06 · v0.6.0*
