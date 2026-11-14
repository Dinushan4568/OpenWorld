import { BLEND_ADDITIVEALPHA, Color, Entity, StandardMaterial, type AppBase } from 'playcanvas';
import { SHARD_LOCATIONS, type ModelName } from '../config';
import type { AssetManager } from '../core/AssetManager';
import { Emitter } from '../core/emitter';
import { clamp, distance2D, lerp } from '../util/math';
import { heightAt } from './heightfield';

export interface EchoShard {
  id: string;
  name: string;
  hint: string;
  x: number;
  z: number;
  y: number;
  collected: boolean;
  root: Entity;
  shard: Entity;
  ring: Entity;
  light: Entity;
}

export interface CollectibleEvents extends Record<string, unknown> {
  collected: EchoShard;
}

/** The five Echo Shards and their shrine pedestals. */
export class Collectibles extends Emitter<CollectibleEvents> {
  readonly root: Entity;
  readonly shards: EchoShard[] = [];
  private readonly app: AppBase;
  private readonly assets: AssetManager;
  private readonly runeMaterial: StandardMaterial;
  private readonly pedestalMaterial: StandardMaterial;
  private collectAnimation: { shard: EchoShard; time: number } | null = null;

  constructor(app: AppBase, assets: AssetManager, collectedIds: readonly string[] = []) {
    super();
    this.app = app;
    this.assets = assets;
    this.root = new Entity('echo-shards');
    app.root.addChild(this.root);

    this.runeMaterial = new StandardMaterial();
    this.runeMaterial.diffuse = new Color(0.04, 0.2, 0.18, 1);
    this.runeMaterial.emissive = new Color(0.35, 1, 0.86);
    this.runeMaterial.emissiveIntensity = 1.5;
    this.runeMaterial.blendType = BLEND_ADDITIVEALPHA;
    this.runeMaterial.useLighting = false;
    this.runeMaterial.depthWrite = false;
    this.runeMaterial.opacity = 0.55;
    this.runeMaterial.update();

    this.pedestalMaterial = new StandardMaterial();
    this.pedestalMaterial.diffuse = new Color(0.33, 0.32, 0.29, 1);
    this.pedestalMaterial.useMetalness = true;
    this.pedestalMaterial.metalness = 0.06;
    this.pedestalMaterial.gloss = 0.22;
    this.pedestalMaterial.update();

    for (const definition of SHARD_LOCATIONS) {
      this.buildShard(definition, collectedIds.includes(definition.id));
    }
  }

  private buildShard(
    definition: { id: string; name: string; hint: string; x: number; z: number },
    collected: boolean,
  ): void {
    const y = heightAt(definition.x, definition.z);
    const root = new Entity(`shard-shrine:${definition.id}`);
    root.setPosition(definition.x, y, definition.z);
    this.root.addChild(root);

    const pedestal = new Entity('pedestal');
    pedestal.addComponent('render', { type: 'cylinder', material: this.pedestalMaterial });
    pedestal.setLocalScale(1.5, 0.5, 1.5);
    pedestal.setLocalPosition(0, 0.25, 0);
    pedestal.render!.castShadows = true;
    pedestal.render!.receiveShadows = true;
    root.addChild(pedestal);

    const ring = new Entity('pedestal-rune');
    ring.addComponent('render', { type: 'torus', material: this.runeMaterial });
    ring.setLocalScale(1.9, 0.06, 1.9);
    ring.setLocalPosition(0, 0.55, 0);
    ring.render!.castShadows = false;
    root.addChild(ring);

    let shard = this.assets.instantiate('echo_shard', { castShadows: false, receiveShadows: false });
    if (!shard) shard = this.assets.createFallback('echo_shard');
    shard.setLocalPosition(0, 1.55, 0);
    shard.setLocalScale(1.6, 1.6, 1.6);
    shard.name = `shard:${definition.id}`;
    root.addChild(shard);

    const light = new Entity('shard-light');
    light.addComponent('light', {
      type: 'point',
      color: new Color(0.35, 1, 0.86),
      intensity: 2.0,
      range: 12,
      castShadows: false,
    });
    light.setLocalPosition(0, 1.6, 0);
    root.addChild(light);

    const entry: EchoShard = {
      ...definition,
      y,
      collected,
      root,
      shard,
      ring,
      light,
    };
    if (collected) {
      root.enabled = false;
    }
    this.shards.push(entry);
  }

  get collectedCount(): number {
    return this.shards.filter((shard) => shard.collected).length;
  }

  get total(): number {
    return this.shards.length;
  }

  get allCollected(): boolean {
    return this.collectedCount === this.total;
  }

  get remaining(): EchoShard[] {
    return this.shards.filter((shard) => !shard.collected);
  }

  /** Re-arm every shrine for a fresh expedition. */
  reset(): void {
    for (const shard of this.shards) {
      shard.collected = false;
      shard.root.enabled = true;
      shard.shard.setLocalScale(1.6, 1.6, 1.6);
      shard.shard.setLocalPosition(0, 1.55, 0);
      shard.light.light!.intensity = 2;
    }
    this.collectAnimation = null;
  }

  markCollected(id: string): void {
    const shard = this.shards.find((entry) => entry.id === id);
    if (!shard || shard.collected) return;
    shard.collected = true;
    shard.root.enabled = false;
  }

  update(dt: number, time: number, player: { x: number; y: number; z: number }): EchoShard | null {
    let picked: EchoShard | null = null;

    for (const shard of this.shards) {
      if (shard.collected) continue;
      const localY = 1.55 + Math.sin(time * 1.6 + shard.x * 0.1) * 0.14;
      shard.shard.setLocalPosition(0, localY, 0);
      shard.shard.setEulerAngles(14, time * 42 + shard.z, 0);
      shard.ring.rotate(0, -18 * dt, 0);
      shard.light.light!.intensity = 1.8 + Math.sin(time * 2.4 + shard.x) * 0.35;

      if (
        distance2D(player.x, player.z, shard.x, shard.z) < 2.6 &&
        Math.abs(player.y + 1 - (shard.y + 1.2)) < 2.6
      ) {
        shard.collected = true;
        this.collectAnimation = { shard, time: 0 };
        this.emit('collected', shard);
        picked = shard;
      }
    }

    if (this.collectAnimation) {
      const { shard } = this.collectAnimation;
      this.collectAnimation.time += dt;
      const t = clamp(this.collectAnimation.time / 0.7, 0, 1);
      shard.root.enabled = true;
      shard.shard.setLocalScale(lerp(1.6, 3.4, t), lerp(1.6, 3.4, t), lerp(1.6, 3.4, t));
      shard.shard.setLocalPosition(0, lerp(1.55, 3.2, t), 0);
      shard.light.light!.intensity = lerp(6, 0, t);
      if (t >= 1) {
        shard.root.enabled = false;
        shard.shard.setLocalScale(1.6, 1.6, 1.6);
        this.collectAnimation = null;
      }
    }
    return picked;
  }

  get nearest(): EchoShard[] {
    return this.remaining.slice();
  }

  destroy(): void {
    this.runeMaterial.destroy();
    this.pedestalMaterial.destroy();
    this.root.destroy();
    void this.app;
    void this.assets;
  }
}
