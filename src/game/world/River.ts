import {
  BLEND_ADDITIVEALPHA,
  BLEND_NORMAL,
  CULLFACE_NONE,
  Color,
  Entity,
  Mesh,
  MeshInstance,
  StandardMaterial,
  Vec2,
  type AppBase,
  type Texture,
} from 'playcanvas';
import { clamp, createRandom, lerp } from '../util/math';
import { addQuad, addTriangle, buildMesh, createMeshData, type MeshData } from '../util/meshBuilder';
import { riverProfile } from './heightfield';

/**
 * The Crystal River's visible water: a flowing ribbon that follows the derived
 * water profile, vertical sheets at the two waterfalls, foam at the lips and
 * bases, and drifting spray.
 */
export class River {
  readonly root: Entity;
  readonly waterfalls = riverProfile().waterfalls;
  private readonly app: AppBase;
  private readonly meshes: Mesh[] = [];
  private readonly ribbonMaterial: StandardMaterial;
  private readonly fallMaterial: StandardMaterial;
  private readonly foamMaterial: StandardMaterial;
  private readonly spray: Array<{
    entity: Entity;
    baseX: number;
    baseZ: number;
    baseY: number;
    phase: number;
    speed: number;
    spread: number;
    dirX: number;
    dirZ: number;
  }> = [];
  private readonly materials: StandardMaterial[] = [];
  private time = 0;
  private accumulator = 0;
  private night = 0;

  constructor(app: AppBase, normalMap: Texture, detailMap: Texture) {
    this.app = app;
    this.root = new Entity('crystal-river');
    app.root.addChild(this.root);

    this.ribbonMaterial = new StandardMaterial();
    this.ribbonMaterial.name = 'river-ribbon';
    this.ribbonMaterial.diffuse = new Color(0.11, 0.26, 0.28, 1);
    this.ribbonMaterial.diffuseMap = detailMap;
    this.ribbonMaterial.diffuseMapTiling = new Vec2(2, 2);
    this.ribbonMaterial.normalMap = normalMap;
    this.ribbonMaterial.normalMapTiling = new Vec2(3, 3);
    this.ribbonMaterial.useMetalness = true;
    this.ribbonMaterial.metalness = 0.06;
    this.ribbonMaterial.gloss = 0.92;
    this.ribbonMaterial.opacity = 0.9;
    this.ribbonMaterial.blendType = BLEND_NORMAL;
    this.ribbonMaterial.depthWrite = false;
    this.ribbonMaterial.cull = CULLFACE_NONE;
    this.ribbonMaterial.useFog = true;
    this.ribbonMaterial.update();
    this.materials.push(this.ribbonMaterial);

    this.fallMaterial = new StandardMaterial();
    this.fallMaterial.name = 'waterfall-sheet';
    this.fallMaterial.diffuse = new Color(0.7, 0.86, 0.9, 1);
    this.fallMaterial.emissive = new Color(0.32, 0.5, 0.55, 1);
    this.fallMaterial.emissiveIntensity = 0.3;
    this.fallMaterial.opacity = 0.86;
    this.fallMaterial.blendType = BLEND_NORMAL;
    this.fallMaterial.depthWrite = false;
    this.fallMaterial.cull = CULLFACE_NONE;
    this.fallMaterial.useFog = true;
    this.fallMaterial.update();
    this.materials.push(this.fallMaterial);

    this.foamMaterial = new StandardMaterial();
    this.foamMaterial.name = 'waterfall-foam';
    this.foamMaterial.useLighting = false;
    this.foamMaterial.diffuse = new Color(0.9, 0.97, 1, 1);
    this.foamMaterial.emissive = new Color(0.9, 0.97, 1, 1);
    this.foamMaterial.emissiveIntensity = 1.1;
    this.foamMaterial.blendType = BLEND_ADDITIVEALPHA;
    this.foamMaterial.opacity = 0.5;
    this.foamMaterial.depthWrite = false;
    this.foamMaterial.cull = CULLFACE_NONE;
    this.foamMaterial.useFog = true;
    this.foamMaterial.update();
    this.materials.push(this.foamMaterial);

    this.buildRibbon();
    this.buildWaterfalls();
  }

  private buildRibbon(): void {
    const profile = riverProfile();
    const data = createMeshData();
    const stations = profile.stations;
    const left: Array<[number, number, number]> = [];
    const right: Array<[number, number, number]> = [];
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      const prev = stations[i - 1] ?? station;
      const next = stations[i + 1] ?? station;
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const half = station.width * 0.46;
      const y = station.y + 0.02;
      left.push([station.x + nx * half, y, station.z + nz * half]);
      right.push([station.x - nx * half, y, station.z - nz * half]);
    }

    const c: [number, number, number, number] = [1, 1, 1, 1];
    for (let i = 0; i < stations.length - 1; i++) {
      const v0 = stations[i].distance / 9;
      const v1 = stations[i + 1].distance / 9;
      const a: [number, number, number] = left[i];
      const b: [number, number, number] = right[i];
      const c2: [number, number, number] = left[i + 1];
      const d: [number, number, number] = right[i + 1];
      addTriangle(data, { p: a, uv: [0, v0], c }, { p: c2, uv: [0, v1], c }, { p: b, uv: [1, v0], c });
      addTriangle(data, { p: b, uv: [1, v0], c }, { p: c2, uv: [0, v1], c }, { p: d, uv: [1, v1], c });
    }

    const mesh = buildMesh(this.app.graphicsDevice, data, 'river-ribbon');
    this.meshes.push(mesh);
    const entity = new Entity('river-ribbon');
    entity.addComponent('render');
    entity.render!.meshInstances = [new MeshInstance(mesh, this.ribbonMaterial)];
    entity.render!.castShadows = false;
    entity.render!.receiveShadows = false;
    this.root.addChild(entity);
  }

  private buildWaterfalls(): void {
    const rand = createRandom(8181);
    for (const fall of this.waterfalls) {
      const profile = riverProfile();
      const half = fall.width * 0.62;
      const dirX = Math.sin(fall.angle);
      const dirZ = Math.cos(fall.angle);
      const perpX = Math.cos(fall.angle);
      const perpZ = -Math.sin(fall.angle);
      const sheet = createMeshData();
      const white: [number, number, number, number] = [0.92, 0.97, 1, 1];
      const foam: [number, number, number, number] = [1, 1, 1, 1];
      const steps = 5;
      const topY = fall.topY + 0.05;
      const bottomY = fall.bottomY - 0.1;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const y0 = lerp(topY, bottomY, t0);
        const y1 = lerp(topY, bottomY, t1);
        const drop0 = t0 * 1.8;
        const drop1 = t1 * 1.8;
        const cx0 = fall.x + dirX * drop0;
        const cz0 = fall.z + dirZ * drop0;
        const cx1 = fall.x + dirX * drop1;
        const cz1 = fall.z + dirZ * drop1;
        const alpha = lerp(0.92, 0.55, t0);
        const c0: [number, number, number, number] = [white[0], white[1], white[2], alpha];
        const c1: [number, number, number, number] = [white[0], white[1], white[2], alpha * 0.9];
        addQuad(
          sheet,
          { p: [cx0 + perpX * half, y0, cz0 + perpZ * half], c: c0, uv: [0, t0] },
          { p: [cx0 - perpX * half, y0, cz0 - perpZ * half], c: c0, uv: [1, t0] },
          { p: [cx1 - perpX * half * 0.9, y1, cz1 - perpZ * half * 0.9], c: c1, uv: [1, t1] },
          { p: [cx1 + perpX * half * 0.9, y1, cz1 + perpZ * half * 0.9], c: c1, uv: [0, t1] },
        );
      }
      // Foam crest at the lip.
      addQuad(
        sheet,
        { p: [fall.x + perpX * half, topY - 0.02, fall.z + perpZ * half], c: foam, uv: [0, 0] },
        { p: [fall.x - perpX * half, topY - 0.02, fall.z - perpZ * half], c: foam, uv: [1, 0] },
        { p: [fall.x - perpX * half * 0.9 + dirX * 1.6, topY - 0.5, fall.z - perpZ * half * 0.9 + dirZ * 1.6], c: foam, uv: [1, 1] },
        { p: [fall.x + perpX * half * 0.9 + dirX * 1.6, topY - 0.5, fall.z + perpZ * half * 0.9 + dirZ * 1.6], c: foam, uv: [0, 1] },
      );

      const mesh = buildMesh(this.app.graphicsDevice, sheet, `waterfall-${fall.z.toFixed(0)}`);
      this.meshes.push(mesh);
      const entity = new Entity(`waterfall-${fall.z.toFixed(0)}`);
      entity.addComponent('render');
      entity.render!.meshInstances = [new MeshInstance(mesh, this.fallMaterial)];
      entity.render!.castShadows = false;
      this.root.addChild(entity);

      // Foam pool at the base.
      const pool = new Entity(`foam-pool-${fall.z.toFixed(0)}`);
      pool.addComponent('render', { type: 'cylinder', material: this.foamMaterial });
      pool.setPosition(fall.x + dirX * 2.2, fall.bottomY + 0.06, fall.z + dirZ * 2.2);
      pool.setLocalScale(half * 1.9, 0.08, half * 1.9);
      pool.render!.castShadows = false;
      this.root.addChild(pool);

      // Spray sprites drifting up from the base.
      for (let i = 0; i < 7; i++) {
        const sprite = new Entity(`spray-${fall.z.toFixed(0)}-${i}`);
        sprite.addComponent('render', { type: 'sphere', material: this.foamMaterial });
        const size = 0.6 + rand() * 1.1;
        sprite.setLocalScale(size, size * 0.7, size);
        sprite.setPosition(
          fall.x + dirX * 2.5 + (rand() - 0.5) * half * 1.4,
          fall.bottomY + rand() * 1.2,
          fall.z + dirZ * 2.5 + (rand() - 0.5) * half * 1.4,
        );
        sprite.render!.castShadows = false;
        this.root.addChild(sprite);
        this.spray.push({
          entity: sprite,
          baseX: sprite.getPosition().x,
          baseZ: sprite.getPosition().z,
          baseY: fall.bottomY,
          phase: rand() * Math.PI * 2,
          speed: 0.5 + rand() * 0.8,
          spread: half * 0.9,
          dirX,
          dirZ,
        });
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.accumulator += dt;
    const across = (this.time * 0.02) % 1;
    this.ribbonMaterial.normalMapOffset = new Vec2(-across, this.time * 0.16);
    if (this.accumulator > 0.12) {
      this.accumulator = 0;
      this.ribbonMaterial.update();
      this.fallMaterial.normalMapOffset = new Vec2(0, this.time * 0.6);
      this.fallMaterial.update();
      this.foamMaterial.opacity = 0.42 + Math.sin(this.time * 2.1) * 0.08;
      this.foamMaterial.update();
    }
    for (const drop of this.spray) {
      const t = (this.time * drop.speed + drop.phase) % (Math.PI * 2);
      const lift = (Math.sin(t) * 0.5 + 0.5) * 2.6;
      const drift = Math.cos(t) * 0.7;
      drop.entity.setPosition(
        drop.baseX + drop.dirX * drift + Math.cos(drop.phase) * drop.spread * 0.25,
        drop.baseY + 0.5 + lift,
        drop.baseZ + drop.dirZ * drift + Math.sin(drop.phase) * drop.spread * 0.25,
      );
    }
  }

  setNight(night: number): void {
    this.night = clamp(night, 0, 1);
    this.ribbonMaterial.diffuse = new Color(
      lerp(0.11, 0.05, this.night),
      lerp(0.26, 0.12, this.night),
      lerp(0.28, 0.16, this.night),
      1,
    );
    this.ribbonMaterial.gloss = 0.92 - this.night * 0.18;
    this.ribbonMaterial.update();
    this.fallMaterial.emissiveIntensity = 0.22 + this.night * 0.35;
    this.fallMaterial.update();
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.destroy();
    for (const material of this.materials) material.destroy();
    this.root.destroy();
  }
}
