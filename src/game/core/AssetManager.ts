import {
  Color,
  Entity,
  StandardMaterial,
  type AppBase,
  type Asset,
  type ContainerResource,
} from 'playcanvas';
import { MODEL_FILES, MODEL_URLS, type ModelName } from '../config';

export interface AssetProgress {
  loaded: number;
  total: number;
  name: string;
  fraction: number;
}

export interface AssetFailure {
  name: string;
  message: string;
  attempts: number;
}

export interface AssetLoadResult {
  failures: AssetFailure[];
  durationMs: number;
  loaded: number;
  total: number;
}

const MODEL_NAMES = Object.keys(MODEL_FILES) as ModelName[];
const MAX_ATTEMPTS = 2;
const LOAD_TIMEOUT = 20000;

/**
 * Loads the glTF/GLB prop library with progress, retries and per-asset isolation.
 * A missing prop degrades to a primitive stand-in instead of failing the expedition.
 */
export class AssetManager {
  private readonly app: AppBase;
  private readonly containers = new Map<ModelName, ContainerResource>();
  private readonly failures = new Map<ModelName, string>();
  private readonly materials = new Map<string, StandardMaterial>();

  constructor(app: AppBase) {
    this.app = app;
  }

  get total(): number {
    return MODEL_NAMES.length;
  }

  get failureList(): AssetFailure[] {
    return Array.from(this.failures, ([name, message]) => ({ name, message, attempts: MAX_ATTEMPTS }));
  }

  has(name: ModelName): boolean {
    return this.containers.has(name);
  }

  async loadAll(onProgress?: (progress: AssetProgress) => void): Promise<AssetLoadResult> {
    const start = performance.now();
    let loaded = 0;
    const failures: AssetFailure[] = [];

    const report = (name: string): void => {
      onProgress?.({
        loaded,
        total: MODEL_NAMES.length,
        name,
        fraction: loaded / MODEL_NAMES.length,
      });
    };

    for (const name of MODEL_NAMES) {
      try {
        const resource = await this.loadContainer(name);
        this.containers.set(name, resource);
        this.failures.delete(name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ name, message, attempts: MAX_ATTEMPTS });
        this.failures.set(name, message);
        console.warn(`[assets] "${name}" failed to load — using a procedural stand-in.`, error);
      }
      loaded += 1;
      report(name);
    }

    return {
      failures,
      durationMs: Math.round(performance.now() - start),
      loaded: loaded - failures.length,
      total: MODEL_NAMES.length,
    };
  }

  private async loadContainer(name: ModelName): Promise<ContainerResource> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.loadOnce(name);
      } catch (error) {
        lastError = error;
        // Give the network a moment before retrying; a 404 will fail again immediately.
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private loadOnce(name: ModelName): Promise<ContainerResource> {
    const url = MODEL_URLS[name];
    return new Promise<ContainerResource>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Timed out after ${LOAD_TIMEOUT / 1000}s loading ${url}`));
      }, LOAD_TIMEOUT);

      this.app.assets.loadFromUrl(url, 'container', (error: string | null, asset?: Asset) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (error || !asset || !asset.resource) {
          reject(new Error(error || `No container resource returned for ${url}`));
          return;
        }
        resolve(asset.resource as ContainerResource);
      });
    });
  }

  /** Clone a loaded prop for placement. Returns null when the asset is unavailable. */
  instantiate(name: ModelName, options: { castShadows?: boolean; receiveShadows?: boolean } = {}): Entity | null {
    const resource = this.containers.get(name);
    if (!resource) return null;
    try {
      const entity = resource.instantiateRenderEntity({
        castShadows: options.castShadows ?? true,
        receiveShadows: options.receiveShadows ?? true,
      });
      entity.name = `prop:${name}`;
      return entity;
    } catch (error) {
      console.warn(`[assets] could not instantiate "${name}"`, error);
      return null;
    }
  }

  /**
   * Procedural stand-in used when an asset could not be loaded. Keeps the world
   * populated and readable rather than empty.
   */
  createFallback(name: ModelName): Entity {
    const entity = new Entity(`fallback:${name}`);
    const material = this.getMaterial(name);
    switch (name) {
      case 'rock_cluster':
        entity.addComponent('render', { type: 'sphere', material });
        entity.setLocalScale(1.7, 1.1, 1.5);
        break;
      case 'monolith_spire':
        entity.addComponent('render', { type: 'cylinder', material });
        entity.setLocalScale(0.9, 7.4, 0.9);
        entity.setLocalPosition(0, 3.7, 0);
        break;
      case 'temple_pillar':
        entity.addComponent('render', { type: 'cylinder', material });
        entity.setLocalScale(1.1, 4.8, 1.1);
        entity.setLocalPosition(0, 2.4, 0);
        break;
      case 'spire_tree':
        entity.addComponent('render', { type: 'cone', material });
        entity.setLocalScale(1.4, 6.5, 1.4);
        entity.setLocalPosition(0, 3.2, 0);
        break;
      case 'ruin_wall':
        entity.addComponent('render', { type: 'box', material });
        entity.setLocalScale(5.4, 3, 1.1);
        entity.setLocalPosition(0, 1.4, 0);
        break;
      case 'echo_gate':
      case 'gate_rune':
        entity.addComponent('render', { type: 'torus', material });
        entity.setLocalScale(14, 14, 14);
        break;
      case 'echo_shard':
        entity.addComponent('render', { type: 'sphere', material });
        entity.setLocalScale(0.7, 0.7, 0.7);
        break;
      case 'drone_body':
        entity.addComponent('render', { type: 'sphere', material });
        entity.setLocalScale(0.7, 0.4, 0.7);
        break;
      case 'drone_ring':
        entity.addComponent('render', { type: 'torus', material });
        entity.setLocalScale(1, 1, 1);
        break;
      case 'city_block':
      case 'facility_block':
        entity.addComponent('render', { type: 'box', material });
        entity.setLocalScale(9, 6, 8);
        entity.setLocalPosition(0, 3, 0);
        break;
      case 'city_tower':
        entity.addComponent('render', { type: 'box', material });
        entity.setLocalScale(8, 30, 8);
        entity.setLocalPosition(0, 15, 0);
        break;
      case 'city_arch':
        entity.addComponent('render', { type: 'box', material });
        entity.setLocalScale(18, 1.2, 5.4);
        entity.setLocalPosition(0, 7.9, 0);
        break;
      case 'facility_pylon':
        entity.addComponent('render', { type: 'cylinder', material });
        entity.setLocalScale(1.2, 10, 1.2);
        entity.setLocalPosition(0, 5, 0);
        break;
      case 'facility_dish':
        entity.addComponent('render', { type: 'sphere', material });
        entity.setLocalScale(5.4, 1.2, 5.4);
        entity.setLocalPosition(0, 5.5, 0);
        break;
      case 'crystal_cluster':
        entity.addComponent('render', { type: 'cone', material });
        entity.setLocalScale(1.8, 3.4, 1.8);
        entity.setLocalPosition(0, 1.7, 0);
        break;
      case 'fern':
      case 'reeds':
        entity.addComponent('render', { type: 'cone', material });
        entity.setLocalScale(1.1, 1.2, 1.1);
        entity.setLocalPosition(0, 0.6, 0);
        break;
      default:
        entity.addComponent('render', { type: 'box', material });
        break;
    }
    return entity;
  }

  private getMaterial(name: ModelName): StandardMaterial {
    const cached = this.materials.get(name);
    if (cached) return cached;
    const material = new StandardMaterial();
    const glow =
      name === 'echo_shard' ||
      name === 'gate_rune' ||
      name === 'drone_ring' ||
      name === 'crystal_cluster' ||
      name === 'facility_pylon';
    material.name = `fallback-${name}`;
    material.useMetalness = true;
    material.metalness = glow ? 0.2 : 0.02;
    material.gloss = glow ? 0.7 : 0.12;
    material.diffuse = glow ? new Color(0.05, 0.35, 0.31) : new Color(0.3, 0.29, 0.27);
    material.emissive = glow ? new Color(0.2, 0.95, 0.8) : new Color(0, 0, 0);
    material.emissiveIntensity = glow ? 1.6 : 0;
    material.update();
    this.materials.set(name, material);
    return material;
  }

  get loadedCount(): number {
    return this.containers.size;
  }

  get failedCount(): number {
    return this.failures.size;
  }

  destroy(): void {
    for (const material of this.materials.values()) material.destroy();
    this.materials.clear();
    this.containers.clear();
  }
}
