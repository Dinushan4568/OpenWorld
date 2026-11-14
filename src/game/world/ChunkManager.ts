import {
  CULLFACE_NONE,
  Color,
  Entity,
  Mesh,
  MeshInstance,
  StandardMaterial,
  type AppBase,
} from 'playcanvas';
import type { ModelName, QualityProfile } from '../config';
import type { AssetManager } from '../core/AssetManager';
import { WORLD } from '../config';
import { clamp, createRandom, distance2D, randomRange } from '../util/math';
import { addTriangle, buildMesh, computeNormals, createMeshData, type MeshData } from '../util/meshBuilder';
import type { CollisionWorld, SolidCollider } from './collision';
import { heightAt, isScatterAllowed, normalAt, regionAtPoint, riverDistance } from './heightfield';
import type { RegionId } from './regions';
import { PROP_SOLIDS } from './solids';
import {
  CHUNK_SIZE,
  DEFAULT_STREAMING,
  chunkKey,
  chunkSeed,
  planStreaming,
  type ChunkDecision,
  type ChunkLod,
  type StreamingConfig,
} from './streaming';

interface ChunkRecord {
  key: string;
  ix: number;
  iz: number;
  lod: ChunkLod;
  root: Entity;
  meshes: Mesh[];
  colliders: number;
}

export interface ChunkStats {
  loaded: number;
  near: number;
  mid: number;
  entities: number;
  colliders: number;
  loads: number;
  units: number;
}

interface Placement {
  model: ModelName;
  x: number;
  z: number;
  scale: number;
  rotation: number;
  tilt?: number;
  shadows?: boolean;
  sink?: number;
  /** Box colliders swap their extents when rotated a quarter turn. */
  quarterTurn?: boolean;
}

const HERO_SITES: ReadonlyArray<{ x: number; z: number; radius: number }> = [
  { x: WORLD.spawn.x, z: WORLD.spawn.z, radius: 12 },
  { x: WORLD.plazaCenter.x, z: WORLD.plazaCenter.z, radius: 28 },
  { x: WORLD.gateCenter.x, z: WORLD.gateCenter.z, radius: 34 },
  { x: 6, z: 30, radius: 18 }, // river bridge
  { x: -198, z: -25, radius: 34 }, // city square
  { x: -100, z: 190, radius: 36 }, // facility reactor deck
  { x: 190, z: -104, radius: 18 }, // mother tree
  { x: 46, z: -34, radius: 20 },
];

function nearHeroSite(x: number, z: number): boolean {
  return HERO_SITES.some((site) => distance2D(x, z, site.x, site.z) < site.radius);
}

/**
 * Streaming, level-of-detail world content.
 *
 * The valley is divided into 64 m chunks. Chunks close to the player are
 * populated with full modular GLB props, merged ground cover and colliders;
 * chunks further out get one merged silhouette mesh. Nothing outside the
 * streaming radius is resident, so the whole map is never loaded at once.
 */
export class ChunkManager {
  readonly root: Entity;
  readonly stats: ChunkStats = { loaded: 0, near: 0, mid: 0, entities: 0, colliders: 0, loads: 0, units: 0 };
  readonly config: StreamingConfig;

  private readonly app: AppBase;
  private readonly assets: AssetManager;
  private readonly profile: QualityProfile;
  private readonly collision: CollisionWorld | null;
  private readonly chunks = new Map<string, ChunkRecord>();
  private readonly grassMaterial: StandardMaterial;
  private readonly flowerMaterial: StandardMaterial;
  private readonly silhouetteMaterial: StandardMaterial;
  private readonly buffer = { x: Number.NaN, z: Number.NaN };

  constructor(
    app: AppBase,
    assets: AssetManager,
    profile: QualityProfile,
    collision?: CollisionWorld,
    config: StreamingConfig = DEFAULT_STREAMING,
  ) {
    this.app = app;
    this.assets = assets;
    this.profile = profile;
    this.collision = collision ?? null;
    this.config = { ...config };
    this.root = new Entity('world-chunks');
    app.root.addChild(this.root);

    this.grassMaterial = new StandardMaterial();
    this.grassMaterial.name = 'chunk-ground-cover';
    this.grassMaterial.diffuse = new Color(1, 1, 1, 1);
    this.grassMaterial.useMetalness = true;
    this.grassMaterial.metalness = 0;
    this.grassMaterial.gloss = 0.22;
    this.grassMaterial.cull = CULLFACE_NONE;
    this.grassMaterial.useFog = true;
    this.grassMaterial.update();

    this.flowerMaterial = new StandardMaterial();
    this.flowerMaterial.name = 'chunk-wildflowers';
    this.flowerMaterial.diffuse = new Color(0.35, 0.55, 0.45, 1);
    this.flowerMaterial.emissive = new Color(0.35, 1, 0.82);
    this.flowerMaterial.emissiveIntensity = 0.45;
    this.flowerMaterial.useMetalness = true;
    this.flowerMaterial.metalness = 0.05;
    this.flowerMaterial.gloss = 0.5;
    this.flowerMaterial.cull = CULLFACE_NONE;
    this.flowerMaterial.useFog = true;
    this.flowerMaterial.update();

    this.silhouetteMaterial = new StandardMaterial();
    this.silhouetteMaterial.name = 'chunk-silhouette';
    this.silhouetteMaterial.diffuse = new Color(1, 1, 1, 1);
    this.silhouetteMaterial.useMetalness = true;
    this.silhouetteMaterial.metalness = 0.02;
    this.silhouetteMaterial.gloss = 0.12;
    this.silhouetteMaterial.useFog = true;
    this.silhouetteMaterial.update();
  }

  /** Load the immediate ring around a spawn point before play begins. */
  async preload(x: number, z: number, yieldFrame: () => Promise<void>): Promise<void> {
    const centreX = Math.floor(x / CHUNK_SIZE);
    const centreZ = Math.floor(z / CHUNK_SIZE);
    for (let ring = 0; ring <= 1; ring++) {
      for (let ix = centreX - ring; ix <= centreX + ring; ix++) {
        for (let iz = centreZ - ring; iz <= centreZ + ring; iz++) {
          if (ring > 0 && Math.abs(ix - centreX) !== ring && Math.abs(iz - centreZ) !== ring) continue;
          if (this.chunks.has(chunkKey(ix, iz))) continue;
          const cx = ix * CHUNK_SIZE + CHUNK_SIZE / 2;
          const cz = iz * CHUNK_SIZE + CHUNK_SIZE / 2;
          const distance = Math.hypot(cx - x, cz - z);
          const lod: ChunkLod = distance <= this.config.nearRadius ? 'near' : 'mid';
          this.createChunk({ ix, iz, key: chunkKey(ix, iz), centerX: cx, centerZ: cz, distance, lod });
          await yieldFrame();
        }
      }
    }
    // Mid ring around the immediate area so the horizon is not empty at boot.
    for (let ix = centreX - 4; ix <= centreX + 4; ix++) {
      for (let iz = centreZ - 4; iz <= centreZ + 4; iz++) {
        if (Math.abs(ix - centreX) < 2 && Math.abs(iz - centreZ) < 2) continue;
        if (this.chunks.has(chunkKey(ix, iz))) continue;
        const cx = ix * CHUNK_SIZE + CHUNK_SIZE / 2;
        const cz = iz * CHUNK_SIZE + CHUNK_SIZE / 2;
        const distance = Math.hypot(cx - x, cz - z);
        if (distance > this.config.midRadius) continue;
        this.createChunk({ ix, iz, key: chunkKey(ix, iz), centerX: cx, centerZ: cz, distance, lod: 'mid' });
      }
      await yieldFrame();
    }
    this.refreshStats();
    this.buffer.x = x;
    this.buffer.z = z;
  }

  update(x: number, z: number): void {
    if (Number.isFinite(this.buffer.x) && distance2D(x, z, this.buffer.x, this.buffer.z) < 3) {
      this.refreshStats();
      return;
    }
    this.buffer.x = x;
    this.buffer.z = z;

    const resident = new Map<string, ChunkLod>();
    for (const [key, record] of this.chunks) resident.set(key, record.lod);
    const plan = planStreaming(x, z, resident, this.config);

    for (const coord of plan.unload) {
      this.destroyChunk(coord.key);
    }
    for (const decision of plan.upgrade) {
      if (this.chunks.has(decision.key)) {
        this.destroyChunk(decision.key);
        this.createChunk(decision);
      }
    }
    for (const decision of plan.load) {
      if (this.chunks.size > 170) break;
      if (!this.chunks.has(decision.key)) this.createChunk(decision);
    }
    this.refreshStats();
  }

  /** Night-time glow for wildflowers. */
  setNight(factor: number): void {
    this.flowerMaterial.emissiveIntensity = 0.35 + clamp(factor, 0, 1) * 1.8;
    this.flowerMaterial.update();
  }

  private createChunk(decision: ChunkDecision): void {
    const root = new Entity(`chunk:${decision.key}`);
    this.root.addChild(root);
    const record: ChunkRecord = {
      key: decision.key,
      ix: decision.ix,
      iz: decision.iz,
      lod: decision.lod,
      root,
      meshes: [],
      colliders: 0,
    };
    const rng = createRandom(chunkSeed(decision.ix, decision.iz, decision.lod === 'near' ? 11 : 13));
    const colliders: Omit<SolidCollider, 'group'>[] = [];

    if (decision.lod === 'near') {
      this.populateNear(record, decision, rng, colliders);
    } else {
      this.populateMid(record, decision, rng);
    }

    if (colliders.length && this.collision) {
      this.collision.addGroup(colliders, decision.key);
      record.colliders = colliders.length;
    }
    this.chunks.set(decision.key, record);
  }

  private destroyChunk(key: string): void {
    const record = this.chunks.get(key);
    if (!record) return;
    for (const mesh of record.meshes) mesh.destroy();
    record.root.destroy();
    this.collision?.removeGroup(key);
    this.chunks.delete(key);
  }

  private refreshStats(): void {
    const stats = this.stats;
    stats.loaded = this.chunks.size;
    stats.near = 0;
    stats.mid = 0;
    stats.entities = 0;
    stats.colliders = 0;
    stats.loads = 0;
    let units = 0;
    for (const record of this.chunks.values()) {
      if (record.lod === 'near') stats.near++;
      else stats.mid++;
      stats.colliders += record.colliders;
      units += record.root.children.length;
    }
    stats.entities = units;
    stats.loads = stats.near + stats.mid;
    stats.units = units;
  }

  /* ---------------------------------------------------------------------- */
  /* Full-detail chunk                                                      */
  /* ---------------------------------------------------------------------- */

  private populateNear(
    record: ChunkRecord,
    decision: ChunkDecision,
    rng: () => number,
    colliders: Omit<SolidCollider, 'group'>[],
  ): void {
    const minX = decision.ix * CHUNK_SIZE;
    const minZ = decision.iz * CHUNK_SIZE;
    const centreX = decision.centerX;
    const centreZ = decision.centerZ;
    const region = regionAtPoint(centreX, centreZ);

    const place = (placement: Placement): void => {
      const y = heightAt(placement.x, placement.z);
      let entity = this.assets.instantiate(placement.model, {
        castShadows: placement.shadows ?? true,
        receiveShadows: true,
      });
      if (!entity) entity = this.assets.createFallback(placement.model);
      const sink = placement.sink ?? 0.2;
      const scale = placement.scale;
      entity.setPosition(placement.x, y - scale * sink, placement.z);
      entity.setEulerAngles((placement.tilt ?? 0) * (180 / Math.PI), placement.rotation, 0);
      entity.setLocalScale(scale, scale, scale);
      entity.name = `${placement.model}:${record.key}`;
      record.root.addChild(entity);
      this.registerSolid(placement, y - scale * sink, colliders);
    };

    // Ground cover and wildflowers are merged per chunk into one draw call each.
    this.buildGroundCover(record, decision, rng, region);

    if (region === 'city') {
      this.buildCityGrid(decision, rng, place);
      this.scatterPatch(decision, rng, place, { model: 'rock_cluster', count: 10, scale: [0.18, 0.5], shadows: false });
      this.scatterPatch(decision, rng, place, { model: 'fern', count: 8, scale: [0.7, 1.4], shadows: false });
    } else if (region === 'facility') {
      this.buildFacilityGrid(decision, rng, place);
      this.scatterPatch(decision, rng, place, { model: 'crystal_cluster', count: 5, scale: [0.5, 1.1], shadows: true });
    } else if (region === 'forest') {
      this.scatterPatch(decision, rng, place, { model: 'spire_tree', count: 24, scale: [0.85, 1.5], maxSlope: 0.34 });
      this.scatterPatch(decision, rng, place, { model: 'fern', count: 22, scale: [0.8, 1.6], shadows: false, maxSlope: 0.4 });
      this.scatterPatch(decision, rng, place, { model: 'rock_cluster', count: 7, scale: [0.4, 1.2], maxSlope: 0.5 });
      this.scatterPatch(decision, rng, place, { model: 'spire_tree', count: 5, scale: [0.5, 0.8], maxSlope: 0.4 });
    } else if (region === 'river') {
      this.scatterPatch(decision, rng, place, { model: 'reeds', count: 16, scale: [0.8, 1.5], shadows: false, riverBand: [6, 30] });
      this.scatterPatch(decision, rng, place, { model: 'crystal_cluster', count: 6, scale: [0.4, 1.0], shadows: true, riverBand: [8, 34] });
      this.scatterPatch(decision, rng, place, { model: 'rock_cluster', count: 9, scale: [0.35, 1.0], riverBand: [4, 40] });
      this.scatterPatch(decision, rng, place, { model: 'spire_tree', count: 4, scale: [0.7, 1.2], maxSlope: 0.3 });
    } else {
      this.scatterPatch(decision, rng, place, { model: 'spire_tree', count: 8, scale: [0.75, 1.35], maxSlope: 0.32 });
      this.scatterPatch(decision, rng, place, { model: 'rock_cluster', count: 11, scale: [0.35, 1.1], maxSlope: 0.5 });
      this.scatterPatch(decision, rng, place, { model: 'fern', count: 7, scale: [0.7, 1.3], shadows: false });
      this.scatterPatch(decision, rng, place, { model: 'temple_pillar', count: 1, scale: [0.6, 1.1], maxSlope: 0.4, nearPlaza: true });
    }

    // A rare monolith on high ground outside the built regions.
    if (region === 'valley' && rng() > 0.86) {
      const x = randomRange(rng, minX + 8, minX + CHUNK_SIZE - 8);
      const z = randomRange(rng, minZ + 8, minZ + CHUNK_SIZE - 8);
      const y = heightAt(x, z);
      if (y > 18 && normalAt(x, z)[1] > 0.7) {
        place({ model: 'monolith_spire', x, z, scale: randomRange(rng, 0.6, 1.3), rotation: rng() * 360, tilt: 0.05 });
      }
    }
    void centreZ;
  }

  private buildCityGrid(
    decision: ChunkDecision,
    rng: () => number,
    place: (placement: Placement) => void,
  ): void {
    const grid = 26;
    const margin = 12;
    const minX = decision.ix * CHUNK_SIZE - margin;
    const minZ = decision.iz * CHUNK_SIZE - margin;
    const maxX = (decision.ix + 1) * CHUNK_SIZE + margin;
    const maxZ = (decision.iz + 1) * CHUNK_SIZE + margin;
    const startGX = Math.floor(minX / grid);
    const endGX = Math.ceil(maxX / grid);
    const startGZ = Math.floor(minZ / grid);
    const endGZ = Math.ceil(maxZ / grid);

    for (let gx = startGX; gx <= endGX; gx++) {
      for (let gz = startGZ; gz <= endGZ; gz++) {
        const x = gx * grid + grid * 0.5;
        const z = gz * grid + grid * 0.5;
        // A building belongs to the chunk that owns its centre.
        const ownerX = Math.floor(x / CHUNK_SIZE);
        const ownerZ = Math.floor(z / CHUNK_SIZE);
        if (ownerX !== decision.ix || ownerZ !== decision.iz) continue;
        if (regionAtPoint(x, z) !== 'city') continue;
        if (nearHeroSite(x, z)) continue;
        // Every third avenue stays clear.
        if (((gx % 3) + 3) % 3 === 0 || ((gz % 3) + 3) % 3 === 0) continue;
        if (heightAt(x, z) < WORLD.waterLevel + 0.8) continue;
        const hash = chunkSeed(gx, gz, 71) / 4294967296;
        if (hash > 0.72) continue;
        const roll = rng();
        const model: ModelName = roll < 0.12 ? 'city_tower' : roll < 0.92 ? 'city_block' : 'city_arch';
        const quarter = ((Math.floor(hash * 4) % 4) + 4) % 4;
        const rotation = quarter * 90;
        const scale = randomRange(rng, model === 'city_tower' ? 0.8 : 0.86, model === 'city_tower' ? 1.0 : 1.18);
        place({ model, x, z, scale, rotation, tilt: 0.02, sink: 0.1, quarterTurn: quarter % 2 === 1 });
        // Rubble / undergrowth in the lots.
        if (rng() > 0.55) {
          place({
            model: rng() > 0.5 ? 'rock_cluster' : 'fern',
            x: x + randomRange(rng, -6, 6),
            z: z + randomRange(rng, -6, 6),
            scale: randomRange(rng, 0.5, 1.2),
            rotation: rng() * 360,
            shadows: false,
          });
        }
      }
    }
    // Reclaimed foliage on the avenues.
    this.scatterPatch(decision, rng, place, {
      model: 'fern',
      count: 10,
      scale: [0.6, 1.3],
      shadows: false,
      cityOnly: true,
    });
  }

  private buildFacilityGrid(
    decision: ChunkDecision,
    rng: () => number,
    place: (placement: Placement) => void,
  ): void {
    const grid = 24;
    const margin = 12;
    const minX = decision.ix * CHUNK_SIZE - margin;
    const minZ = decision.iz * CHUNK_SIZE - margin;
    const maxX = (decision.ix + 1) * CHUNK_SIZE + margin;
    const maxZ = (decision.iz + 1) * CHUNK_SIZE + margin;
    for (let gx = Math.floor(minX / grid); gx <= Math.ceil(maxX / grid); gx++) {
      for (let gz = Math.floor(minZ / grid); gz <= Math.ceil(maxZ / grid); gz++) {
        const x = gx * grid + grid * 0.5;
        const z = gz * grid + grid * 0.5;
        if (Math.floor(x / CHUNK_SIZE) !== decision.ix || Math.floor(z / CHUNK_SIZE) !== decision.iz) continue;
        if (regionAtPoint(x, z) !== 'facility') continue;
        if (nearHeroSite(x, z)) continue;
        if (heightAt(x, z) < WORLD.waterLevel + 1) continue;
        const hash = chunkSeed(gx, gz, 131) / 4294967296;
        if (hash > 0.72) continue;
        const roll = rng();
        const model: ModelName = roll < 0.3 ? 'facility_pylon' : roll < 0.5 ? 'facility_dish' : 'facility_block';
        place({
          model,
          x,
          z,
          scale: randomRange(rng, model === 'facility_block' ? 0.8 : 0.85, model === 'facility_block' ? 1.05 : 1.2),
          rotation: ((Math.floor(hash * 4) % 4) + 4) % 4 * 90,
          tilt: 0.01,
          sink: 0.08,
          shadows: true,
        });
        if (rng() > 0.6) {
          place({
            model: 'crystal_cluster',
            x: x + randomRange(rng, -5, 5),
            z: z + randomRange(rng, -5, 5),
            scale: randomRange(rng, 0.4, 0.9),
            rotation: rng() * 360,
          });
        }
      }
    }
  }

  private scatterPatch(
    decision: ChunkDecision,
    rng: () => number,
    place: (placement: Placement) => void,
    options: {
      model: ModelName;
      count: number;
      scale: [number, number];
      shadows?: boolean;
      maxSlope?: number;
      riverBand?: [number, number];
      nearPlaza?: boolean;
      cityOnly?: boolean;
    },
  ): void {
    const count = Math.max(0, Math.round(options.count * this.profile.scatterDensity));
    const minX = decision.ix * CHUNK_SIZE;
    const minZ = decision.iz * CHUNK_SIZE;
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 12) {
      attempts++;
      const x = minX + rng() * CHUNK_SIZE;
      const z = minZ + rng() * CHUNK_SIZE;
      if (nearHeroSite(x, z)) continue;
      const y = heightAt(x, z);
      if (y < WORLD.waterLevel + 0.5) continue;
      if (options.maxSlope !== undefined && normalAt(x, z)[1] < options.maxSlope) continue;
      if (options.cityOnly && regionAtPoint(x, z) !== 'city') continue;
      if (options.riverBand) {
        const d = riverDistance(x, z);
        if (d < options.riverBand[0] || d > options.riverBand[1]) continue;
      } else if (options.model !== 'fern' && options.model !== 'crystal_cluster') {
        if (!isScatterAllowed(x, z)) continue;
      }
      if (options.nearPlaza) {
        if (distance2D(x, z, WORLD.plazaCenter.x, WORLD.plazaCenter.z) > 95) continue;
      }
      place({
        model: options.model,
        x,
        z,
        scale: randomRange(rng, options.scale[0], options.scale[1]),
        rotation: rng() * 360,
        tilt: randomRange(rng, 0, 0.12),
        shadows: options.shadows ?? true,
      });
      placed++;
    }
  }

  private registerSolid(placement: Placement, baseY: number, colliders: Omit<SolidCollider, 'group'>[]): void {
    const solid = PROP_SOLIDS[placement.model];
    if (!solid) return;
    const scale = placement.scale;
    const halfX = (solid.halfX ?? solid.radius) * scale;
    const halfZ = (solid.halfZ ?? solid.radius) * scale;
    const rotated = placement.quarterTurn === true;
    colliders.push({
      x: placement.x,
      z: placement.z,
      radius: Math.max(halfX, halfZ),
      base: baseY - 0.25,
      top: baseY + solid.height * scale,
      walkable: solid.walkable ?? false,
      kind: placement.model,
      shape: solid.shape,
      halfX: solid.shape === 'box' ? (rotated ? halfZ : halfX) : undefined,
      halfZ: solid.shape === 'box' ? (rotated ? halfX : halfZ) : undefined,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Distance silhouette                                                    */
  /* ---------------------------------------------------------------------- */

  private populateMid(record: ChunkRecord, decision: ChunkDecision, rng: () => number): void {
    const data = createMeshData();
    const region = regionAtPoint(decision.centerX, decision.centerZ);
    const minX = decision.ix * CHUNK_SIZE;
    const minZ = decision.iz * CHUNK_SIZE;
    const centreY = heightAt(decision.centerX, decision.centerZ);

    const addBox = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: [number, number, number]): void => {
      const corners: Array<[number, number, number]> = [
        [x - sx / 2, y, z - sz / 2],
        [x + sx / 2, y, z - sz / 2],
        [x + sx / 2, y + sy, z - sz / 2],
        [x - sx / 2, y + sy, z - sz / 2],
        [x - sx / 2, y, z + sz / 2],
        [x + sx / 2, y, z + sz / 2],
        [x + sx / 2, y + sy, z + sz / 2],
        [x - sx / 2, y + sy, z + sz / 2],
      ];
      const faces = [
        [0, 1, 2, 3],
        [5, 4, 7, 6],
        [4, 0, 3, 7],
        [1, 5, 6, 2],
        [3, 2, 6, 7],
        [4, 5, 1, 0],
      ];
      for (const f of faces) {
        const c: [number, number, number, number] = [color[0], color[1], color[2], 1];
        addTriangle(
          data,
          { p: corners[f[0]], c },
          { p: corners[f[1]], c },
          { p: corners[f[2]], c },
        );
        addTriangle(
          data,
          { p: corners[f[0]], c },
          { p: corners[f[2]], c },
          { p: corners[f[3]], c },
        );
      }
    };

    const addCone = (x: number, y: number, z: number, radius: number, height: number, color: [number, number, number]): void => {
      const sides = 5;
      const apex: [number, number, number] = [x, y + height, z];
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        const c: [number, number, number, number] = [color[0], color[1], color[2], 1];
        addTriangle(
          data,
          { p: [x + Math.cos(a0) * radius, y, z + Math.sin(a0) * radius], c },
          { p: [x + Math.cos(a1) * radius, y, z + Math.sin(a1) * radius], c },
          { p: apex, c },
        );
      }
    };

    if (region === 'city') {
      for (let i = 0; i < 7; i++) {
        const x = minX + rng() * CHUNK_SIZE;
        const z = minZ + rng() * CHUNK_SIZE;
        const y = heightAt(x, z);
        const height = randomRange(rng, 14, 44);
        addBox(x, y - 1, z, randomRange(rng, 8, 13), height, randomRange(rng, 7, 12), [0.32, 0.33, 0.34]);
      }
    } else if (region === 'facility') {
      for (let i = 0; i < 8; i++) {
        const x = minX + rng() * CHUNK_SIZE;
        const z = minZ + rng() * CHUNK_SIZE;
        const y = heightAt(x, z);
        if (rng() > 0.45) addBox(x, y - 0.5, z, randomRange(rng, 5, 12), randomRange(rng, 4, 9), randomRange(rng, 5, 10), [0.36, 0.42, 0.43]);
        else addCone(x, y, z, randomRange(rng, 0.8, 1.6), randomRange(rng, 8, 13), [0.3, 0.45, 0.44]);
      }
    } else {
      const trees = region === 'forest' ? 16 : region === 'river' ? 7 : 9;
      for (let i = 0; i < trees; i++) {
        const x = minX + rng() * CHUNK_SIZE;
        const z = minZ + rng() * CHUNK_SIZE;
        const y = heightAt(x, z);
        if (y < WORLD.waterLevel + 0.6) continue;
        const green: [number, number, number] = region === 'forest' ? [0.13, 0.26, 0.17] : [0.2, 0.3, 0.2];
        addCone(x, y - 0.6, z, randomRange(rng, 0.9, 1.8), randomRange(rng, 5, 11), green);
      }
      for (let i = 0; i < 4; i++) {
        const x = minX + rng() * CHUNK_SIZE;
        const z = minZ + rng() * CHUNK_SIZE;
        const y = heightAt(x, z);
        addCone(x, y - 0.8, z, randomRange(rng, 0.8, 2.2), randomRange(rng, 1.2, 3.2), [0.36, 0.36, 0.34]);
      }
    }

    computeNormals(data);
    if (!data.indices.length) {
      void centreY;
      return;
    }
    const mesh = buildMesh(this.app.graphicsDevice, data, `chunk-silhouette-${record.key}`);
    record.meshes.push(mesh);
    const entity = new Entity(`silhouette:${record.key}`);
    entity.addComponent('render');
    entity.render!.meshInstances = [new MeshInstance(mesh, this.silhouetteMaterial)];
    entity.render!.castShadows = false;
    entity.render!.receiveShadows = true;
    record.root.addChild(entity);
    void centreY;
  }

  /* ---------------------------------------------------------------------- */
  /* Ground cover                                                           */
  /* ---------------------------------------------------------------------- */

  private buildGroundCover(record: ChunkRecord, decision: ChunkDecision, rng: () => number, region: RegionId): void {
    const blades = region === 'city' ? 90 : region === 'forest' ? 700 : region === 'river' ? 460 : 540;
    const count = Math.round(blades * this.profile.scatterDensity);
    const data = createMeshData();
    const minX = decision.ix * CHUNK_SIZE;
    const minZ = decision.iz * CHUNK_SIZE;
    const palettes: Array<{ base: [number, number, number]; tip: [number, number, number] }> = [
      { base: [0.05, 0.11, 0.05], tip: [0.28, 0.38, 0.16] },
      { base: [0.05, 0.12, 0.08], tip: [0.22, 0.44, 0.26] },
      { base: [0.07, 0.12, 0.06], tip: [0.4, 0.38, 0.18] },
    ];

    for (let i = 0; i < count; i++) {
      const x = minX + rng() * CHUNK_SIZE;
      const z = minZ + rng() * CHUNK_SIZE;
      const y = heightAt(x, z);
      if (y < WORLD.waterLevel + 0.35) continue;
      if (normalAt(x, z)[1] < 0.62) continue;
      if (riverDistance(x, z) < 5) continue;
      const palette = palettes[Math.floor(rng() * palettes.length)];
      const tufts = 2;
      for (let t = 0; t < tufts; t++) {
        const ox = randomRange(rng, -0.5, 0.5);
        const oz = randomRange(rng, -0.5, 0.5);
        const gy = heightAt(x + ox, z + oz);
        for (let b = 0; b < 3; b++) {
          this.addBlade(
            data,
            x + ox + randomRange(rng, -0.2, 0.2),
            gy - 0.05,
            z + oz + randomRange(rng, -0.2, 0.2),
            randomRange(rng, 0.28, 0.8),
            palette,
            rng() * Math.PI,
            randomRange(rng, -0.25, 0.25),
          );
        }
      }
    }

    if (data.indices.length) {
      computeNormals(data);
      const mesh = buildMesh(this.app.graphicsDevice, data, `ground-cover-${record.key}`);
      record.meshes.push(mesh);
      const entity = new Entity(`ground-cover:${record.key}`);
      entity.addComponent('render');
      entity.render!.meshInstances = [new MeshInstance(mesh, this.grassMaterial)];
      entity.render!.castShadows = false;
      entity.render!.receiveShadows = false;
      record.root.addChild(entity);
    }

    // Wildflowers: a handful of glowing tips, denser in the forest.
    const flowers = Math.round((region === 'forest' ? 26 : region === 'river' ? 20 : 12) * this.profile.scatterDensity);
    const flowerData = createMeshData();
    for (let i = 0; i < flowers; i++) {
      const x = minX + rng() * CHUNK_SIZE;
      const z = minZ + rng() * CHUNK_SIZE;
      const y = heightAt(x, z);
      if (y < WORLD.waterLevel + 0.5) continue;
      if (normalAt(x, z)[1] < 0.68) continue;
      if (nearHeroSite(x, z)) continue;
      const size = randomRange(rng, 0.05, 0.11);
      const height = randomRange(rng, 0.25, 0.55);
      const tint: [number, number, number, number] =
        rng() > 0.5 ? [0.7, 1, 0.85, 1] : [1, 0.9, 0.6, 1];
      for (let petal = 0; petal < 2; petal++) {
        const a = (petal / 2) * Math.PI;
        addTriangle(
          flowerData,
          { p: [x - Math.cos(a) * size, y + height, z - Math.sin(a) * size], c: tint },
          { p: [x + Math.cos(a) * size, y + height, z + Math.sin(a) * size], c: tint },
          { p: [x, y + height + size * 1.4, z], c: tint },
        );
      }
    }
    if (flowerData.indices.length) {
      computeNormals(flowerData);
      const mesh = buildMesh(this.app.graphicsDevice, flowerData, `flowers-${record.key}`);
      record.meshes.push(mesh);
      const entity = new Entity(`flowers:${record.key}`);
      entity.addComponent('render');
      entity.render!.meshInstances = [new MeshInstance(mesh, this.flowerMaterial)];
      entity.render!.castShadows = false;
      record.root.addChild(entity);
    }
  }

  private addBlade(
    data: MeshData,
    x: number,
    y: number,
    z: number,
    height: number,
    palette: { base: [number, number, number]; tip: [number, number, number] },
    angle: number,
    lean: number,
  ): void {
    const width = 0.035;
    const bx = Math.cos(angle) * width;
    const bz = Math.sin(angle) * width;
    const tipX = x + Math.cos(angle) * lean;
    const tipZ = z + Math.sin(angle) * lean;
    const base: [number, number, number, number] = [palette.base[0], palette.base[1], palette.base[2], 1];
    const mid: [number, number, number, number] = [
      (palette.base[0] + palette.tip[0]) * 0.5,
      (palette.base[1] + palette.tip[1]) * 0.5,
      (palette.base[2] + palette.tip[2]) * 0.5,
      1,
    ];
    const tip: [number, number, number, number] = [palette.tip[0], palette.tip[1], palette.tip[2], 1];
    addTriangle(
      data,
      { p: [x - bx, y, z - bz], c: base },
      { p: [x + bx, y, z + bz], c: base },
      { p: [x + bx * 0.35 + Math.cos(angle) * lean * 0.5, y + height * 0.55, z + bz * 0.35 + Math.sin(angle) * lean * 0.5], c: mid },
    );
    addTriangle(
      data,
      { p: [x + bx * 0.35 + Math.cos(angle) * lean * 0.5, y + height * 0.55, z + bz * 0.35 + Math.sin(angle) * lean * 0.5], c: mid },
      { p: [x + bx, y, z + bz], c: base },
      { p: [tipX, y + height, tipZ], c: tip },
    );
  }

  dispose(): void {
    for (const key of Array.from(this.chunks.keys())) this.destroyChunk(key);
    this.grassMaterial.destroy();
    this.flowerMaterial.destroy();
    this.silhouetteMaterial.destroy();
    this.root.destroy();
  }
}
