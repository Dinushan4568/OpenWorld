import { QUALITY_PROFILES, SHARD_LOCATIONS, WORLD } from './config';
import { AssetManager, type AssetFailure } from './core/AssetManager';
import { AudioManager } from './core/AudioManager';
import { Engine } from './core/Engine';
import { InputManager } from './core/Input';
import { ProgressStore, SettingsStore } from './core/settings';
import { PlayerController } from './player/PlayerController';
import { ThirdPersonCamera } from './player/ThirdPersonCamera';
import { UiRoot, type UiCallbacks } from '../ui/UiRoot';
import type { CompassMarker } from '../ui/screens/Hud';
import { SPECIES } from './creatures/species';
import type { PauseStats } from '../ui/screens/PauseScreen';
import { World } from './world/World';
import { StoryWorld } from './world/StoryWorld';
import { StoryDirector, type StoryNotice } from './story/StoryDirector';
import { ProgressionSystem } from './progression/ProgressionSystem';
import { IndexedDBProgressionStore } from './progression/store';
import { ResourceNodes, type ResourceInteraction } from './world/ResourceNodes';
import { MAIN_MISSION_IDS } from './story/content';
import type { DialogueSession, PuzzleDefinition } from './story/types';

import { clamp, distance2D, formatDuration } from './util/math';
import type { EchoShard } from './world/Collectibles';

type GameState = 'boot' | 'menu' | 'playing' | 'paused' | 'error';

const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

/**
 * Game orchestrator: boot sequence, state machine, input routing, objectives and
 * the bridge between the PlayCanvas simulation and the DOM interface.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly uiRoot: HTMLElement;
  private readonly settings = new SettingsStore();
  private readonly progress = new ProgressStore();
  private readonly audio: AudioManager;
  private readonly ui: UiRoot;
  private readonly input: InputManager;
  private readonly story = new StoryDirector();
  private readonly progression = new ProgressionSystem({
    persistence: new IndexedDBProgressionStore(),
    autoSave: true,
  });

  private engine: Engine | null = null;
  private assets: AssetManager | null = null;
  private world: World | null = null;
  private storyWorld: StoryWorld | null = null;
  private resourceWorld: ResourceNodes | null = null;
  private player: PlayerController | null = null;
  private camera: ThirdPersonCamera | null = null;
  private dialogueSession: DialogueSession | null = null;
  private activePuzzle: PuzzleDefinition | null = null;
  private storyModal = false;
  private characterFromPause = false;
  private pendingEnding = false;

  private state: GameState = 'boot';
  private elapsed = 0;
  private worldTime = 0;
  private hudTimer = 0;
  private fpsTimer = 0;
  private frames = 0;
  private fps = 0;
  private saveTimer = 0;
  private pulseCooldown = 0;
  private stamina = 100;
  private staminaMax = 100;
  private staminaBlocked = false;
  private travelDistance = 0;
  private travelTime = 0;
  private lastTravel: { x: number; z: number } | null = null;
  private encounterTimer = 0;
  private encounterTargetId: string | null = null;
  private lastArea = '';
  private completed = false;
  private starting = false;
  private pointerLockWarned = false;
  private bootStart = performance.now();
  private assetFailures: AssetFailure[] = [];
  private readonly disposeHandlers: Array<() => void> = [];
  private disposed = false;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!this.canvas) throw new Error('Game canvas element (#game-canvas) was not found.');
    this.uiRoot = document.getElementById('ui-root') as HTMLElement;
    if (!this.uiRoot) throw new Error('UI root element (#ui-root) was not found.');

    this.audio = new AudioManager(this.settings.get('masterVolume'));

    this.input = new InputManager(this.canvas, {
      onPause: () => this.togglePause(),
      onPulse: () => this.triggerPulse(),
      onScan: () => this.scanCreature(),
      onToggleFps: () => this.settings.set('showFps', !this.settings.get('showFps')),
      onToggleMute: () => this.toggleMute(),
      onInteract: () => this.interactNearest(),
      onJournal: () => this.toggleJournal(),
      onCharacter: () => this.toggleCharacter(),
      onPointerLockLost: () => {
        if (this.state === 'playing' && !this.storyModal) this.pause('pointer-lock');
      },
    });

    const touchCallbacks = {
      onMove: (x: number, y: number) => this.input.setTouchMove(x, y),
      onLook: (dx: number, dy: number) => this.input.addTouchLook(dx, dy),
      onJump: () => this.input.setTouchJump(),
      onSprint: (active: boolean) => this.input.setTouchSprint(active),
      onPulse: () => this.triggerPulse(),
      onScan: () => this.scanCreature(),
      onInteract: () => this.interactNearest(),
      onJournal: () => this.toggleJournal(),
      onCharacter: () => this.toggleCharacter(),
      onPause: () => this.togglePause(),
    };

    const uiCallbacks: UiCallbacks = {
      onPlay: (mode) => void this.startExpedition(mode),
      onResume: () => void this.resume(),
      onQuit: () => void this.quitToMenu(),
      onRetry: () => window.location.reload(),
      onDialogueChoose: (choiceId) => this.chooseDialogue(choiceId),
      onDialogueClose: () => this.closeDialogue(),
      onPuzzleSolved: (puzzle) => this.solvePuzzle(puzzle),
      onPuzzleClose: () => this.closePuzzle(),
      onJournalClose: () => this.closeJournal(),
      onCharacterClose: () => this.closeCharacter(),
      onPauseCharacter: () => this.openCharacterFromPause(),
      onUnlockSkill: (id) => this.unlockSkill(id),
      onEquipItem: (id) => this.equipItem(id),
      onUnequipItem: (slot) => this.unequipItem(slot),
      onUpgradeItem: (id) => this.upgradeItem(id),
      onCraftItem: (id) => this.craftItem(id),
    };

    this.ui = new UiRoot(this.uiRoot, this.settings, uiCallbacks, touchCallbacks);
    this.bindStoryEvents();
    this.bindProgressionEvents();
    this.bindPreferences();
    this.bindWindowLifecycle();
    this.bindGlobalErrorHandling();
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  async boot(): Promise<void> {
    this.state = 'boot';
    this.bootStart = performance.now();
    this.ui.showLoading('Initialising renderer');
    this.ui.updateLoading('Creating graphics device', 0.02);
    this.removeBootShell();

    try {
      const engine = new Engine(this.canvas);
      this.engine = engine;
      await engine.init(this.settings.value);
      const profile = QUALITY_PROFILES[this.settings.get('quality')];
      this.ui.setEngineInfo(
        `PlayCanvas ${engine.version}\n${engine.rendererLabel} · ${this.cpuLabel()}\n${profile.label} quality · ${profile.drawDistance} m · ${profile.shadowCascades} shadow cascades`,
      );
      this.ui.updateLoading(`${engine.rendererLabel} device ready`, 0.06);

      engine.on('contextlost', () => this.onContextLost());
      engine.on('contextrestored', () => this.onContextRestored());

      this.assets = new AssetManager(engine.app);
      this.ui.updateLoading('Loading expedition props', 0.08);
      const result = await this.assets.loadAll((progress) => {
        this.ui.updateLoading(`Loading ${progress.name}`, 0.08 + progress.fraction * 0.42);
      });
      this.assetFailures = result.failures;

      this.ui.updateLoading('Surveying the valley', 0.52);
      const profileValue = QUALITY_PROFILES[this.settings.get('quality')];
      const world = new World(engine.app, this.assets, profileValue, this.progress.value.collected, {
        testRange: isTestRange(),
      });
      await world.build(({ stage, progress }) => {
        this.ui.updateLoading(stage, 0.52 + progress * 0.44);
      });
      this.world = world;
      this.storyWorld = new StoryWorld(engine.app, this.assets);
      this.resourceWorld = new ResourceNodes(engine.app);
      this.bindCreatureEvents(world);

      const spawn = world.spawn;
      const startHeading = spawn.heading;
      this.player = new PlayerController(
        engine.app,
        { x: spawn.x, y: spawn.y, z: spawn.z, heading: startHeading },
        this.assets,
        world.collision,
      );
      this.player.root.enabled = false;
      this.bindPlayerEvents();

      this.ui.updateLoading('Restoring field record', 0.96);
      await this.progression.load();
      this.applyProgression();
      this.syncProgressionFromWorld();

      this.camera = new ThirdPersonCamera(engine.cameraEntity, startHeading);
      this.camera.setCollisionWorld(world.collision);
      this.camera.setBaseFov(this.settings.get('fov'));
      this.camera.setCinematic(true);
      engine.cameraEntity.camera!.fov = this.settings.get('fov');

      engine.app.on('update', (dt: number) => this.update(dt));
      engine.start();

      this.hydrateMenu();
      this.ui.updateLoading('Expedition ready', 1);
      await this.ui.finishLoading();
      this.ui.setBackend(
        engine.rendererLabel,
        `${this.settings.get('quality')} · ${this.assets.loadedCount}/${this.assets.total} props`,
      );
      const warnings = [
        this.describeAssetFailures(),
        this.progression.loadError ? `Field record could not be restored: ${this.progression.loadError}` : null,
      ].filter((entry): entry is string => Boolean(entry));
      this.ui.setMenuWarning(warnings.length ? warnings.join(' ') : null);
      this.ui.showMenu(this.progressSummary());
      this.state = 'menu';
      this.input.setEnabled(false);
      if (this.assetFailures.length) {
        console.warn('[boot] Some props were substituted:', this.assetFailures);
      }
      console.info(
        `[boot] Ready in ${Math.round(performance.now() - this.bootStart)} ms · ${engine.rendererLabel} · ${this.assets.loadedCount}/${this.assets.total} models`,
      );
    } catch (error) {
      this.fail(error, 'The expedition could not start');
    }
  }

  private hydrateMenu(): void {
    if (!this.world) return;
    this.applyProgression();
    this.ui.hud.setShards(this.world.collectibles.collectedCount, this.world.collectibles.total);
    this.ui.hud.setObjective(this.objectiveText());
    this.storyWorld?.apply(this.story.worldView());
  }

  private removeBootShell(): void {
    const shell = document.getElementById('boot-shell');
    if (!shell) return;
    shell.classList.add('is-done');
    window.setTimeout(() => shell.remove(), 700);
  }

  /* ------------------------------------------------------------------ */
  /* Session flow                                                       */
  /* ------------------------------------------------------------------ */

  private async startExpedition(mode: 'new' | 'continue'): Promise<void> {
    if (!this.world || !this.player || !this.camera || this.state !== 'menu' || this.starting) return;
    this.starting = true;
    try {
      void this.audio.start();

      this.encounterTimer = 0;
      this.encounterTargetId = null;
      this.ui.hud.setCinematic(false);
      this.camera?.clearFrame();
      if (mode === 'new') {
        this.progress.clear();
        this.progress.save();
        this.world.collectibles.reset();
        this.world.setGateEnergy(0);
        this.story.reset();
        this.story.setShards(0);
        await this.progression.reset();
        this.staminaMax = this.progression.stats.maxStamina;
        this.staminaBlocked = false;
        this.pulseCooldown = 0;
        this.travelDistance = 0;
        this.travelTime = 0;
        this.lastTravel = null;
        const spawn = this.world.spawn;
        this.player.teleport(spawn.x, spawn.z, spawn.heading);
        this.player.heading = spawn.heading;
        this.completed = false;
        this.lastArea = '';
      } else if (this.world.testRange) {
        // The validation range is self-contained; always start on its pad.
        this.player.teleport(this.world.spawn.x, this.world.spawn.z, this.world.spawn.heading);
      } else {
        const saved = this.progress.value;
        const safe = saved.x !== null && saved.z !== null
          ? PlayerController.clampToLand(saved.x, saved.z)
          : PlayerController.clampToLand(WORLD.spawn.x, WORLD.spawn.z);
        this.player.teleport(safe.x, safe.z);
      }

      this.stamina = this.staminaMax;
      this.story.setShards(this.world.collectibles.collectedCount);
      this.story.updatePosition(this.player.position.x, this.player.position.z);
      this.syncProgressionFromWorld();
      this.syncStoryState();
      this.lastTravel = { ...this.player.position };
      this.travelDistance = 0;
      this.travelTime = 0;
      this.applyProgression();

      // Pointer lock must be requested inside the click gesture.
      if (!isTouchDevice()) void this.input.requestPointerLock();
      this.input.setEnabled(true);
      this.elapsed = mode === 'continue' ? this.progress.value.playtime : 0;

      await this.ui.fadeOut(420);
      this.ui.hideMenu();
      this.player.root.enabled = true;
      this.camera.setCinematic(false);
      this.camera.yaw = this.player.heading;
      this.camera.snapToTarget(this.player.position);
      this.camera.update(0.016, this.player.position, { sprinting: false, wading: false, speed: 0 });
      this.state = 'playing';
      this.ui.showHud();
      this.ui.hud.setShards(this.world.collectibles.collectedCount, this.world.collectibles.total);
      this.ui.hud.setLocation(this.world.getAreaName(this.player.position.x, this.player.position.z));
      this.syncStoryState();
      if (this.world.testRange) {
        this.ui.hud.banner('Controller Test Range', 'WASD move · Shift run · Space jump · Esc pause', 6500);
        this.ui.toast('Validation range — colliders, steps, jumps and camera boom are active', 'accent', 6500);
      } else {
        this.ui.hud.banner(this.story.chapterTitle(), this.story.chapterSubtitle(), 6200);
        this.ui.toast(this.story.missionTitle(), 'accent', 5200);
      }
      this.ui.fadeIn(650);
      if (!isTouchDevice()) {
        window.setTimeout(() => {
          if (this.state === 'playing' && !this.input.isPointerLocked) {
            this.ui.toast('Mouse look: click the valley to capture the cursor, or drag to look', 'default', 5600);
          }
        }, 900);
      }
    } catch (error) {
      console.error('[session] could not start the expedition', error);
      this.state = 'menu';
      this.ui.toast('The expedition could not start — try again', 'warn', 4200);
      this.ui.fadeIn(200);
    } finally {
      this.starting = false;
    }
  }

  private pause(reason: 'manual' | 'pointer-lock' = 'manual'): void {
    if (this.state !== 'playing' || !this.player || this.storyModal) return;
    this.state = 'paused';
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.saveProgress();
    this.ui.showPause(this.pauseStats());
    if (reason === 'pointer-lock' && !this.pointerLockWarned) {
      this.pointerLockWarned = true;
      this.ui.toast('Mouse released — expedition paused', 'default');
    }
  }

  private async resume(): Promise<void> {
    if (this.state !== 'paused') return;
    this.ui.hidePause();
    this.ui.showHud();
    this.state = 'playing';
    this.input.setEnabled(true);
    if (!isTouchDevice()) void this.input.requestPointerLock();
  }

  private togglePause(): void {
    if (this.ui.hasTransientOverlay) {
      this.ui.closeTransientOverlay();
      return;
    }
    if (this.state === 'playing') this.pause('manual');
    else if (this.state === 'paused') void this.resume();
  }

  private async quitToMenu(): Promise<void> {
    if (!this.world || !this.player) return;
    this.saveProgress();
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.state = 'menu';
    this.ui.hidePause();
    await this.ui.fadeOut(380);
    this.ui.hideHud();
    this.player.root.enabled = false;
    this.encounterTimer = 0;
    this.encounterTargetId = null;
    this.ui.hud.setCinematic(false);
    this.ui.hud.hideScan();
    this.ui.hud.setDanger(null);
    this.dialogueSession = null;
    this.activePuzzle = null;
    this.storyModal = false;
    this.pendingEnding = false;
    this.ui.hideDialogue();
    this.ui.hideQuestLog();
    this.ui.hidePuzzle();
    this.ui.hideCharacter();
    this.characterFromPause = false;
    this.camera?.clearFrame();
    this.camera?.setCinematic(true);
    this.ui.refreshMenuProgress(this.progressSummary());
    this.ui.showMenu(this.progressSummary());
    this.ui.fadeIn(520);
  }

  /* ------------------------------------------------------------------ */
  /* Frame update                                                       */
  /* ------------------------------------------------------------------ */

  private update(rawDt: number): void {
    const dt = clamp(rawDt, 0.0005, 0.05);
    this.worldTime += dt;
    if (this.state === 'playing') this.elapsed += dt;
    this.pulseCooldown = Math.max(0, this.pulseCooldown - dt);
    this.measureFps(rawDt);
    this.engine?.sampleFrame(rawDt * 1000);

    if (!this.world || !this.player || !this.camera) return;

    if (this.state === 'menu') {
      this.camera.update(dt, this.player.position, { sprinting: false, wading: false, speed: 0 });
      this.world.update(dt, this.worldTime, {
        player: this.player.position,
        yaw: this.camera.yaw,
        sprinting: false,
        speed: 0,
        wading: false,
        interactive: false,
      });
      this.storyWorld?.update(dt, this.worldTime, this.player.position);
      this.resourceWorld?.update(dt, this.worldTime, this.player.position);
      return;
    }

    if (this.state === 'paused') {
      return;
    }

    if (this.state !== 'playing') return;

    if (this.storyModal) {
      this.camera.update(dt, this.player.position, { sprinting: false, wading: false, speed: 0 });
      this.world.update(dt, this.worldTime, {
        player: this.player.position,
        yaw: this.camera.yaw,
        sprinting: false,
        speed: 0,
        wading: false,
        interactive: false,
      });
      this.storyWorld?.update(dt, this.worldTime, this.player.position);
      this.resourceWorld?.update(dt, this.worldTime, this.player.position);
      return;
    }

    if (this.encounterTimer > 0) {
      this.encounterTimer = Math.max(0, this.encounterTimer - dt);
      if (this.encounterTimer === 0) this.endEncounterCinematic();
    }
    const frozen = this.encounterTimer > 0;

    let sprinting = false;
    let jump = false;
    let axis = { x: 0, y: 0 };
    if (!frozen) {
      const look = this.input.consumeLook();
      this.camera.applyLook(look.x, look.y, this.settings.get('sensitivity'), this.settings.get('invertY'));
      const wheel = this.input.consumeWheel();
      if (wheel !== 0) this.camera.zoom(wheel);
      axis = this.input.moveAxis();
      if (this.stamina <= 0.4) this.staminaBlocked = true;
      if (this.stamina >= this.staminaMax * 0.25) this.staminaBlocked = false;
      sprinting = this.input.wantsSprint && !this.staminaBlocked;
      jump = this.input.wantsJump;
    } else {
      // Cinematic encounter: the player stands still while the camera frames
      // the machine. Look and wheel are drained so they do not fire on release.
      this.input.consumeLook();
      this.input.consumeWheel();
      this.input.moveAxis();
    }

    this.player.update(dt, {
      moveX: axis.x,
      moveY: axis.y,
      cameraYaw: this.camera.yaw,
      run: sprinting,
      jump,
    });

    const stats = this.progression.stats;
    if (sprinting && this.player.speed > 0.8 && this.player.grounded) {
      this.stamina = Math.max(0, this.stamina - 13 * dt);
    } else {
      this.stamina = Math.min(this.staminaMax, this.stamina + stats.staminaRegen * dt);
    }

    if (this.lastTravel) {
      const step = distance2D(
        this.lastTravel.x,
        this.lastTravel.z,
        this.player.position.x,
        this.player.position.z,
      );
      if (step < 20) this.travelDistance += step;
      this.travelTime += dt;
    }
    this.lastTravel = { x: this.player.position.x, z: this.player.position.z };
    if (this.travelTime >= 5) {
      this.progression.recordTravel(this.travelDistance, this.travelTime);
      this.travelDistance = 0;
      this.travelTime = 0;
    }

    this.camera.update(dt, this.player.position, {
      sprinting,
      wading: this.player.wading,
      speed: this.player.speed,
    });

    const collected = this.world.update(dt, this.worldTime, {
      player: this.player.position,
      yaw: this.camera.yaw,
      sprinting,
      wading: this.player.wading,
      speed: this.player.speed,
    });
    if (collected) this.onShardCollected(collected);
    this.storyWorld?.update(dt, this.worldTime, this.player.position);
    this.resourceWorld?.update(dt, this.worldTime, this.player.position);
    this.story.updatePosition(this.player.position.x, this.player.position.z);

    this.ui.hud.setWater(this.player.wading);
    this.ui.hud.setStamina(this.stamina, this.staminaMax);
    this.ui.hud.tickHints(dt, this.player.speed > 0.6);
    this.hudTimer += dt;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      this.updateHud();
    }
    this.checkCompletion();
    this.checkArea();

    this.saveTimer += dt;
    if (this.saveTimer > 8) {
      this.saveTimer = 0;
      this.saveProgress();
    }
  }

  private updateHud(): void {
    if (!this.player || !this.world) return;
    const position = this.player.position;
    this.ui.hud.setCoords(
      `X ${position.x.toFixed(0)} · Z ${position.z.toFixed(0)} · ALT ${Math.round(position.y)} m`,
    );
    this.ui.hud.setClock(this.world.clockLabel);
    const heading = (180 - (this.camera!.yaw * 180) / Math.PI + 360) % 360;
    const markers: CompassMarker[] = [];
    const storyTarget = this.story.currentTarget();
    if (storyTarget) {
      markers.push({
        bearing: bearingTo(position.x, position.z, storyTarget.x, storyTarget.z),
        kind: storyTarget.kind,
      });
    }
    const remaining = this.world.collectibles.remaining
      .map((shard) => ({ shard, distance: distance2D(position.x, position.z, shard.x, shard.z) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);
    for (const { shard } of remaining) {
      markers.push({ bearing: bearingTo(position.x, position.z, shard.x, shard.z), kind: 'shard' });
    }
    if (this.world.collectibles.allCollected) {
      markers.unshift({ bearing: bearingTo(position.x, position.z, WORLD.gateCenter.x, WORLD.gateCenter.z), kind: 'gate' });
    }
    if (this.progression.hasAbility('survey-instinct') && this.resourceWorld) {
      const gathered = new Set(this.progression.profile.gatheredNodes);
      const caches = this.resourceWorld.placements
        .filter((node) => !gathered.has(node.id))
        .map((node) => ({ node, distance: distance2D(position.x, position.z, node.x, node.z) }))
        .filter((entry) => entry.distance < 140)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, this.progression.hasAbility('wayfinder') ? 3 : 1);
      for (const { node } of caches) {
        markers.push({ bearing: bearingTo(position.x, position.z, node.x, node.z), kind: 'resource' });
      }
    }
    this.ui.hud.setHeading(heading, markers);
    this.ui.hud.setProgression(
      this.progression.profile.level,
      this.progression.profile.xp,
      this.progression.stats.xpToNext,
      this.progression.stats.skillPoints,
    );

    const speed = this.player.speed;
    if (this.world.testRange) {
      const debug = this.player.getDebugState();
      this.ui.hud.setStats(
        `${debug.grounded ? 'GROUNDED' : `AIR ${debug.airTime.toFixed(2)}s`}\n${speed.toFixed(2)} m/s · ${debug.hasModel ? 'GLB RIG' : 'FALLBACK'}\nCOLLIDERS ${debug.collisionCount}`,
      );
    } else {
      this.ui.hud.setStats(
        `ECHOES ${this.world.collectibles.collectedCount}/${this.world.collectibles.total}\n${speed > 0.2 ? `${speed.toFixed(1)} m/s` : 'STATIONARY'}`,
      );
    }
    this.ui.hud.setFps(this.performanceText(), this.settings.get('showFps'));

    const wildlife = this.world.creatures;
    if (wildlife) {
      this.ui.hud.setSpecimens(wildlife.scannedSpecies, wildlife.totalSpecies);
      const threat = wildlife.nearestThreat(position);
      this.ui.hud.setDanger(
        threat
          ? `${threat.name.toUpperCase()} · ${threat.stateLabel.toUpperCase()} · ${Math.round(threat.distance)} M`
          : null,
        threat && threat.threat >= 4 ? 'alert' : 'warn',
      );
      const inEncounter = this.encounterTimer > 0 && this.encounterTargetId !== null;
      const scanning = inEncounter || wildlife.hasScanCandidate(position, this.camera!.yaw, this.scanRange());
      this.ui.hud.setScanReady(scanning);
      const interaction = this.nearestInteraction();
      if (inEncounter) this.ui.hud.showPrompt('Scan the machine', 'F');
      else if (interaction) this.ui.hud.showPrompt(interaction.value.label, 'R');
      else if (scanning) this.ui.hud.showPrompt('Scan robotic creature', 'F');
      else this.ui.hud.hidePrompt();
    }
  }

  private checkArea(): void {
    if (!this.player || !this.world) return;
    const area = this.world.getAreaName(this.player.position.x, this.player.position.z);
    if (area === this.lastArea) return;
    this.lastArea = area;
    this.ui.hud.setLocation(area);
    if (area !== 'Mirrorwater Valley') {
      this.ui.hud.banner(area, 'Region discovered');
    }
  }

  private checkCompletion(): void {
    if (!this.player || !this.world || this.completed) return;
    if (!this.world.collectibles.allCollected) return;
    this.completed = true;
    this.world.setGateEnergy(1);
    this.audio.gateEnergised();
    this.ui.hud.banner('The Valley Answers', 'All five echoes recovered', 5600);
    this.ui.toast('The Echo Gate is listening. Bring the echoes to the witness.', 'accent', 7000);
    this.syncStoryState();
  }

  /* ------------------------------------------------------------------ */
  /* Interaction                                                        */
  /* ------------------------------------------------------------------ */

  private bindCreatureEvents(world: World): void {
    const manager = world.creatures;
    this.disposeHandlers.push(
      manager.on('encounter', ({ id, kind, title, subtitle, duration, aim }) => {
        if (this.state !== 'playing' || !this.camera || this.encounterTimer > 0) return;
        this.encounterTimer = duration;
        this.encounterTargetId = id;
        const height = SPECIES[kind].heightMetres;
        this.camera.frameOn(aim, {
          duration,
          radius: Math.max(8, Math.min(24, height * 2.1)),
          height: Math.max(1.8, height * 0.45),
        });
        this.ui.hud.setCinematic(true);
        this.ui.hud.banner(title, subtitle, Math.min(6000, duration * 1000));
        this.ui.hud.showPrompt('Scan the machine', 'F');
        this.ui.toast('New robotic species encountered — scan it for weaknesses', 'accent', 5600);
        this.audio.creatureCall(kind, true);
      }),
      manager.on('call', ({ kind, distance, alarmed }) => {
        if (this.state !== 'playing' || distance > 72) return;
        this.audio.creatureCall(kind, alarmed);
      }),
      manager.on('reaction', ({ text }) => {
        if (this.state !== 'playing') return;
        this.ui.toast(text, 'default', 3000);
      }),
      manager.on('specimen', ({ scanned, total }) => {
        this.ui.hud.setSpecimens(scanned, total);
        if (scanned >= total) {
          this.ui.toast('Specimen archive complete · four robotic species catalogued', 'accent', 6200);
        }
      }),
    );
    this.ui.hud.setSpecimens(manager.scannedSpecies, manager.totalSpecies);
  }

  /* ------------------------------------------------------------------ */
  /* Story                                                              */
  /* ------------------------------------------------------------------ */

  private bindStoryEvents(): void {
    const missions = this.story.missions;
    this.disposeHandlers.push(
      missions.on('missionStarted', () => this.syncStoryState()),
      missions.on('objectiveCompleted', ({ objective }) => {
        if (this.state === 'playing' && !this.storyModal && objective.kind !== 'reach') {
          this.ui.toast(`Objective complete · ${objective.text}`, 'default', 3200);
        }
        this.syncStoryState();
      }),
      missions.on('missionCompleted', ({ mission, reward, nextMission }) => {
        this.progression.awardMission(mission.id, reward.marks);
        this.syncStoryState();
        if (this.state !== 'playing') return;
        this.audio.pickup();
        this.ui.hud.banner(mission.title, `Mission complete · +${reward.marks} marks`, 5200);
        this.ui.toast(reward.label, 'accent', 5600);
        if (nextMission) this.ui.toast(`Next lead · ${nextMission.title}`, 'default', 5200);
        this.ui.toast(
          `Experience awarded · +${Math.round((55 + reward.marks * 2) * this.progression.stats.xpBonus)} XP`,
          'default',
          3200,
        );
        this.saveProgress();
      }),
      missions.on('chapterCompleted', () => {
        const ending = this.story.ending();
        if (!ending) return;
        this.completed = true;
        this.pendingEnding = true;
        this.progression.awardEnding(ending.id);
        this.audio.gateEnergised();
        this.ui.hud.banner(ending.title, ending.subtitle, 11000);
        this.ui.toast(ending.epitaph, 'accent', 11000);
        this.ui.toast('Open the journal (J) to revisit the chapter and its archive.', 'default', 9000);
        this.syncStoryState();
        this.saveProgress();
      }),
      missions.on('change', () => this.syncStoryState()),
    );
  }

  private syncStoryState(): void {
    this.storyWorld?.apply(this.story.worldView());
    if (this.world && this.story.chapterComplete) this.world.setGateEnergy(1);
    if (this.ui.hud.isActive) {
      const mission = this.story.currentMission();
      const count = this.story.objectiveCount();
      const suffix = count ? `  (${count.count}/${count.required})` : '';
      const prefix = mission ? `${mission.title} — ` : '';
      this.ui.hud.setObjective(`${prefix}${this.story.objectiveText()}${suffix}`);
    }
    if (this.ui.questLog.isActive && this.world) {
      this.ui.refreshQuestLog(this.story.journal(this.world.collectibles.collectedCount, this.world.collectibles.total));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Progression                                                        */
  /* ------------------------------------------------------------------ */

  private bindProgressionEvents(): void {
    this.disposeHandlers.push(
      this.progression.on('change', ({ stats }) => this.applyProgression(stats)),
      this.progression.on('levelUp', ({ level, skillPoints }) => {
        this.audio.pickup();
        if (this.state === 'playing') {
          this.ui.hud.banner(`Level ${level}`, `${skillPoints} unspent skill points · press C`, 4600);
          this.ui.toast(`Field record advanced to level ${level}`, 'accent', 4200);
        }
      }),
      this.progression.on('abilityUnlocked', ({ name }) => {
        if (this.state === 'playing') this.ui.toast(`Ability unlocked · ${name}`, 'accent', 4600);
      }),
      this.progression.on('saved', ({ ok, error }) => {
        if (!ok) console.warn('[progression] save failed', error);
      }),
    );
  }

  private applyProgression(stats = this.progression.stats): void {
    this.staminaMax = stats.maxStamina;
    this.stamina = clamp(this.stamina, 0, this.staminaMax);
    if (this.player) {
      this.player.applyProgressionMovement({
        moveSpeed: stats.moveSpeed,
        jump: stats.jump,
        waterSpeed: stats.waterSpeed,
        doubleJump: this.progression.hasAbility('double-jump'),
      });
    }
    this.resourceWorld?.apply(
      this.progression.profile.gatheredNodes,
      this.progression.hasAbility('survey-instinct'),
    );
    this.ui.hud.setProgression(
      this.progression.profile.level,
      this.progression.profile.xp,
      stats.xpToNext,
      stats.skillPoints,
    );
    this.ui.hud.setStamina(this.stamina, this.staminaMax);
    if (this.ui.characterOpen) this.ui.refreshCharacter(this.progression.view());
  }

  /** Import progress made before the RPG layer existed (Chapter One saves). */
  private syncProgressionFromWorld(): void {
    if (!this.world) return;
    for (const id of this.progress.value.collected) this.progression.awardShard(id);
    for (const id of this.story.state.completed) this.progression.awardMission(id);
    for (const id of this.story.worldView().solvedPuzzles) this.progression.awardPuzzle(id);
    for (const id of this.story.state.readMemories) this.progression.awardMemory(id);
    if (this.story.state.ending) this.progression.awardEnding(this.story.state.ending);
  }

  private toggleCharacter(): void {
    if (this.ui.characterOpen) {
      this.closeCharacter();
      return;
    }
    if (this.state !== 'playing' || this.storyModal) return;
    this.characterFromPause = false;
    this.storyModal = true;
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.ui.hud.hidePrompt();
    this.ui.showCharacter(this.progression.view());
    this.audio.ui();
  }

  private openCharacterFromPause(): void {
    if (this.state !== 'paused') return;
    this.characterFromPause = true;
    this.ui.hidePause();
    this.ui.showCharacter(this.progression.view());
    this.audio.ui();
  }

  private closeCharacter(): void {
    const fromPause = this.characterFromPause;
    this.characterFromPause = false;
    this.ui.hideCharacter();
    if (fromPause && this.state === 'paused') {
      this.ui.showPause(this.pauseStats());
      return;
    }
    this.leaveStoryModal();
  }

  private unlockSkill(id: string): void {
    const result = this.progression.unlockSkill(id);
    this.ui.toast(result.message, result.ok ? 'accent' : 'warn', 2800);
    this.ui.characterFeedback(result.message, result.ok);
    this.audio.ui();
  }

  private equipItem(id: string): void {
    const result = this.progression.equipItem(id);
    this.ui.toast(result.message, result.ok ? 'accent' : 'warn', 2600);
    this.ui.characterFeedback(result.message, result.ok);
    this.audio.ui();
  }

  private unequipItem(slot: Parameters<ProgressionSystem['unequipItem']>[0]): void {
    const result = this.progression.unequipItem(slot);
    this.ui.toast(result.message, result.ok ? 'accent' : 'warn', 2400);
    this.ui.characterFeedback(result.message, result.ok);
    this.audio.ui();
  }

  private upgradeItem(id: string): void {
    const result = this.progression.upgradeEquipment(id);
    this.ui.toast(result.message, result.ok ? 'accent' : 'warn', 2800);
    this.ui.characterFeedback(result.message, result.ok);
    if (result.ok) this.audio.pickup();
    else this.audio.ui();
  }

  private craftItem(id: string): void {
    const result = this.progression.craftEquipment(id);
    this.ui.toast(result.message, result.ok ? 'accent' : 'warn', 3000);
    this.ui.characterFeedback(result.message, result.ok);
    if (result.ok) this.audio.pickup();
    else this.audio.ui();
  }

  private pauseStats(): PauseStats {
    return {
      shards: this.world?.collectibles.collectedCount ?? 0,
      total: this.world?.collectibles.total ?? SHARD_LOCATIONS.length,
      elapsed: formatDuration(this.elapsed),
      area: this.world?.getAreaName(this.player?.position.x ?? 0, this.player?.position.z ?? 0) ?? 'Mirrorwater',
    };
  }

  private notifyStory(notices: readonly StoryNotice[]): void {
    for (const notice of notices) {
      this.ui.toast(notice.text, notice.kind, notice.kind === 'accent' ? 5200 : 3600);
    }
  }

  private nearestInteraction():
    | { kind: 'story'; value: NonNullable<ReturnType<StoryWorld['nearestInteraction']>> }
    | { kind: 'resource'; value: ResourceInteraction }
    | null {
    if (!this.player || !this.storyWorld) return null;
    const story = this.storyWorld.nearestInteraction(this.player.position);
    const resource = this.resourceWorld?.nearestInteraction(this.player.position) ?? null;
    if (story && (!resource || story.distance <= resource.distance)) return { kind: 'story', value: story };
    if (resource) return { kind: 'resource', value: resource };
    return null;
  }

  private interactNearest(): void {
    if (this.state !== 'playing' || !this.player || !this.storyWorld || this.storyModal) return;
    const nearest = this.nearestInteraction();
    if (!nearest) return;
    if (nearest.kind === 'resource') {
      const result = this.progression.collectNode(nearest.value.id);
      if (!result.ok) {
        this.ui.toast(result.message, 'warn', 2400);
        return;
      }
      this.audio.pickup();
      this.ui.toast(result.message, 'accent', 3200);
      this.saveProgress();
      return;
    }
    const storyInteraction = nearest.value;
    if (storyInteraction.kind === 'npc') {
      const session = this.story.beginNpcDialogue(storyInteraction.id);
      if (!session) {
        this.ui.toast(`${this.story.npcName(storyInteraction.id)} has nothing more to say.`, 'default', 2400);
        return;
      }
      this.openDialogue(session);
      return;
    }
    const result = this.story.interact(storyInteraction.id);
    if (result.type === 'dialogue') {
      if (result.session.id.startsWith('memory:')) {
        const memoryId = result.session.id.slice('memory:'.length);
        const award = this.progression.awardMemory(memoryId);
        if (award.ok) this.ui.toast(award.message, 'accent', 3000);
      }
      this.openDialogue(result.session);
    } else if (result.type === 'puzzle') {
      this.openPuzzle(result.puzzle);
    } else if (result.type === 'pickup') {
      this.audio.pickup();
      this.notifyStory(result.notices);
      this.ui.toast(`${result.label} recovered`, 'accent', 4200);
      this.syncStoryState();
      this.saveProgress();
    } else if (result.type === 'blocked') {
      this.notifyStory([result.notice]);
    }
  }

  private openDialogue(session: DialogueSession): void {
    if (this.storyModal) return;
    this.dialogueSession = session;
    this.storyModal = true;
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.ui.hud.hidePrompt();
    this.ui.hud.dimHints(true);
    this.ui.showDialogue(session);
    this.audio.ui();
  }

  private chooseDialogue(choiceId: string): void {
    const session = this.dialogueSession;
    if (!session) return;
    const step = this.story.choose(session, choiceId);
    this.notifyStory(step.notices);
    if (step.close) {
      this.closeDialogue();
      return;
    }
    if (step.view) {
      session.view = step.view;
      this.ui.updateDialogue(step.view);
    }
    this.syncStoryState();
  }

  private closeDialogue(): void {
    const session = this.dialogueSession;
    if (!session) {
      this.ui.hideDialogue();
      this.leaveStoryModal();
      return;
    }
    this.story.finishDialogue(session);
    this.dialogueSession = null;
    this.ui.hideDialogue();
    this.leaveStoryModal();
    this.syncStoryState();
    this.saveProgress();
    if (this.pendingEnding) {
      this.pendingEnding = false;
      window.setTimeout(() => {
        if (this.state === 'playing' && !this.storyModal && !this.ui.questLog.isActive) this.toggleJournal();
      }, 1100);
    }
  }

  private openPuzzle(puzzle: PuzzleDefinition): void {
    if (this.storyModal) return;
    this.activePuzzle = puzzle;
    this.storyModal = true;
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.ui.hud.hidePrompt();
    this.ui.showPuzzle(puzzle);
    this.audio.ui();
  }

  private solvePuzzle(puzzle: PuzzleDefinition): void {
    if (!this.activePuzzle || this.activePuzzle.id !== puzzle.id) return;
    const notices = this.story.solvePuzzle(puzzle.id);
    this.notifyStory(notices);
    this.progression.awardPuzzle(puzzle.id);
    this.audio.gateEnergised();
    this.syncStoryState();
    this.saveProgress();
  }

  private closePuzzle(): void {
    this.activePuzzle = null;
    this.ui.hidePuzzle();
    this.leaveStoryModal();
    this.syncStoryState();
    this.saveProgress();
  }

  private toggleJournal(): void {
    if (this.ui.questLog.isActive) {
      this.closeJournal();
      return;
    }
    if (this.state !== 'playing' || this.storyModal || !this.world) return;
    this.storyModal = true;
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.ui.hud.hidePrompt();
    this.ui.showQuestLog(this.story.journal(this.world.collectibles.collectedCount, this.world.collectibles.total));
    this.audio.ui();
  }

  private closeJournal(): void {
    this.ui.hideQuestLog();
    this.leaveStoryModal();
  }

  private leaveStoryModal(): void {
    this.storyModal = false;
    this.ui.hud.dimHints(false);
    if (this.state === 'playing') {
      this.input.setEnabled(true);
      if (!isTouchDevice()) void this.input.requestPointerLock();
    }
  }

  private scanRange(): number {
    const base = this.progression.stats.scanRange;
    return this.story.hasUpgrade('survey-lens') ? base + 12 : base;
  }

  private scanCreature(): void {
    if (this.state !== 'playing' || !this.player || !this.world || !this.camera) return;
    const report =
      this.encounterTimer > 0 && this.encounterTargetId
        ? this.world.creatures.scanById(this.encounterTargetId, this.player.position)
        : this.world.creatures.scan(this.player.position, this.camera.yaw, this.scanRange());
    if (!report) {
      if (this.world.creatures.noteEmptyScan()) {
        this.ui.toast('No robotic signature inside the scan cone', 'warn', 2400);
      }
      return;
    }
    this.ui.hud.showScan(report);
    this.story.scan(report.kind);
    const xp = this.progression.recordScan(report.kind);
    const sample = xp.first ? this.progression.scanSampleId(report.kind) : null;
    if (sample) this.progression.addResource(sample, 1);
    this.audio.scan();
    if (report.firstScan) {
      this.ui.toast(`${report.name} catalogued · ${report.scanned}/${report.total} species`, 'accent', 5000);
    } else {
      this.ui.toast(`${report.name} re-scanned · ${report.weakness.label}`, 'default', 3000);
    }
    if (xp.first) this.ui.toast(xp.result.message, 'accent', 3400);
    if (sample) this.ui.toast(`Scan sample recovered · +1 resource`, 'default', 3200);
  }

  private endEncounterCinematic(): void {
    this.ui.hud.setCinematic(false);
    this.camera?.clearFrame();
    this.encounterTargetId = null;
  }

  private onShardCollected(shard: EchoShard): void {
    if (!this.world) return;
    this.progress.addShard(shard.id);
    const award = this.progression.awardShard(shard.id);
    if (award.ok) this.ui.toast(award.message, 'accent', 3600);
    this.saveProgress();
    this.audio.pickup();
    this.ui.hud.setShards(this.world.collectibles.collectedCount, this.world.collectibles.total);
    this.story.setShards(this.world.collectibles.collectedCount);
    this.syncStoryState();
    this.ui.toast(
      `${shard.name} recovered · ${this.world.collectibles.collectedCount}/${this.world.collectibles.total}`,
      'accent',
      4600,
    );
    if (this.world.collectibles.allCollected) {
      this.ui.toast('All echoes recovered — return to the Echo Gate', 'warn', 6000);
      this.ui.hud.banner('Five Echoes', 'The Gate is listening', 4200);
    }
  }

  private triggerPulse(): void {
    if (this.state !== 'playing' || !this.player || !this.world || this.pulseCooldown > 0) return;
    this.pulseCooldown = Math.max(
      1.2,
      this.progression.stats.pulseCooldown - (this.story.hasUpgrade('resonance-capacitor') ? 1 : 0),
    );
    this.audio.pulse();
    const position = this.player.position;
    this.world.atmosphere.triggerPulse(position.x, position.y, position.z);
    const wildlife = this.world.creatures.pulse(position);
    if (wildlife.affected > 0) {
      const machines = wildlife.affected === 1 ? 'machine' : 'machines';
      this.ui.toast(
        `Echo pulse · ${wildlife.affected} ${machines} dazed${wildlife.calmed > 0 ? ` · ${wildlife.calmed} calmed` : ''}`,
        'accent',
        3200,
      );
    }
    if (wildlife.warden) {
      this.ui.toast('The Warden\'s aegis flares — the pulse only staggers it', 'warn', 4200);
    }
    const nearest = this.world.collectibles.remaining
      .map((shard) => ({
        shard,
        distance: distance2D(position.x, position.z, shard.x, shard.z),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest) {
      const bearing = bearingTo(position.x, position.z, nearest.shard.x, nearest.shard.z);
      this.ui.toast(`Echo ${Math.round(nearest.distance)} m · ${compassDirection(bearing)}`, 'accent', 3200);
    } else {
      this.ui.toast('No echo signatures remain — the Gate awaits', 'warn', 3200);
    }
  }

  private toggleMute(): void {
    const muted = this.audio.toggleMute();
    this.ui.toast(muted ? 'Audio muted' : 'Audio restored', 'default', 1800);
  }

  private objectiveText(): string {
    return this.story.objectiveText();
  }

  private progressSummary(): {
    collected: number;
    total: number;
    playtime: number;
    hasProgress: boolean;
    mission: {
      title: string;
      objective: string;
      mainComplete: number;
      mainTotal: number;
      marks: number;
      ending: string | null;
    };
  } {
    const ending = this.story.ending();
    return {
      collected: this.progress.value.collected.length,
      total: SHARD_LOCATIONS.length,
      playtime: this.progress.value.playtime,
      hasProgress:
        this.progress.hasProgress ||
        this.story.missions.hasProgress ||
        this.progression.profile.statistics.xpEarned > 0 ||
        this.progression.profile.level > 1,
      mission: {
        title: this.story.missionTitle(),
        objective: this.story.objectiveText(),
        mainComplete: this.story.missions.mainCompleted,
        mainTotal: MAIN_MISSION_IDS.length,
        marks: this.story.marks,
        ending: ending?.title ?? null,
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Preferences, lifecycle and failures                                */
  /* ------------------------------------------------------------------ */

  private bindPreferences(): void {
    const apply = (): void => {
      const settings = this.settings.value;
      this.engine?.applySettings(settings);
      this.audio.setVolume(settings.masterVolume);
      this.camera?.setBaseFov(settings.fov);
      this.camera?.setShakeScale(settings.reduceMotion ? 0 : 1);
      if (this.world && this.engine) {
        this.world.lighting.applyQuality(QUALITY_PROFILES[settings.quality]);
      }
      this.ui.setBackend(
        this.engine?.rendererLabel ?? 'WebGL 2',
        `${settings.quality}${this.assets ? ` · ${this.assets.loadedCount}/${this.assets.total} props` : ''}`,
      );
      if (settings.showHints) this.ui.hud.setHintsVisible(true);
      else this.ui.hud.setHintsVisible(false);
      if (this.player && this.state === 'playing') {
        this.ui.hud.setFps(this.performanceText(), settings.showFps);
      }
    };
    this.disposeHandlers.push(this.settings.on('change', apply));
    apply();
  }

  private bindPlayerEvents(): void {
    if (!this.player) return;
    this.disposeHandlers.push(
      this.player.on('footstep', ({ surface }) => this.audio.footstep(surface)),
    );
    this.disposeHandlers.push(this.player.on('jumped', () => this.audio.jump()));
    this.disposeHandlers.push(
      this.player.on('landed', ({ impact }) => {
        this.audio.land();
        this.camera?.addLandingImpulse(impact);
      }),
    );
    this.disposeHandlers.push(
      this.player.on('boundary', () => {
        this.ui.hud.banner('Expedition Boundary', 'The storms beyond the ridge are impassable', 3200);
        this.ui.toast('Turn back — the valley edge is unsafe', 'warn', 3200);
      }),
    );
  }

  private bindWindowLifecycle(): void {
    const onVisibility = (): void => {
      if (document.hidden) {
        this.saveProgress();
        if (this.state === 'playing') this.pause('manual');
      }
    };
    const onBeforeUnload = (): void => this.saveProgress();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    this.disposeHandlers.push(() => document.removeEventListener('visibilitychange', onVisibility));
    this.disposeHandlers.push(() => window.removeEventListener('beforeunload', onBeforeUnload));

    const onFirstGesture = (): void => {
      void this.audio.start();
      document.removeEventListener('pointerdown', onFirstGesture);
      document.removeEventListener('keydown', onFirstGesture);
    };
    document.addEventListener('pointerdown', onFirstGesture);
    document.addEventListener('keydown', onFirstGesture);
    this.disposeHandlers.push(() => document.removeEventListener('pointerdown', onFirstGesture));
    this.disposeHandlers.push(() => document.removeEventListener('keydown', onFirstGesture));

    const onClickUi = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button')) this.audio.ui();
    };
    this.uiRoot.addEventListener('click', onClickUi);
    this.disposeHandlers.push(() => this.uiRoot.removeEventListener('click', onClickUi));

    const onCanvasClick = (): void => {
      if (this.state === 'playing' && !isTouchDevice() && !this.input.isPointerLocked) {
        void this.input.requestPointerLock();
      }
    };
    this.canvas.addEventListener('click', onCanvasClick);
    this.disposeHandlers.push(() => this.canvas.removeEventListener('click', onCanvasClick));
  }

  private saveProgress(): void {
    if (!this.player) return;
    this.progress.setPosition(this.player.position.x, this.player.position.z);
    this.progress.setPlaytime(this.elapsed);
    this.progress.save();
    this.story.missions.save();
    if (this.travelDistance > 0.1) {
      this.progression.recordTravel(this.travelDistance, this.travelTime);
      this.travelDistance = 0;
      this.travelTime = 0;
    }
    void this.progression.flushSave();
  }

  private bindGlobalErrorHandling(): void {
    const onError = (event: ErrorEvent): void => {
      console.error('[uncaught]', event.error ?? event.message);
      if (this.state === 'boot') return;
      this.ui.showFatal({
        title: 'Something went wrong',
        message: 'An unexpected error interrupted the expedition. Your progress up to the last checkpoint is saved.',
        detail: `${event.message}\n${event.filename}:${event.lineno}:${event.colno}`,
      });
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      console.error('[unhandled promise]', event.reason);
      if (this.state === 'boot') return;
      this.ui.showFatal({
        title: 'A system stopped responding',
        message: 'A background task failed. You can retry without losing saved echoes.',
        detail: event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason),
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    this.disposeHandlers.push(() => window.removeEventListener('error', onError));
    this.disposeHandlers.push(() => window.removeEventListener('unhandledrejection', onRejection));
  }

  private fail(error: unknown, title: string): void {
    this.state = 'error';
    const message = error instanceof Error ? error.message : String(error);
    console.error('[fatal]', error);
    this.ui.showFatal({
      title,
      message:
        'The renderer or world build did not complete. This build needs a WebGL 2 or WebGPU capable browser with hardware acceleration enabled.',
      detail: message,
      onRetry: () => window.location.reload(),
    });
  }

  private onContextLost(): void {
    console.warn('[graphics] context lost');
    if (this.state === 'playing') this.pause('manual');
    this.ui.showFatal({
      title: 'Graphics context lost',
      message:
        'The GPU released the rendering context. This can happen after a driver reset or when another heavy application takes over the GPU.',
      detail: 'Reload to rebuild the valley. Your echoes are stored locally.',
      onRetry: () => window.location.reload(),
    });
  }

  private onContextRestored(): void {
    console.info('[graphics] context restored');
  }

  private describeAssetFailures(): string | null {
    if (!this.assetFailures.length) return null;
    const names = this.assetFailures.map((failure) => failure.name).join(', ');
    return `Some props could not be loaded and were replaced with stand-ins: ${names}. Gameplay is unaffected.`;
  }

  private measureFps(dt: number): void {
    this.frames += 1;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = this.frames / this.fpsTimer;
      this.frames = 0;
      this.fpsTimer = 0;
    }
  }

  private gpuLabel(): string {
    return this.engine?.rendererLabel ?? 'GL';
  }

  /** Compact live telemetry; F3 toggles it and the pause/settings copy explains the controls. */
  private performanceText(): string {
    const perf = this.engine?.performanceSnapshot();
    const resolution = Math.round((perf?.resolutionScale ?? 1) * 100);
    const drawCalls = perf?.drawCalls ?? 0;
    const frameMs = perf?.frameMs ?? (this.fps > 0 ? 1000 / this.fps : 0);
    const vram = Math.round(perf?.vramMb ?? 0);
    const adaptive = perf?.adaptive.enabled ? perf.adaptive.phase.replace('scaling-', 'adapt ') : 'fixed res';
    return `${this.fps.toFixed(0)} FPS · ${frameMs.toFixed(1)} ms · ${drawCalls} DC\n${this.gpuLabel()} · ${resolution}% internal · ${vram} MB · ${adaptive}`;
  }

  private cpuLabel(): string {
    const cores = navigator.hardwareConcurrency ?? 4;
    return `${cores} threads · ${window.devicePixelRatio.toFixed(1)}× DPR`;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.player) this.saveProgress();
    for (const off of this.disposeHandlers) off();
    this.disposeHandlers.length = 0;
    this.audio.dispose();
    this.input.dispose();
    this.storyWorld?.dispose();
    this.resourceWorld?.dispose();
    this.progression.dispose();
    this.world?.dispose();
    this.ui.dispose();
    this.engine?.destroy();
    this.assets?.destroy();
  }
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

function bearingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  return ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
}

function isTestRange(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('range') === '1';
  } catch {
    return false;
  }
}

function compassDirection(bearing: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(bearing / 45) % 8];
}
