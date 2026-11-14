import {
  BLEND_ADDITIVEALPHA,
  CULLFACE_NONE,
  Color,
  Entity,
  Mesh,
  MeshInstance,
  StandardMaterial,
  type AppBase,
} from 'playcanvas';
import { WORLD } from '../config';
import type { AssetManager } from '../core/AssetManager';
import type { ModelName } from '../config';
import { createRandom, lerp, randomRange } from '../util/math';
import { createTexture, generateBeamTexture } from '../util/textures';
import { heightAt } from './heightfield';
import type { CollisionWorld } from './collision';
import { PROP_SOLIDS } from './solids';

/** Original ruins, monolith circles and the Echo Gate. */
export class Landmarks {
  readonly root: Entity;
  readonly gateEnergy = { value: 0 };
  private readonly app: AppBase;
  private readonly assets: AssetManager;
  private readonly collision: CollisionWorld | null;
  private readonly materials: StandardMaterial[] = [];
  private readonly ownMeshes: Mesh[] = [];
  private readonly beamMaterial: StandardMaterial;
  private readonly beamTexture: ReturnType<typeof createTexture>;
  private readonly runeMaterials: StandardMaterial[] = [];
  private readonly crystals: Entity[] = [];
  private gateRuneMaterial: StandardMaterial | null = null;
  private night = 0;

  constructor(app: AppBase, assets: AssetManager, collision?: CollisionWorld) {
    this.app = app;
    this.assets = assets;
    this.collision = collision ?? null;
    this.root = new Entity('landmarks');
    app.root.addChild(this.root);

    const beamTexture = createTexture(app.graphicsDevice, generateBeamTexture(), {
      srgb: true,
      repeat: false,
      mipmaps: false,
      name: 'gate-beam',
    });
    this.beamTexture = beamTexture;
    this.beamMaterial = new StandardMaterial();
    this.beamMaterial.name = 'gate-beam-material';
    this.beamMaterial.diffuse = new Color(0.45, 1, 0.9, 1);
    this.beamMaterial.diffuseMap = beamTexture;
    this.beamMaterial.useLighting = false;
    this.beamMaterial.useFog = false;
    this.beamMaterial.blendType = BLEND_ADDITIVEALPHA;
    this.beamMaterial.opacity = 0.16;
    this.beamMaterial.depthWrite = false;
    this.beamMaterial.cull = CULLFACE_NONE;
    this.beamMaterial.update();
    this.materials.push(this.beamMaterial);

    this.buildGate();
    this.buildPlaza();
    this.buildGrove();
    this.buildRidge();
    this.buildLakeRelic();
  }

  private addProp(
    name: ModelName,
    x: number,
    z: number,
    scale: number,
    rotationY: number,
    options: { yOffset?: number; pitch?: number; roll?: number; castShadows?: boolean } = {},
  ): Entity {
    const y = heightAt(x, z) + (options.yOffset ?? 0);
    let entity = this.assets.instantiate(name, {
      castShadows: options.castShadows ?? true,
      receiveShadows: true,
    });
    if (!entity) entity = this.assets.createFallback(name);
    entity.setPosition(x, y, z);
    entity.setEulerAngles(options.pitch ?? 0, (rotationY * 180) / Math.PI, options.roll ?? 0);
    if (name === 'echo_gate' || name === 'gate_rune') {
      entity.setPosition(x, y + 14 * scale, z);
      entity.setLocalScale(scale, scale, scale);
    } else {
      entity.setLocalScale(scale, scale, scale);
    }
    this.root.addChild(entity);
    this.registerSolid(name, x, y, z, scale);
    return entity;
  }

  private registerSolid(name: ModelName, x: number, baseY: number, z: number, scale: number): void {
    if (!this.collision) return;
    const solid = PROP_SOLIDS[name];
    if (!solid) return;
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

  private makeEmissiveMaterial(color: Color, intensity: number): StandardMaterial {
    const material = new StandardMaterial();
    material.diffuse = new Color(0.03, 0.09, 0.08, 1);
    material.emissive = color;
    material.emissiveIntensity = intensity;
    material.useMetalness = true;
    material.metalness = 0.15;
    material.gloss = 0.65;
    material.useFog = true;
    material.update();
    this.materials.push(material);
    return material;
  }

  private addPrimitive(
    type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus',
    name: string,
    position: [number, number, number],
    scale: [number, number, number],
    material: StandardMaterial,
    rotation?: [number, number, number],
    castShadows = false,
  ): Entity {
    const entity = new Entity(name);
    entity.addComponent('render', { type, material });
    entity.setLocalPosition(...position);
    entity.setLocalScale(...scale);
    if (rotation) entity.setEulerAngles(...rotation);
    entity.render!.castShadows = castShadows;
    entity.render!.receiveShadows = true;
    this.root.addChild(entity);
    return entity;
  }

  /* ------------------------------------------------------------------ */
  /* The Echo Gate                                                      */
  /* ------------------------------------------------------------------ */

  private buildGate(): void {
    const { x, z } = WORLD.gateCenter;
    const y = heightAt(x, z);
    const facing = Math.atan2(WORLD.plazaCenter.x - x, WORLD.plazaCenter.z - z);
    const gate = this.addProp('echo_gate', x, z, 1, facing, { yOffset: 0 });
    gate.name = 'echo-gate-ring';

    const rune = this.addProp('gate_rune', x, z, 1, facing);
    rune.name = 'echo-gate-runes';
    this.runeMaterials.length = 0;
    for (const render of rune.findComponents('render')) {
      for (const mi of render.meshInstances) {
        const material = mi.material as StandardMaterial;
        material.emissiveIntensity = 1.6;
        material.update();
        this.runeMaterials.push(material);
        this.gateRuneMaterial = material;
      }
    }
    if (!this.gateRuneMaterial) {
      const fallback = this.makeEmissiveMaterial(new Color(0.35, 1, 0.86), 1.6);
      this.runeMaterials.push(fallback);
      this.gateRuneMaterial = fallback;
    }

    // Light pillars through the ring: two crossed additive planes, visible from every angle.
    const beamHeight = 150;
    for (let i = 0; i < 2; i++) {
      const beam = new Entity(`gate-beam-${i}`);
      const mi = new MeshInstance(this.createBeamMesh(18, beamHeight), this.beamMaterial);
      beam.addComponent('render');
      beam.render!.meshInstances = [mi];
      beam.render!.castShadows = false;
      beam.setPosition(x, y - 2, z);
      beam.setEulerAngles(0, i * 90, 0);
      this.root.addChild(beam);
    }

    if (this.collision) {
      // The gate's stone plinth is solid; the arch itself is open to walk through.
      this.collision.add({ x, z, radius: 4.1, base: y - 0.3, top: y + 1.05, walkable: false, kind: 'gate-plinth' });
      this.collision.add({ x: x + 13.4, z, radius: 1.7, base: y - 0.2, top: y + 4.6, walkable: false, kind: 'gate-jamb' });
      this.collision.add({ x: x - 13.4, z, radius: 1.7, base: y - 0.2, top: y + 4.6, walkable: false, kind: 'gate-jamb' });
    }

    // A ring of weathered standing stones.
    const rng = createRandom(2201);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const radius = 24 + rng() * 6;
      const px = x + Math.cos(a) * radius;
      const pz = z + Math.sin(a) * radius;
      this.addProp('temple_pillar', px, pz, randomRange(rng, 0.75, 1.15), a + Math.PI, {
        roll: randomRange(rng, -0.08, 0.08),
      });
    }
    this.addProp('ruin_wall', x - 30, z + 12, 1.2, 0.6);
    this.addProp('ruin_wall', x + 28, z - 16, 0.95, -1.2, { roll: 0.04 });

    // Approach marker: a lone monolith watching the path.
    this.addProp('monolith_spire', x - 16, z - 26, 1.1, 0.4);
    void y;
  }

  private createBeamMesh(width: number, height: number): Mesh {
    const halfW = width / 2;
    const positions = [
      -halfW, 0, 0,
      halfW, 0, 0,
      halfW, height, 0,
      -halfW, height, 0,
    ];
    const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    const indices = [0, 1, 2, 0, 2, 3];
    const mesh = new Mesh(this.app.graphicsDevice);
    mesh.setPositions(new Float32Array(positions));
    mesh.setNormals(new Float32Array(normals));
    mesh.setUvs(0, new Float32Array(uvs));
    mesh.setIndices(new Uint32Array(indices));
    mesh.update();
    this.ownMeshes.push(mesh);
    return mesh;
  }

  /* ------------------------------------------------------------------ */
  /* The Sunken Plaza                                                   */
  /* ------------------------------------------------------------------ */

  private buildPlaza(): void {
    const { x, z } = WORLD.plazaCenter;
    const y = heightAt(x, z);
    const stone = this.makeStoneMaterial(new Color(0.38, 0.36, 0.32, 1));
    const rune = this.makeEmissiveMaterial(new Color(0.4, 1, 0.86), 1.25);
    this.runeMaterials.push(rune);

    this.addPrimitive('cylinder', 'plaza-dais', [x, y + 0.25, z], [12, 0.5, 12], stone, undefined, true);
    this.addPrimitive('cylinder', 'plaza-inner-dais', [x, y + 0.55, z], [7.5, 0.4, 7.5], stone, undefined, true);
    this.addPrimitive('torus', 'plaza-rune-ring', [x, y + 0.78, z], [9.6, 0.1, 9.6], rune);

    if (this.collision) {
      this.collision.add({ x, z, radius: 6.2, base: y - 0.2, top: y + 0.5, walkable: true, kind: 'plaza-dais' });
      this.collision.add({ x, z, radius: 3.8, base: y + 0.4, top: y + 0.75, walkable: true, kind: 'plaza-inner-dais' });
    }

    const crystalMaterial = this.makeEmissiveMaterial(new Color(1, 0.62, 0.3), 2.1);
    const crystal = this.addPrimitive('sphere', 'plaza-crystal', [x, y + 2.1, z], [0.9, 1.6, 0.9], crystalMaterial);
    this.crystals.push(crystal);

    const rng = createRandom(812);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const radius = 16.5;
      const px = x + Math.cos(a) * radius;
      const pz = z + Math.sin(a) * radius;
      const broken = i % 3 === 0;
      const pillar = this.addProp('temple_pillar', px, pz, broken ? 0.8 : randomRange(rng, 0.9, 1.25), -a + Math.PI);
      if (broken) {
        pillar.setEulerAngles(88, (-a * 180) / Math.PI, 0);
        pillar.setLocalPosition(px, heightAt(px, pz) + 0.5, pz);
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const radius = 27;
      this.addProp('monolith_spire', x + Math.cos(a) * radius, z + Math.sin(a) * radius, randomRange(rng, 0.8, 1.2), a);
    }
    this.addProp('ruin_wall', x - 22, z + 18, 1.1, 0.9);
    this.addProp('ruin_wall', x + 24, z + 14, 0.9, -0.7, { roll: -0.05 });
    this.addProp('ruin_wall', x - 6, z - 30, 1.25, 0.1, { roll: 0.08 });
  }

  private makeStoneMaterial(color: Color): StandardMaterial {
    const material = new StandardMaterial();
    material.diffuse = color;
    material.useMetalness = true;
    material.metalness = 0.05;
    material.gloss = 0.18;
    material.useFog = true;
    material.update();
    this.materials.push(material);
    return material;
  }

  /* ------------------------------------------------------------------ */
  /* Grove, ridge and lakeshore                                         */
  /* ------------------------------------------------------------------ */

  private buildGrove(): void {
    const { x, z } = { x: 182, z: -96 };
    const rng = createRandom(1912);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rng() * 0.5;
      const radius = 12 + rng() * 40;
      const px = x + Math.cos(a) * radius;
      const pz = z + Math.sin(a) * radius;
      this.addProp('spire_tree', px, pz, randomRange(rng, 0.85, 1.5), rng() * Math.PI * 2, {
        roll: randomRange(rng, -0.06, 0.06),
      });
    }
    // The shrine itself is built by CivicSites; here we only thicken the grove.
  }

  private buildRidge(): void {
    const x = -152;
    const z = 84;
    const rng = createRandom(617);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      const radius = 7 + rng() * 5;
      this.addProp('monolith_spire', x + Math.cos(a) * radius, z + Math.sin(a) * radius, randomRange(rng, 0.9, 1.6), rng() * Math.PI);
    }
    this.addProp('temple_pillar', x, z, 1.15, 0.2);
  }

  private buildLakeRelic(): void {
    const x = -104;
    const z = -108;
    // A broken gate half-swallowed by the lake.
    this.addProp('echo_gate', x, z, 0.34, -0.8, { roll: 0.1 });
    this.addProp('ruin_wall', x + 12, z + 8, 0.9, 0.4, { roll: 0.06 });
    this.addProp('temple_pillar', x - 8, z - 4, 0.8, 0.9, { roll: 0.5 });
  }

  /* ------------------------------------------------------------------ */

  /** Night lifts the practical glow of the gate and its rune bands. */
  setNight(factor: number): void {
    this.night = Math.max(0, Math.min(1, factor));
    this.applyGateGlow();
  }

  private applyGateGlow(): void {
    const target = (1.2 + this.gateEnergy.value * 2.4) * (0.85 + this.night * 0.5);
    for (const material of this.runeMaterials) {
      material.emissiveIntensity = target;
      material.update();
    }
    this.beamMaterial.opacity = lerp(0.12, 0.55, this.gateEnergy.value) * (0.75 + this.night * 0.65);
    this.beamMaterial.update();
  }

  setGateEnergy(value: number): void {
    this.gateEnergy.value = Math.max(0, Math.min(1, value));
    this.applyGateGlow();
  }

  update(dt: number, time: number): void {
    const pulse = 0.92 + Math.sin(time * 1.4) * 0.08;
    if (this.gateRuneMaterial) {
      this.gateRuneMaterial.emissiveIntensity = (1.2 + this.gateEnergy.value * 2.4) * pulse;
    }
    for (let i = 0; i < this.crystals.length; i++) {
      const crystal = this.crystals[i];
      crystal.rotate(0, 22 * dt, 0);
      crystal.setLocalPosition(
        crystal.getLocalPosition().x,
        heightAt(WORLD.plazaCenter.x, WORLD.plazaCenter.z) + 2.1 + Math.sin(time * 0.9 + i) * 0.18,
        crystal.getLocalPosition().z,
      );
    }
  }

  destroy(): void {
    for (const mesh of this.ownMeshes) mesh.destroy();
    for (const material of this.materials) material.destroy();
    this.beamTexture.destroy();
    this.root.destroy();
  }
}
