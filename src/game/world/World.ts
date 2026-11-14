import type { AppBase } from 'playcanvas';
import { WORLD, type QualityProfile } from '../config';
import type { AssetManager } from '../core/AssetManager';
import { distance2D } from '../util/math';
import { createTexture, generateDetailTexture, generateWaterNormalMap } from '../util/textures';
import { Atmosphere } from './Atmosphere';
import { Collectibles, type EchoShard } from './Collectibles';
import { Landmarks } from './Landmarks';
import { Lighting, LIGHTING_TARGET } from './Lighting';
import { Props, type ScatterStats } from './Props';
import { SkySystem } from './Sky';
import { Terrain } from './Terrain';
import { Vegetation } from './Vegetation';
import { Water } from './Water';
import { CollisionWorld } from './collision';
import { findSpawnPoint, heightAt } from './heightfield';
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
  landmarks!: Landmarks;
  props!: Props;
  vegetation!: Vegetation;
  atmosphere!: Atmosphere;
  collectibles!: Collectibles;
  scatterStats: ScatterStats = { placed: 0, skipped: 0, byType: {} };
  sunDirection: [number, number, number] = [0, 1, 0];
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

    await stage('Painting the sky', 0.12);
    this.sky = new SkySystem(this.app, this.profile.anisotropy);
    this.sunDirection = this.sky.setup.sunDirection;

    await stage('Raising the Mirrorwater basin', 0.3);
    this.terrain = new Terrain(this.app, grass);

    await stage('Filling the lake', 0.44);
    this.water = new Water(this.app, waterNormal, waterDetail);

    await stage('Positioning the sun', 0.52);
    this.lighting = new Lighting(this.app, this.sunDirection, this.profile, LIGHTING_TARGET);
    this.sky.applyFog(
      [WORLD.fogColor[0], WORLD.fogColor[1], WORLD.fogColor[2]],
      this.profile.drawDistance * 0.16,
      this.profile.drawDistance * 1.35,
    );

    await stage('Unearthing the ruins', 0.62);
    this.landmarks = new Landmarks(this.app, this.assets, this.collision);

    await stage('Scattering stone and spires', 0.74);
    this.props = new Props(this.app, this.assets, this.profile, this.collision);
    this.scatterStats = this.props.stats;

    await stage('Growing ground cover', 0.86);
    this.vegetation = new Vegetation(this.app, this.profile);

    if (this.options.testRange) {
      await stage('Preparing the controller range', 0.9);
      this.testRange = new TestRange(this.app, this.collision);
      this.spawn = { ...this.testRange.spawn };
    } else {
      this.spawn = findSpawnPoint();
    }

    await stage('Releasing the survey drone', 0.93);
    this.atmosphere = new Atmosphere(this.app, this.assets, {
      x: this.spawn.x,
      y: this.spawn.y,
      z: this.spawn.z,
    });

    await stage('Calibrating echo signatures', 0.97);
    this.collectibles = new Collectibles(this.app, this.assets, this.collectedIds);
    this.landmarks.setGateEnergy(this.collectibles.collectedCount / Math.max(1, this.collectibles.total));
    await stage('Valley ready', 1);
  }

  update(dt: number, time: number, context: WorldUpdateContext): EchoShard | null {
    this.water.update(dt);
    this.vegetation.update(time);
    this.landmarks.update(dt, time);
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

  getAreaName(x: number, z: number): string {
    if (this.testRange) return 'Controller Test Range';
    if (distance2D(x, z, WORLD.gateCenter.x, WORLD.gateCenter.z) < 70) return 'The Echo Gate';
    if (distance2D(x, z, WORLD.plazaCenter.x, WORLD.plazaCenter.z) < 58) return 'The Sunken Plaza';
    if (distance2D(x, z, 182, -96) < 88) return 'Whispering Grove';
    if (distance2D(x, z, -152, 84) < 78) return 'Windward Ridge';
    if (distance2D(x, z, WORLD.lakeCenter.x, WORLD.lakeCenter.z) < WORLD.lakeRadius + 22) return 'Mirrorwater Shore';
    return 'Mirrorwater Valley';
  }

  dispose(): void {
    this.testRange?.dispose();
    this.collision.clear();
    this.collectibles?.destroy();
    this.atmosphere?.destroy();
    this.vegetation?.destroy();
    this.props?.destroy();
    this.landmarks?.destroy();
    this.lighting?.root.destroy();
    this.water?.destroy();
    this.terrain?.destroy();
    this.sky?.destroy();
  }
}
