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
import type { PauseStats } from '../ui/screens/PauseScreen';
import { World } from './world/World';

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

  private engine: Engine | null = null;
  private assets: AssetManager | null = null;
  private world: World | null = null;
  private player: PlayerController | null = null;
  private camera: ThirdPersonCamera | null = null;

  private state: GameState = 'boot';
  private elapsed = 0;
  private worldTime = 0;
  private hudTimer = 0;
  private fpsTimer = 0;
  private frames = 0;
  private fps = 0;
  private saveTimer = 0;
  private pulseCooldown = 0;
  private lastArea = '';
  private completed = false;
  private starting = false;
  private pointerLockWarned = false;
  private bootStart = performance.now();
  private assetFailures: AssetFailure[] = [];
  private readonly disposeHandlers: Array<() => void> = [];

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!this.canvas) throw new Error('Game canvas element (#game-canvas) was not found.');
    this.uiRoot = document.getElementById('ui-root') as HTMLElement;
    if (!this.uiRoot) throw new Error('UI root element (#ui-root) was not found.');

    this.audio = new AudioManager(this.settings.get('masterVolume'));

    this.input = new InputManager(this.canvas, {
      onPause: () => this.togglePause(),
      onPulse: () => this.triggerPulse(),
      onToggleFps: () => this.settings.set('showFps', !this.settings.get('showFps')),
      onToggleMute: () => this.toggleMute(),
      onPointerLockLost: () => {
        if (this.state === 'playing') this.pause('pointer-lock');
      },
    });

    const touchCallbacks = {
      onMove: (x: number, y: number) => this.input.setTouchMove(x, y),
      onLook: (dx: number, dy: number) => this.input.addTouchLook(dx, dy),
      onJump: () => this.input.setTouchJump(),
      onSprint: (active: boolean) => this.input.setTouchSprint(active),
      onPulse: () => this.triggerPulse(),
      onPause: () => this.togglePause(),
    };

    const uiCallbacks: UiCallbacks = {
      onPlay: (mode) => void this.startExpedition(mode),
      onResume: () => void this.resume(),
      onQuit: () => void this.quitToMenu(),
      onRetry: () => window.location.reload(),
    };

    this.ui = new UiRoot(this.uiRoot, this.settings, uiCallbacks, touchCallbacks);
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
        `PlayCanvas ${engine.version}\n${engine.rendererLabel} · ${this.cpuLabel()}\n${profile.label} quality · ${profile.drawDistance} m`,
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
      this.ui.setMenuWarning(this.describeAssetFailures());
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
    this.ui.hud.setShards(this.world.collectibles.collectedCount, this.world.collectibles.total);
    this.ui.hud.setObjective(this.objectiveText());
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

      if (mode === 'new') {
        this.progress.clear();
        this.progress.save();
        this.world.collectibles.reset();
        this.world.setGateEnergy(0);
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
      this.ui.hud.setObjective(this.objectiveText());
      this.ui.hud.setLocation(this.world.getAreaName(this.player.position.x, this.player.position.z));
      if (this.world.testRange) {
        this.ui.hud.banner('Controller Test Range', 'WASD move · Shift run · Space jump · Esc pause', 6500);
        this.ui.toast('Validation range — colliders, steps, jumps and camera boom are active', 'accent', 6500);
      } else {
        this.ui.hud.banner('Mirrorwater Valley', 'Expedition underway');
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
    if (this.state !== 'playing' || !this.player) return;
    this.state = 'paused';
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.saveProgress();
    const stats: PauseStats = {
      shards: this.world?.collectibles.collectedCount ?? 0,
      total: this.world?.collectibles.total ?? SHARD_LOCATIONS.length,
      elapsed: formatDuration(this.elapsed),
      area: this.world?.getAreaName(this.player.position.x, this.player.position.z) ?? 'Mirrorwater',
    };
    this.ui.showPause(stats);
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
      return;
    }

    if (this.state === 'paused') {
      return;
    }

    if (this.state !== 'playing') return;

    const look = this.input.consumeLook();
    this.camera.applyLook(look.x, look.y, this.settings.get('sensitivity'), this.settings.get('invertY'));
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.camera.zoom(wheel);

    const axis = this.input.moveAxis();
    const sprinting = this.input.wantsSprint;
    const jump = this.input.wantsJump;
    this.player.update(dt, {
      moveX: axis.x,
      moveY: axis.y,
      cameraYaw: this.camera.yaw,
      run: sprinting,
      jump,
    });
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

    this.ui.hud.setWater(this.player.wading);
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
    const heading = (180 - (this.camera!.yaw * 180) / Math.PI + 360) % 360;
    const markers: CompassMarker[] = [];
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
    this.ui.hud.setHeading(heading, markers);

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
    this.ui.hud.setFps(`${this.fps.toFixed(0)} FPS · ${this.gpuLabel()}`, this.settings.get('showFps'));
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
    const distance = distance2D(this.player.position.x, this.player.position.z, WORLD.gateCenter.x, WORLD.gateCenter.z);
    if (distance > 26) {
      this.ui.hud.showPrompt('Return to the Echo Gate');
      return;
    }
    this.ui.hud.hidePrompt();
    this.completed = true;
    this.world.setGateEnergy(1);
    this.audio.gateEnergised();
    this.ui.hud.banner('The Gate Answers', 'All five echoes recovered — Phase 01 complete', 6500);
    this.ui.toast('Expedition complete · the Echo Gate is awake', 'accent', 7000);
    this.ui.hud.setObjective('The Gate is awake. Phase 02 will take you beyond it.');
  }

  /* ------------------------------------------------------------------ */
  /* Interaction                                                        */
  /* ------------------------------------------------------------------ */

  private onShardCollected(shard: EchoShard): void {
    if (!this.world) return;
    this.progress.addShard(shard.id);
    this.saveProgress();
    this.audio.pickup();
    this.ui.hud.setShards(this.world.collectibles.collectedCount, this.world.collectibles.total);
    this.ui.hud.setObjective(this.objectiveText());
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
    this.pulseCooldown = 3.2;
    this.audio.pulse();
    const position = this.player.position;
    this.world.atmosphere.triggerPulse(position.x, position.y, position.z);
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
    if (!this.world) return 'Recover the five Echo Shards.';
    const remaining = this.world.collectibles.total - this.world.collectibles.collectedCount;
    if (remaining <= 0) return 'All echoes recovered. Return to the Echo Gate and carry them home.';
    return `Recover the Echo Shards. ${remaining} signal${remaining === 1 ? '' : 's'} remain in the valley. Follow the compass.`;
  }

  private progressSummary(): { collected: number; total: number; playtime: number; hasProgress: boolean } {
    return {
      collected: this.progress.value.collected.length,
      total: SHARD_LOCATIONS.length,
      playtime: this.progress.value.playtime,
      hasProgress: this.progress.hasProgress,
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
        this.ui.hud.setFps(`${this.fps.toFixed(0)} FPS · ${this.gpuLabel()}`, settings.showFps);
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

  private cpuLabel(): string {
    const cores = navigator.hardwareConcurrency ?? 4;
    return `${cores} threads · ${window.devicePixelRatio.toFixed(1)}× DPR`;
  }

  dispose(): void {
    for (const off of this.disposeHandlers) off();
    this.disposeHandlers.length = 0;
    this.input.dispose();
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
