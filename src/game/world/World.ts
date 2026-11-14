import type { AppBase } from 'playcanvas';
import { WORLD, type QualityProfile } from '../config';
import type { AssetManager } from '../core/AssetManager';
import { createTexture, generateDetailTexture, generateWaterNormalMap } from '../util/textures';
import { Atmosphere } from './Atmosphere';
import { ChunkManager, type ChunkStats } from './ChunkManager';
import { CivicSites } from './CivicSites';
import { Collectibles, type EchoShard } from './Collectibles';
import { DayNight } from './DayNight';
import { Landmarks } from './Landmarks';
import { Lighting, LIGHTING_TARGET } from './Lighting';
import { River } from './River';
import { SkySystem } from './Sky';
import { SkyDome } from './SkyDome';
import { Terrain } from './Terrain';
import { Water } from './Water';
import { CollisionWorld } from './collision';
import { areaNameAt, findSpawnPoint, heightAt } from './heightfield';
import { TestRange } from './TestRange';

export interface WorldStage {
  stage: string;
  progress: number;
}

export interface WorldUpdateContext {
  player: { x: number; y: number; z: number };
  yaw: number;
  sprinting: boolean;
  speed: number;
  wading: boolean;
  /** False on the menu screen, where shards must not be picked up invisibly. */
  interactive?: boolean;
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

export interface WorldOptions {
  /** Build the temporary controller validation range (?range=1). */
  testRange?: boolean;
  /** Start hour of the day/night cycle (0-24). */
  startHour?: number;
  /** Real minutes per in-game day; 0 freezes time. */
  dayLengthMinutes?: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  heading: number;
}

/** Builds and owns every visual system in the valley. */
export class World {
  terrain!: Terrain;
  sky!: SkySystem;
  water!: Water;
  lighting!: Lighting;
  river!: River;
  landmarks!: Landmarks;
  chunks!: ChunkManager;
  civic!: CivicSites;
  dome!: SkyDome;
  dayNight!: DayNight;
  atmosphere!: Atmosphere;
  collectibles!: Collectibles;
  readonly collision = new CollisionWorld();
  testRange: TestRange | null = null;
  spawn: SpawnPoint = { ...WORLD.spawn, y: heightAt(WORLD.spawn.x, WORLD.spawn.z), heading: 0 };

  private readonly app: AppBase;
  private readonly assets: AssetManager;
  private readonly profile: QualityProfile;
  private readonly collectedIds: readonly string[];
  private readonly options: WorldOptions;

  constructor(
    app: AppBase,
    assets: AssetManager,
    profile: QualityProfile,
    collectedIds: readonly string[],
    options: WorldOptions = {},
  ) {
    this.app = app;
    this.assets = assets;
    this.profile = profile;
    this.collectedIds = collectedIds;
    this.options = options;
  }

  get scatterStats(): ChunkStats {
    return this.chunks.stats;
  }

  get clockLabel(): string {
    return this.dayNight.clockLabel;
  }

  async build(onStage: (stage: WorldStage) => void): Promise<void> {
    const stage = async (label: string, progress: number): Promise<void> => {
      onStage({ stage: label, progress });
      // Yield once so the loading screen can paint between build steps.
      await nextFrame();
    };

    await stage('Synthesising surface detail', 0.02);
    const grass = createTexture(this.app.graphicsDevice, generateDetailTexture('grass', 512), {
      srgb: true,
      repeat: true,
      anisotropy: this.profile.anisotropy,
      name: 'detail-grass',
    });
    const waterNormal = createTexture(this.app.graphicsDevice, generateWaterNormalMap(512), {
      srgb: false,
      repeat: true,
      anisotropy: this.profile.anisotropy,
      name: 'water-normal',
    });
    const waterDetail = createTexture(this.app.graphicsDevice, generateDetailTexture('stone', 256), {
      srgb: true,
      repeat: true,
      anisotropy: 2,
      name: 'water-detail',
    });

    await stage('Painting the sky', 0.1);
    this.sky = new SkySystem(this.app, this.profile.anisotropy);

    await stage('Raising the basin', 0.22);
    this.terrain = new Terrain(this.app, grass);

    await stage('Filling Mirrorwater', 0.32);
    this.water = new Water(this.app, waterNormal, waterDetail);

    await stage('Positioning the sun', 0.4);
    this.lighting = new Lighting(this.app, this.sky.setup.sunDirection, this.profile, LIGHTING_TARGET);

    await stage('Carving the Crystal River', 0.48);
    this.river = new River(this.app, waterNormal, waterDetail);

    await stage('Unearthing the ruins', 0.56);
    this.landmarks = new Landmarks(this.app, this.assets, this.collision);

    await stage('Rebuilding the city square', 0.64);
    this.civic = new CivicSites(this.app, this.assets, this.lighting, this.collision);

    await stage('Streaming the regions', 0.72);
    this.chunks = new ChunkManager(this.app, this.assets, this.profile, this.collision);

    if (this.options.testRange) {
      await stage('Preparing the controller range', 0.8);
      this.testRange = new TestRange(this.app, this.collision);
      this.spawn = { ...this.testRange.spawn };
    } else {
      this.spawn = findSpawnPoint();
    }

    await stage('Growing ground cover', 0.84);
    await this.chunks.preload(this.spawn.x, this.spawn.z, nextFrame);

    await stage('Setting the clock', 0.9);
    this.dome = new SkyDome(this.app);
    this.dayNight = new DayNight(
      this.app,
      this.sky,
      this.dome,
      this.lighting,
      this.profile,
      { water: this.water, chunks: this.chunks, landmarks: this.landmarks },
      this.options.startHour ?? 7.4,
      this.options.dayLengthMinutes ?? 12,
    );

    await stage('Releasing the survey drone', 0.95);
    this.atmosphere = new Atmosphere(this.app, this.assets, {
      x: this.spawn.x,
      y: this.spawn.y,
      z: this.spawn.z,
    });

    await stage('Calibrating echo signatures', 0.98);
    this.collectibles = new Collectibles(this.app, this.assets, this.collectedIds);
    this.landmarks.setGateEnergy(this.collectibles.collectedCount / Math.max(1, this.collectibles.total));
    await stage('Valley ready', 1);
  }

  update(dt: number, time: number, context: WorldUpdateContext): EchoShard | null {
    this.water.update(dt);
    this.river.update(dt);
    this.chunks.update(context.player.x, context.player.z);
    this.landmarks.update(dt, time);
    this.dayNight.update(dt, context.player, context.player);
    this.lighting.update(context.player.x, context.player.z, context.player.y);
    this.lighting.tick(time);
    this.atmosphere.update(dt, time, context.player, context.yaw);
    if (context.interactive === false) return null;
    const collected = this.collectibles.update(dt, time, context.player);
    if (collected) {
      this.landmarks.setGateEnergy(this.collectibles.collectedCount / Math.max(1, this.collectibles.total));
    }
    return collected;
  }

  setGateEnergy(value: number): void {
    this.landmarks.setGateEnergy(value);
  }

  setHour(hour: number): void {
    this.dayNight?.setHour(hour);
  }

  setDayLength(minutes: number): void {
    this.dayNight?.setDayLength(minutes);
  }

  getAreaName(x: number, z: number): string {
    if (this.testRange) return 'Controller Test Range';
    return areaNameAt(x, z);
  }

  dispose(): void {
    this.testRange?.dispose();
    this.collision.clear();
    this.collectibles?.destroy();
    this.atmosphere?.destroy();
    this.civic?.dispose();
    this.chunks?.dispose();
    this.river?.dispose();
    this.landmarks?.destroy();
    this.dayNight?.dispose();
    this.lighting?.root.destroy();
    this.water?.destroy();
    this.terrain?.destroy();
    this.sky?.destroy();
  }
}
