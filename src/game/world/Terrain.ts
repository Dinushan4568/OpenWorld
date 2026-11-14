import {
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
import { clamp, lerp, smoothstep, srgbToLinear } from '../util/math';
import { terrainNoise, detailNoise } from '../util/noise';
import { buildMesh, createMeshData, type MeshData } from '../util/meshBuilder';
import { biomeWeights, farHeight, heightAt, regionTintAt, trailInfluence } from './heightfield';

interface TerrainPalette {
  grass: [number, number, number];
  grassDry: [number, number, number];
  moss: [number, number, number];
  sand: [number, number, number];
  rock: [number, number, number];
  highland: [number, number, number];
  dirt: [number, number, number];
  silt: [number, number, number];
}

const PALETTE: TerrainPalette = {
  grass: [0.2, 0.29, 0.2],
  grassDry: [0.42, 0.43, 0.26],
  moss: [0.18, 0.35, 0.29],
  sand: [0.56, 0.52, 0.42],
  rock: [0.36, 0.35, 0.33],
  highland: [0.46, 0.44, 0.4],
  dirt: [0.4, 0.32, 0.25],
  silt: [0.14, 0.19, 0.18],
};

/** Tiles per axis in the walkable terrain. 3x3 keeps each mesh ~300 m. */
const TILE_GRID = 3;
/** Quads per tile edge. Detail matches the old 288-wide single mesh. */
const TILE_RESOLUTION = 96;

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function terrainColor(
  x: number,
  z: number,
  height: number,
  normalY: number,
): [number, number, number, number] {
  const weights = biomeWeights(x, z);
  const moisture = clamp(terrainNoise.fbm(x * 0.021 + 17, z * 0.021 - 9, 3) * 0.5 + 0.5, 0, 1);
  const patch = clamp(detailNoise.fbm(x * 0.06, z * 0.06, 3) * 0.5 + 0.5, 0, 1);

  let color = mix(PALETTE.grass, PALETTE.moss, moisture * 0.75);
  color = mix(color, PALETTE.grassDry, patch * 0.55);
  color = mix(color, PALETTE.rock, weights.rock * 0.85);
  color = mix(color, PALETTE.highland, weights.highland * 0.7);
  color = mix(color, PALETTE.sand, weights.sand * 0.9);

  // Trails: packed earth with darker edges.
  const trail = trailInfluence(x, z);
  if (trail > 0.02) color = mix(color, PALETTE.dirt, clamp(trail * 0.8, 0, 0.85));

  // Steep faces read as exposed rock regardless of biome.
  const steep = clamp((0.9 - normalY) * 3.4, 0, 1);
  color = mix(color, PALETTE.rock, steep * 0.72);

  // Lake bed and river bed silt.
  const submerged = clamp(1 - smoothstep(WORLD.waterLevel - 0.4, WORLD.waterLevel + 1.2, height), 0, 1);
  color = mix(color, PALETTE.silt, submerged * 0.85);

  // Region identity: the city floor is concrete-pale, the facility grounds are
  // ash-grey, the forest floor is greener and the river corridor is damp.
  const tint = regionTintAt(x, z, 1);
  color = [color[0] * tint[0], color[1] * tint[1], color[2] * tint[2]];

  // Subtle large-scale tonal variation keeps the valley from reading as flat colour.
  const tone = 0.9 + terrainNoise.fbm(x * 0.008, z * 0.008, 3) * 0.18;
  return [
    srgbToLinear(clamp(color[0] * tone, 0, 1)),
    srgbToLinear(clamp(color[1] * tone, 0, 1)),
    srgbToLinear(clamp(color[2] * tone, 0, 1)),
    1,
  ];
}

/**
 * Ground surface, split into a 3x3 grid of independently frustum-culled tiles
 * so the 900 m basin draws in the pieces the camera can actually see, plus a
 * cheap far-heightfield skirt that closes the horizon.
 */
export class Terrain {
  readonly root: Entity;
  private readonly meshes: Mesh[] = [];
  private readonly material: StandardMaterial;
  private readonly farMaterial: StandardMaterial;
  readonly bounds = WORLD.terrainSize * 0.5;

  constructor(app: AppBase, detailTexture: Texture, normalTexture?: Texture) {
    const device = app.graphicsDevice;
    this.root = new Entity('terrain');

    this.material = new StandardMaterial();
    this.material.name = 'terrain-material';
    this.material.diffuse = new Color(1, 1, 1, 1);
    this.material.diffuseMap = detailTexture;
    this.material.diffuseMapTiling = new Vec2(96, 96);
    if (normalTexture) {
      this.material.normalMap = normalTexture;
      this.material.normalMapTiling = new Vec2(96, 96);
      this.material.bumpiness = 0.38;
    }
    this.material.useMetalness = true;
    this.material.metalness = 0.02;
    this.material.gloss = 0.18;
    this.material.useFog = true;
    this.material.update();

    const tileSize = WORLD.terrainSize / TILE_GRID;
    const half = WORLD.terrainSize / 2;
    for (let tz = 0; tz < TILE_GRID; tz++) {
      for (let tx = 0; tx < TILE_GRID; tx++) {
        const minX = -half + tx * tileSize;
        const minZ = -half + tz * tileSize;
        const mesh = buildMesh(device, this.buildTile(minX, minZ, tileSize), `terrain-tile-${tx}-${tz}`);
        this.meshes.push(mesh);
        const entity = new Entity(`terrain-tile-${tx}-${tz}`);
        entity.addComponent('render');
        entity.render!.meshInstances = [new MeshInstance(mesh, this.material)];
        entity.render!.castShadows = false;
        entity.render!.receiveShadows = true;
        this.root.addChild(entity);
      }
    }

    // Distant mountain ring: cheap silhouette that closes the horizon.
    this.farMaterial = new StandardMaterial();
    this.farMaterial.name = 'terrain-far-material';
    this.farMaterial.diffuse = new Color(1, 1, 1, 1);
    this.farMaterial.useMetalness = true;
    this.farMaterial.metalness = 0;
    this.farMaterial.gloss = 0.08;
    this.farMaterial.useFog = true;
    this.farMaterial.update();

    const farMesh = buildMesh(device, this.buildFarTerrain(), 'terrain-far');
    this.meshes.push(farMesh);
    const farEntity = new Entity('terrain-far');
    farEntity.addComponent('render');
    farEntity.render!.meshInstances = [new MeshInstance(farMesh, this.farMaterial)];
    farEntity.render!.castShadows = false;
    farEntity.render!.receiveShadows = false;
    this.root.addChild(farEntity);

    app.root.addChild(this.root);
  }

  private buildTile(minX: number, minZ: number, tileSize: number): MeshData {
    const resolution = TILE_RESOLUTION;
    const step = tileSize / resolution;
    const size = WORLD.terrainSize;
    const cols = resolution + 1;
    const data = createMeshData();
    const heights = new Float32Array(cols * cols);

    for (let iz = 0; iz <= resolution; iz++) {
      for (let ix = 0; ix <= resolution; ix++) {
        const x = minX + ix * step;
        const z = minZ + iz * step;
        const h = heightAt(x, z);
        heights[iz * cols + ix] = h;
        data.positions.push(x, h, z);
        // World-space UVs keep the detail texture continuous across tile seams.
        data.uvs.push(x / size, z / size);
        data.normals.push(0, 1, 0);
        data.colors.push(1, 1, 1, 1);
      }
    }

    for (let iz = 0; iz <= resolution; iz++) {
      for (let ix = 0; ix <= resolution; ix++) {
        const i = iz * cols + ix;
        const hL = heights[iz * cols + Math.max(0, ix - 1)];
        const hR = heights[iz * cols + Math.min(resolution, ix + 1)];
        const hD = heights[Math.max(0, iz - 1) * cols + ix];
        const hU = heights[Math.min(resolution, iz + 1) * cols + ix];
        const nx = hL - hR;
        const ny = 2 * step;
        const nz = hD - hU;
        const len = Math.hypot(nx, ny, nz) || 1;
        data.normals[i * 3] = nx / len;
        data.normals[i * 3 + 1] = ny / len;
        data.normals[i * 3 + 2] = nz / len;

        const x = minX + ix * step;
        const z = minZ + iz * step;
        const color = terrainColor(x, z, heights[i], ny / len);
        data.colors[i * 4] = color[0];
        data.colors[i * 4 + 1] = color[1];
        data.colors[i * 4 + 2] = color[2];
        data.colors[i * 4 + 3] = 1;
      }
    }

    for (let iz = 0; iz < resolution; iz++) {
      for (let ix = 0; ix < resolution; ix++) {
        const a = iz * cols + ix;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        // Counter-clockwise when viewed from above (+Y).
        data.indices.push(a, c, b, b, c, d);
      }
    }

    return data;
  }

  private buildFarTerrain(): MeshData {
    const size = WORLD.farTerrainSize;
    const resolution = WORLD.farTerrainResolution;
    const step = size / resolution;
    const half = size / 2;
    const cols = resolution + 1;
    const data = createMeshData();
    const heights = new Float32Array(cols * cols);

    for (let iz = 0; iz <= resolution; iz++) {
      for (let ix = 0; ix <= resolution; ix++) {
        const x = -half + ix * step;
        const z = -half + iz * step;
        const h = farHeight(x, z);
        heights[iz * cols + ix] = h;
        data.positions.push(x, h, z);
        data.uvs.push(x / size, z / size);
        data.normals.push(0, 1, 0);
        data.colors.push(1, 1, 1, 1);
      }
    }
    for (let iz = 0; iz <= resolution; iz++) {
      for (let ix = 0; ix <= resolution; ix++) {
        const i = iz * cols + ix;
        const hL = heights[iz * cols + Math.max(0, ix - 1)];
        const hR = heights[iz * cols + Math.min(resolution, ix + 1)];
        const hD = heights[Math.max(0, iz - 1) * cols + ix];
        const hU = heights[Math.min(resolution, iz + 1) * cols + ix];
        const nx = hL - hR;
        const ny = 2 * step;
        const nz = hD - hU;
        const len = Math.hypot(nx, ny, nz) || 1;
        data.normals[i * 3] = nx / len;
        data.normals[i * 3 + 1] = ny / len;
        data.normals[i * 3 + 2] = nz / len;
        // Fade the ring into atmospheric haze with vertex colour.
        const r = Math.hypot(-half + ix * step, -half + iz * step);
        const haze = clamp((r - 420) / 620, 0, 0.72);
        const shade = 0.55 + (heights[i] / 320) * 0.25;
        data.colors[i * 4] = lerp(shade, 0.5, haze);
        data.colors[i * 4 + 1] = lerp(shade + 0.03, 0.58, haze);
        data.colors[i * 4 + 2] = lerp(shade + 0.02, 0.62, haze);
        data.colors[i * 4 + 3] = 1;
      }
    }
    for (let iz = 0; iz < resolution; iz++) {
      for (let ix = 0; ix < resolution; ix++) {
        const a = iz * cols + ix;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        data.indices.push(a, c, b, b, c, d);
      }
    }
    return data;
  }

  destroy(): void {
    for (const mesh of this.meshes) mesh.destroy();
    this.material.destroy();
    this.farMaterial.destroy();
    this.root.destroy();
  }
}
