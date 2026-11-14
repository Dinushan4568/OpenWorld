import {
  BLEND_NORMAL,
  CULLFACE_NONE,
  Color,
  Entity,
  MeshInstance,
  StandardMaterial,
  Vec2,
  type AppBase,
  type Mesh,
  type Texture,
} from 'playcanvas';
import { WORLD } from '../config';
import { addQuad, buildMesh, createMeshData } from '../util/meshBuilder';
import { heightAt } from './heightfield';

/**
 * Mirrorwater: a single reflective plane with a scrolling micro-normal map.
 * Reflections come from the scene environment atlas, so the lake picks up the
 * sky, the sun and the glow of the Echo Gate without extra render targets.
 */
export class Water {
  readonly root: Entity;
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly foamMesh: Mesh;
  private readonly foamMaterial: StandardMaterial;
  private time = 0;
  private updateAccumulator = 0;
  private readonly baseGloss = 0.94;
  private readonly baseDiffuse: [number, number, number] = [0.055, 0.14, 0.16];

  constructor(app: AppBase, normalMap: Texture, detailMap: Texture) {
    const device = app.graphicsDevice;
    const data = createMeshData();
    const half = WORLD.terrainSize * 0.62;
    const y = WORLD.waterLevel;
    const c: [number, number, number, number] = [1, 1, 1, 1];
    data.positions.push(-half, y, -half, half, y, -half, half, y, half, -half, y, half);
    data.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    data.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    data.colors.push(...c, ...c, ...c, ...c);
    data.indices.push(0, 2, 1, 0, 3, 2);
    this.mesh = buildMesh(device, data, 'mirrorwater-surface');

    this.material = new StandardMaterial();
    this.material.name = 'water-material';
    this.material.diffuse = new Color(0.055, 0.14, 0.16, 1);
    this.material.diffuseMap = detailMap;
    this.material.diffuseMapTiling = new Vec2(34, 34);
    this.material.normalMap = normalMap;
    this.material.normalMapTiling = new Vec2(22, 22);
    this.material.useMetalness = true;
    this.material.metalness = 0.04;
    this.material.gloss = this.baseGloss;
    this.material.clearCoat = 0.24;
    this.material.clearCoatGloss = 0.9;
    this.material.opacity = 0.9;
    this.material.blendType = BLEND_NORMAL;
    this.material.depthWrite = false;
    this.material.useFog = true;
    this.material.update();

    this.root = new Entity('mirrorwater');
    this.root.addComponent('render');
    this.root.render!.meshInstances = [new MeshInstance(this.mesh, this.material)];
    this.root.render!.castShadows = false;
    this.root.render!.receiveShadows = false;
    app.root.addChild(this.root);

    this.foamMaterial = new StandardMaterial();
    this.foamMaterial.name = 'shoreline-foam';
    this.foamMaterial.diffuse = new Color(0.72, 0.9, 0.88, 1);
    this.foamMaterial.emissive = new Color(0.35, 0.58, 0.55, 1);
    this.foamMaterial.emissiveIntensity = 0.2;
    this.foamMaterial.useLighting = false;
    this.foamMaterial.blendType = BLEND_NORMAL;
    this.foamMaterial.opacity = 0.2;
    this.foamMaterial.depthWrite = false;
    this.foamMaterial.cull = CULLFACE_NONE;
    this.foamMaterial.useFog = true;
    this.foamMaterial.update();
    this.foamMesh = this.buildShoreFoam();
    const foamEntity = new Entity('shoreline-foam');
    foamEntity.addComponent('render');
    foamEntity.render!.meshInstances = [new MeshInstance(this.foamMesh, this.foamMaterial)];
    foamEntity.render!.castShadows = false;
    foamEntity.render!.receiveShadows = false;
    this.root.addChild(foamEntity);
  }

  /** A single subtle ribbon where the lake surface meets the basin. */
  private buildShoreFoam(): Mesh {
    const data = createMeshData();
    const centre = WORLD.lakeCenter;
    const segments = 160;
    const points: Array<{ x: number; z: number }> = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      // The basin edge is irregular, so bracket the waterline with a short
      // binary search instead of walking the radius in 2 m steps.
      let low = 6;
      let high = WORLD.lakeRadius * 1.45;
      for (let step = 0; step < 9; step++) {
        const mid = (low + high) * 0.5;
        const x = centre.x + Math.cos(angle) * mid;
        const z = centre.z + Math.sin(angle) * mid;
        if (heightAt(x, z) > WORLD.waterLevel + 0.18) high = mid;
        else low = mid;
      }
      points.push({
        x: centre.x + Math.cos(angle) * high,
        z: centre.z + Math.sin(angle) * high,
      });
    }
    if (points.length > 4) points.push(points[0]);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const width = 1.5;
      const px = (-dz / len) * width;
      const pz = (dx / len) * width;
      const y = WORLD.waterLevel + 0.035;
      addQuad(
        data,
        { p: [a.x - px, y, a.z - pz], uv: [0, 0], c: [1, 1, 1, 1] },
        { p: [a.x + px, y, a.z + pz], uv: [1, 0], c: [1, 1, 1, 1] },
        { p: [b.x + px, y, b.z + pz], uv: [1, 1], c: [1, 1, 1, 1] },
        { p: [b.x - px, y, b.z - pz], uv: [0, 1], c: [1, 1, 1, 1] },
      );
    }
    return buildMesh(this.mesh.device, data, 'shoreline-foam-mesh');
  }

  /**
   * Tint the lake for the current time of day. The surface still reflects the
   * scene environment; only the base colour and roughness shift.
   */
  setEnvironment(haze: readonly [number, number, number], night: number): void {
    const n = Math.max(0, Math.min(1, night));
    const r = this.baseDiffuse[0] * (1 - n * 0.55) + haze[0] * 0.16 * (1 - n);
    const g = this.baseDiffuse[1] * (1 - n * 0.55) + haze[1] * 0.2 * (1 - n);
    const b = this.baseDiffuse[2] * (1 - n * 0.5) + haze[2] * 0.24 * (1 - n);
    this.material.diffuse = new Color(r, g, b, 1);
    this.material.gloss = this.baseGloss - n * 0.16;
    this.material.update();
  }

  update(dt: number): void {
    this.time += dt;
    this.updateAccumulator += dt;
    if (this.updateAccumulator < 0.12) return;
    this.updateAccumulator = 0;
    const u = (this.time * 0.006) % 1;
    const v = (this.time * 0.004) % 1;
    this.material.diffuseMapOffset = new Vec2(u, v);
    this.material.normalMapOffset = new Vec2(-u * 0.7, v * 0.9);
    this.material.gloss = this.baseGloss - Math.sin(this.time * 0.4) * 0.02;
    this.material.update();
  }

  destroy(): void {
    this.mesh.destroy();
    this.foamMesh.destroy();
    this.material.destroy();
    this.foamMaterial.destroy();
    this.root.destroy();
  }
}
