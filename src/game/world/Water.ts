import {
  BLEND_NORMAL,
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
import { buildMesh, createMeshData } from '../util/meshBuilder';

/**
 * Mirrorwater: a single reflective plane with a scrolling micro-normal map.
 * Reflections come from the scene environment atlas, so the lake picks up the
 * sky, the sun and the glow of the Echo Gate without extra render targets.
 */
export class Water {
  readonly root: Entity;
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
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
    this.material.destroy();
    this.root.destroy();
  }
}
