import {
  CULLFACE_NONE,
  Color,
  Entity,
  MeshInstance,
  StandardMaterial,
  type AppBase,
  type Mesh,
} from 'playcanvas';
import { WORLD, type QualityProfile } from '../config';
import { clamp, createRandom, randomRange, srgbToLinear } from '../util/math';
import { addTriangle, buildMesh, computeNormals, createMeshData, type MeshData } from '../util/meshBuilder';
import { distance2D } from '../util/math';
import { heightAt, isScatterAllowed } from './heightfield';

interface BladePalette {
  base: [number, number, number];
  tip: [number, number, number];
}

const GRASS_PALETTES: BladePalette[] = [
  { base: [0.06, 0.13, 0.07], tip: [0.36, 0.45, 0.2] },
  { base: [0.05, 0.12, 0.1], tip: [0.28, 0.5, 0.35] },
  { base: [0.08, 0.14, 0.07], tip: [0.5, 0.46, 0.22] },
  { base: [0.07, 0.15, 0.12], tip: [0.33, 0.55, 0.42] },
];

const linear = (c: [number, number, number]): [number, number, number] => [
  srgbToLinear(c[0]),
  srgbToLinear(c[1]),
  srgbToLinear(c[2]),
];

function addBlade(
  data: MeshData,
  x: number,
  y: number,
  z: number,
  height: number,
  width: number,
  leanX: number,
  leanZ: number,
  angle: number,
  palette: BladePalette,
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const bx = cos * width;
  const bz = sin * width;
  const base = linear(palette.base);
  const tip = linear(palette.tip);
  const mid = linear([
    (palette.base[0] + palette.tip[0]) * 0.5,
    (palette.base[1] + palette.tip[1]) * 0.5,
    (palette.base[2] + palette.tip[2]) * 0.5,
  ]);
  const p0: [number, number, number] = [x - bx, y, z - bz];
  const p1: [number, number, number] = [x + bx, y, z + bz];
  const p2: [number, number, number] = [
    x + leanX * 0.25 - bx * 0.35,
    y + height * 0.55,
    z + leanZ * 0.25 - bz * 0.35,
  ];
  const p3: [number, number, number] = [x + leanX, y + height, z + leanZ];
  const p4: [number, number, number] = [x + leanX * 0.85 + bx * 0.15, y + height * 0.96, z + leanZ * 0.85 + bz * 0.15];

  addTriangle(
    data,
    { p: p0, n: [0, 1, 0], uv: [0, 0], c: [base[0], base[1], base[2], 1] },
    { p: p1, n: [0, 1, 0], uv: [1, 0], c: [base[0], base[1], base[2], 1] },
    { p: p2, n: [0, 1, 0], uv: [0.5, 0.55], c: [mid[0], mid[1], mid[2], 1] },
  );
  addTriangle(
    data,
    { p: p2, n: [0, 1, 0], uv: [0, 0.55], c: [mid[0], mid[1], mid[2], 1] },
    { p: p1, n: [0, 1, 0], uv: [1, 0], c: [base[0], base[1], base[2], 1] },
    { p: p3, n: [0, 1, 0], uv: [0.4, 1], c: [tip[0], tip[1], tip[2], 1] },
  );
  addTriangle(
    data,
    { p: p2, n: [0, 1, 0], uv: [0.6, 0.55], c: [mid[0], mid[1], mid[2], 1] },
    { p: p3, n: [0, 1, 0], uv: [0.6, 1], c: [tip[0], tip[1], tip[2], 1] },
    { p: p4, n: [0, 1, 0], uv: [1, 0.9], c: [tip[0], tip[1], tip[2], 1] },
  );
}

/** Ground cover and bioluminescent flora, merged into one draw call each. */
export class Vegetation {
  readonly root: Entity;
  private readonly meshes: Mesh[] = [];
  private readonly materials: StandardMaterial[] = [];

  constructor(app: AppBase, profile: QualityProfile) {
    this.root = new Entity('vegetation');
    app.root.addChild(this.root);

    const grassMesh = this.buildGrass(app, profile);
    const grassMat = new StandardMaterial();
    grassMat.name = 'ground-cover';
    grassMat.diffuse = new Color(1, 1, 1, 1);
    grassMat.useMetalness = true;
    grassMat.metalness = 0;
    grassMat.gloss = 0.22;
    grassMat.cull = CULLFACE_NONE;
    grassMat.useFog = true;
    grassMat.update();

    const grassEntity = new Entity('ground-cover');
    grassEntity.addComponent('render');
    grassEntity.render!.meshInstances = [new MeshInstance(grassMesh, grassMat)];
    grassEntity.render!.castShadows = false;
    grassEntity.render!.receiveShadows = false;
    this.root.addChild(grassEntity);
    this.meshes.push(grassMesh);
    this.materials.push(grassMat);

    const floraMesh = this.buildFlora(app, profile);
    const floraMat = new StandardMaterial();
    floraMat.name = 'bioluminescent-flora';
    floraMat.diffuse = new Color(0.15, 0.5, 0.42, 1);
    floraMat.emissive = new Color(0.35, 1, 0.86);
    floraMat.emissiveIntensity = 1.35;
    floraMat.useMetalness = true;
    floraMat.metalness = 0.1;
    floraMat.gloss = 0.6;
    floraMat.cull = CULLFACE_NONE;
    floraMat.useFog = true;
    floraMat.update();

    const floraEntity = new Entity('glow-flora');
    floraEntity.addComponent('render');
    floraEntity.render!.meshInstances = [new MeshInstance(floraMesh, floraMat)];
    floraEntity.render!.castShadows = false;
    this.root.addChild(floraEntity);
    this.meshes.push(floraMesh);
    this.materials.push(floraMat);

    this.floraMaterial = floraMat;
  }

  private floraMaterial!: StandardMaterial;

  private buildGrass(app: AppBase, profile: QualityProfile): Mesh {
    const rng = createRandom(90210);
    const data = createMeshData();
    const count = Math.round(980 * profile.scatterDensity);
    const radius = 300;
    let placed = 0;
    let attempts = 0;

    while (placed < count && attempts < count * 12) {
      attempts++;
      const angle = rng() * Math.PI * 2;
      const distance = Math.sqrt(rng()) * radius;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      if (!isScatterAllowed(x, z, WORLD.waterLevel + 0.35)) continue;

      // Denser in the low, wet meadows; sparse on the dry ridge.
      const h = heightAt(x, z);
      const meadow = clamp(1 - Math.abs(h - 3) / 26, 0.15, 1);
      if (rng() > meadow * 0.9 + 0.1) continue;

      const tufts = 2 + Math.floor(rng() * 3);
      for (let t = 0; t < tufts; t++) {
        const ox = randomRange(rng, -0.6, 0.6);
        const oz = randomRange(rng, -0.6, 0.6);
        const gy = heightAt(x + ox, z + oz);
        const palette = GRASS_PALETTES[Math.floor(rng() * GRASS_PALETTES.length)];
        const blades = 3 + Math.floor(rng() * 3);
        for (let b = 0; b < blades; b++) {
          addBlade(
            data,
            x + ox + randomRange(rng, -0.18, 0.18),
            gy - 0.04,
            z + oz + randomRange(rng, -0.18, 0.18),
            randomRange(rng, 0.32, 0.95),
            randomRange(rng, 0.025, 0.055),
            randomRange(rng, -0.34, 0.34),
            randomRange(rng, -0.34, 0.34),
            rng() * Math.PI,
            palette,
          );
        }
      }
      placed++;
    }
    computeNormals(data);
    return buildMesh(app.graphicsDevice, data, 'ground-cover-mesh');
  }

  private buildFlora(app: AppBase, profile: QualityProfile): Mesh {
    const rng = createRandom(5150);
    const data = createMeshData();
    const count = Math.round(170 * profile.scatterDensity);
    const grove = { x: 182, z: -96 };
    let placed = 0;
    let attempts = 0;

    while (placed < count && attempts < count * 14) {
      attempts++;
      let x: number;
      let z: number;
      if (rng() < 0.68) {
        // Cluster around the Whispering Grove.
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * 62;
        x = grove.x + Math.cos(a) * d;
        z = grove.z + Math.sin(a) * d;
      } else {
        const a = rng() * Math.PI * 2;
        const d = WORLD.lakeRadius * (0.85 + rng() * 0.35);
        x = WORLD.lakeCenter.x + Math.cos(a) * d;
        z = WORLD.lakeCenter.z + Math.sin(a) * d;
        if (rng() < 0.5) {
          x = randomRange(rng, -240, 240);
          z = randomRange(rng, -240, 240);
        }
      }
      const y = heightAt(x, z);
      if (y < WORLD.waterLevel + 0.2 || y > 34) continue;
      if (distance2D(x, z, WORLD.plazaCenter.x, WORLD.plazaCenter.z) < 20) continue;

      const height = randomRange(rng, 0.5, 1.6);
      const width = randomRange(rng, 0.06, 0.16);
      const stem = linear([0.1, 0.4, 0.34]);
      addTriangle(
        data,
        { p: [x - width, y, z], n: [0, 1, 0], uv: [0, 0], c: [stem[0], stem[1], stem[2], 1] },
        { p: [x + width, y, z], n: [0, 1, 0], uv: [1, 0], c: [stem[0], stem[1], stem[2], 1] },
        { p: [x, y + height, z + width * 0.4], n: [0, 1, 0], uv: [0.5, 1], c: [0.5, 1, 0.85, 1] },
      );
      const bulbSize = randomRange(rng, 0.05, 0.12);
      addTriangle(
        data,
        { p: [x - bulbSize, y + height, z], n: [0, 1, 0], uv: [0, 0], c: [0.65, 1, 0.9, 1] },
        { p: [x + bulbSize, y + height, z], n: [0, 1, 0], uv: [1, 0], c: [0.65, 1, 0.9, 1] },
        { p: [x, y + height + bulbSize * 2.2, z], n: [0, 1, 0], uv: [0.5, 1], c: [0.8, 1, 0.95, 1] },
      );
      placed++;
    }
    computeNormals(data);
    return buildMesh(app.graphicsDevice, data, 'glow-flora-mesh');
  }

  update(time: number): void {
    if (this.floraMaterial) {
      this.floraMaterial.emissiveIntensity = 1.25 + Math.sin(time * 1.3) * 0.16;
    }
  }

  destroy(): void {
    for (const mesh of this.meshes) mesh.destroy();
    for (const material of this.materials) material.destroy();
    this.root.destroy();
  }
}
