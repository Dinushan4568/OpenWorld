import { Entity, type AppBase } from 'playcanvas';
import { SHARD_LOCATIONS, WORLD, type ModelName, type QualityProfile } from '../config';
import type { AssetManager } from '../core/AssetManager';
import { createRandom, distance2D, randomRange } from '../util/math';
import { heightAt, isScatterAllowed, normalAt } from './heightfield';
import type { CollisionWorld } from './collision';

/** Vertical solids registered for props that the player can bump into. */
export const PROP_SOLIDS: Partial<Record<ModelName, { radius: number; height: number; walkable?: boolean }>> = {
  rock_cluster: { radius: 1.35, height: 2.1, walkable: true },
  spire_tree: { radius: 0.42, height: 6.0 },
  temple_pillar: { radius: 0.72, height: 4.8 },
  ruin_wall: { radius: 2.1, height: 2.9 },
  monolith_spire: { radius: 1.0, height: 7.4 },
};

interface PlacementOptions {
  count: number;
  radius: number;
  minHeight?: number;
  maxSlope?: number;
  scale: [number, number];
  tilt?: number;
  shadows?: boolean;
  region?: (x: number, z: number) => boolean;
  sink?: number;
}

export interface ScatterStats {
  placed: number;
  skipped: number;
  byType: Record<string, number>;
}

/** Deterministic scatter of the glTF prop library across the valley. */
export class Props {
  readonly root: Entity;
  readonly stats: ScatterStats = { placed: 0, skipped: 0, byType: {} };
  private readonly app: AppBase;
  private readonly assets: AssetManager;
  private readonly profile: QualityProfile;
  private readonly collision: CollisionWorld | null;
  private readonly rng = createRandom(777001);

  constructor(app: AppBase, assets: AssetManager, profile: QualityProfile, collision?: CollisionWorld) {
    this.app = app;
    this.assets = assets;
    this.profile = profile;
    this.collision = collision ?? null;
    this.root = new Entity('scatter-props');
    app.root.addChild(this.root);
    this.build();
  }

  private build(): void {
    const density = this.profile.scatterDensity;

    this.scatter('rock_cluster', {
      count: Math.round(190 * density),
      radius: 318,
      scale: [0.55, 2.1],
      tilt: 0.22,
      shadows: true,
      sink: 0.35,
    });

    this.scatter('rock_cluster', {
      count: Math.round(120 * density),
      radius: 330,
      scale: [0.22, 0.6],
      tilt: 0.35,
      shadows: false,
      sink: 0.12,
    });

    this.scatter('spire_tree', {
      count: Math.round(86 * density),
      radius: 330,
      scale: [0.7, 1.45],
      tilt: 0.05,
      shadows: true,
      maxSlope: 0.2,
      region: (x, z) => {
        const grove = distance2D(x, z, 182, -96);
        const lakeShore = distance2D(x, z, WORLD.lakeCenter.x, WORLD.lakeCenter.z);
        const moisture = Math.sin(x * 0.031) * Math.cos(z * 0.027);
        return grove < 110 || (lakeShore < 130 && lakeShore > 45) || moisture > 0.15;
      },
    });

    this.scatter('temple_pillar', {
      count: Math.round(16 * density),
      radius: 300,
      scale: [0.55, 1.25],
      tilt: 0.5,
      shadows: true,
      region: (x, z) =>
        distance2D(x, z, WORLD.plazaCenter.x, WORLD.plazaCenter.z) < 95 ||
        distance2D(x, z, WORLD.gateCenter.x, WORLD.gateCenter.z) < 85,
    });

    this.scatter('ruin_wall', {
      count: Math.round(10 * density),
      radius: 300,
      scale: [0.6, 1.3],
      tilt: 0.12,
      shadows: true,
      region: (x, z) =>
        distance2D(x, z, WORLD.plazaCenter.x, WORLD.plazaCenter.z) < 75 ||
        distance2D(x, z, 182, -96) < 55,
    });

    this.scatter('monolith_spire', {
      count: Math.round(12 * density),
      radius: 325,
      scale: [0.6, 1.7],
      tilt: 0.12,
      shadows: true,
      minHeight: 14,
    });

    this.scatter('spire_tree', {
      count: Math.round(10 * density),
      radius: 300,
      scale: [0.5, 0.85],
      tilt: 0.12,
      shadows: true,
      region: (x, z) => distance2D(x, z, WORLD.gateCenter.x, WORLD.gateCenter.z) < 90,
    });
  }

  private scatter(name: ModelName, options: PlacementOptions): void {
    const {
      count,
      radius,
      scale,
      tilt = 0,
      shadows = true,
      minHeight = WORLD.waterLevel + 0.9,
      maxSlope = 0.45,
      region,
      sink = 0.2,
    } = options;
    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 22;

    while (placed < count && attempts < maxAttempts) {
      attempts++;
      const angle = this.rng() * Math.PI * 2;
      const distance = Math.sqrt(this.rng()) * radius;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;

      if (!isScatterAllowed(x, z, minHeight)) {
        this.stats.skipped++;
        continue;
      }
      const y = heightAt(x, z);
      const normalY = normalAt(x, z)[1];
      if (normalY < 1 - maxSlope) {
        this.stats.skipped++;
        continue;
      }
      if (region && !region(x, z)) {
        this.stats.skipped++;
        continue;
      }
      if (SHARD_LOCATIONS.some((shard) => distance2D(x, z, shard.x, shard.z) < 7)) {
        this.stats.skipped++;
        continue;
      }

      let entity = this.assets.instantiate(name, { castShadows: shadows, receiveShadows: true });
      if (!entity) entity = this.assets.createFallback(name);

      const s = randomRange(this.rng, scale[0], scale[1]);
      const squash = randomRange(this.rng, 0.85, 1.15);
      entity.setPosition(x, y - s * sink, z);
      entity.setEulerAngles(
        randomRange(this.rng, -tilt, tilt) * (180 / Math.PI),
        this.rng() * 360,
        randomRange(this.rng, -tilt, tilt) * (180 / Math.PI),
      );
      entity.setLocalScale(s * randomRange(this.rng, 0.9, 1.1), s * squash, s * randomRange(this.rng, 0.9, 1.1));
      entity.name = `${name}:${placed}`;
      this.root.addChild(entity);
      this.registerSolid(name, x, y - s * sink, z, s);
      placed++;
      this.stats.placed++;
      this.stats.byType[name] = (this.stats.byType[name] ?? 0) + 1;
    }
  }

  private registerSolid(name: ModelName, x: number, baseY: number, z: number, scale: number): void {
    if (!this.collision) return;
    const solid = PROP_SOLIDS[name];
    if (!solid) return;
    // Keep the spawn terrace clear so the expedition never starts inside a prop.
    if (distance2D(x, z, WORLD.spawn.x, WORLD.spawn.z) < 4.5) return;
    this.collision.add({
      x,
      z,
      radius: solid.radius * scale,
      base: baseY - 0.25,
      top: baseY + solid.height * scale,
      walkable: solid.walkable ?? false,
      kind: name,
    });
  }

  destroy(): void {
    this.root.destroy();
    void this.app;
  }
}
