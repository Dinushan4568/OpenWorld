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
import { createRandom, lerp } from '../util/math';
import { addTriangle, buildMesh, createMeshData } from '../util/meshBuilder';
import type { Rgb } from './dayNightPalette';

const DOME_RADIUS = 780;
const BANDS = 26;
const SEGMENTS = 48;

interface Band {
  mesh: Mesh;
  material: StandardMaterial;
  entity: Entity;
  t0: number;
  t1: number;
}

/**
 * Procedural, smoothly recoloured sky.
 *
 * The visible sky is a set of narrow altitude bands whose unlit colours are
 * interpolated from the day/night palette, plus a sun, a moon and stars. It
 * follows the camera, so it works anywhere in the world and never needs a
 * cubemap rebuild when the time of day changes.
 */
export class SkyDome {
  readonly root: Entity;
  readonly night = { value: 0 };
  private readonly app: AppBase;
  private readonly bands: Band[] = [];
  private readonly stars: Entity;
  private readonly starMaterial: StandardMaterial;
  private readonly starRoot: Entity;
  private readonly sun: Entity;
  private readonly sunGlow: Entity;
  private readonly moon: Entity;
  private readonly moonGlow: Entity;
  private readonly sunMaterial: StandardMaterial;
  private readonly sunGlowMaterial: StandardMaterial;
  private readonly moonMaterial: StandardMaterial;
  private readonly moonGlowMaterial: StandardMaterial;
  private readonly ownedMeshes: Mesh[] = [];
  private lastZenith: Rgb = [-1, -1, -1];
  private lastHorizon: Rgb = [-1, -1, -1];
  private starOpacity = 0;

  constructor(app: AppBase) {
    this.app = app;
    this.root = new Entity('sky-dome');
    app.root.addChild(this.root);

    for (let i = 0; i < BANDS; i++) {
      const t0 = i / BANDS;
      const t1 = (i + 1) / BANDS;
      const mesh = buildMesh(app.graphicsDevice, this.buildBand(t0, t1), `sky-band-${i}`);
      this.ownedMeshes.push(mesh);
      const material = new StandardMaterial();
      material.name = `sky-band-material-${i}`;
      material.useLighting = false;
      material.useFog = false;
      material.depthWrite = false;
      material.cull = CULLFACE_NONE;
      material.diffuse = new Color(0.1, 0.1, 0.1, 1);
      material.update();
      const entity = new Entity(`sky-band-${i}`);
      entity.addComponent('render');
      const instance = new MeshInstance(mesh, material);
      // Draw the sky before the world's opaque queue so terrain and orbs win.
      instance.drawOrder = -10;
      entity.render!.meshInstances = [instance];
      entity.render!.castShadows = false;
      entity.render!.receiveShadows = false;
      this.root.addChild(entity);
      this.bands.push({ mesh, material, entity, t0, t1 });
    }

    // Stars ------------------------------------------------------------------
    this.starRoot = new Entity('stars');
    this.root.addChild(this.starRoot);
    const starMesh = buildMesh(app.graphicsDevice, this.buildStars(), 'star-field');
    this.ownedMeshes.push(starMesh);
    this.starMaterial = new StandardMaterial();
    this.starMaterial.name = 'star-material';
    this.starMaterial.useLighting = false;
    this.starMaterial.useFog = false;
    this.starMaterial.blendType = BLEND_ADDITIVEALPHA;
    this.starMaterial.depthWrite = false;
    this.starMaterial.cull = CULLFACE_NONE;
    this.starMaterial.diffuse = new Color(0.75, 0.82, 1, 1);
    this.starMaterial.emissive = new Color(0.75, 0.82, 1, 1);
    this.starMaterial.emissiveIntensity = 1.4;
    this.starMaterial.opacity = 0;
    this.starMaterial.update();
    this.stars = new Entity('star-field');
    this.stars.addComponent('render');
    const starsInstance = new MeshInstance(starMesh, this.starMaterial);
    starsInstance.drawOrder = -9;
    this.stars.render!.meshInstances = [starsInstance];
    this.stars.render!.castShadows = false;
    this.starRoot.addChild(this.stars);

    // Sun and moon ------------------------------------------------------------
    this.sunMaterial = this.makeOrbMaterial('sun-orb', [1, 0.92, 0.78], 1);
    this.sunGlowMaterial = this.makeOrbMaterial('sun-glow', [1, 0.72, 0.42], 0.32, true);
    this.moonMaterial = this.makeOrbMaterial('moon-orb', [0.78, 0.86, 1], 1);
    this.moonGlowMaterial = this.makeOrbMaterial('moon-glow', [0.55, 0.68, 1], 0.22, true);

    this.sun = this.makeOrb('sun', this.sunMaterial, 690, 24);
    this.sunGlow = this.makeOrb('sun-glow', this.sunGlowMaterial, 690, 165);
    this.moon = this.makeOrb('moon', this.moonMaterial, 690, 14);
    this.moonGlow = this.makeOrb('moon-glow', this.moonGlowMaterial, 690, 96);
  }

  private altitude(t: number): number {
    return -0.06 + t * (Math.PI / 2 + 0.06);
  }

  private buildBand(t0: number, t1: number): ReturnType<typeof createMeshData> {
    const data = createMeshData();
    const step = 1 / SEGMENTS;
    const alt0 = this.altitude(t0);
    const alt1 = this.altitude(t1);
    const ring = (alt: number): Array<[number, number, number]> => {
      const points: Array<[number, number, number]> = [];
      const cos = Math.cos(alt);
      for (let s = 0; s <= SEGMENTS; s++) {
        const theta = (s / SEGMENTS) * Math.PI * 2;
        points.push([Math.cos(theta) * cos * DOME_RADIUS, Math.sin(alt) * DOME_RADIUS, Math.sin(theta) * cos * DOME_RADIUS]);
      }
      return points;
    };
    const inner = ring(alt0);
    const outer = ring(alt1);
    const white: [number, number, number, number] = [1, 1, 1, 1];
    for (let s = 0; s < SEGMENTS; s++) {
      const a = inner[s];
      const b = inner[s + 1];
      const c = outer[s];
      const d = outer[s + 1];
      addTriangle(data, { p: a, c: white }, { p: b, c: white }, { p: c, c: white });
      addTriangle(data, { p: b, c: white }, { p: d, c: white }, { p: c, c: white });
    }
    void step;
    return data;
  }

  private buildStars(): ReturnType<typeof createMeshData> {
    const data = createMeshData();
    const rand = createRandom(424242);
    for (let i = 0; i < 420; i++) {
      const theta = rand() * Math.PI * 2;
      const alt = 0.03 + Math.sqrt(rand()) * (Math.PI / 2 - 0.05);
      const radius = 720;
      const cx = Math.cos(theta) * Math.cos(alt) * radius;
      const cy = Math.sin(alt) * radius;
      const cz = Math.sin(theta) * Math.cos(alt) * radius;
      const size = 1.2 + rand() * 2.6;
      const warm = rand();
      const color: [number, number, number, number] =
        warm > 0.86 ? [1, 0.88, 0.72, 1] : warm > 0.7 ? [1, 1, 1, 1] : [0.72, 0.82, 1, 1];
      const right = [Math.cos(theta + Math.PI / 2), 0, Math.sin(theta + Math.PI / 2)];
      const up = [0, 1, 0];
      const p0: [number, number, number] = [cx + right[0] * size, cy, cz + right[2] * size];
      const p1: [number, number, number] = [cx - right[0] * size, cy, cz - right[2] * size];
      const p2: [number, number, number] = [cx + up[0] * size * 0.8, cy + up[1] * size * 0.8 + size, cz + up[2] * size * 0.8];
      addTriangle(data, { p: p0, c: color }, { p: p1, c: color }, { p: p2, c: color });
    }
    return data;
  }

  private makeOrbMaterial(name: string, color: [number, number, number], opacity: number, additive = false): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.useLighting = false;
    material.useFog = false;
    material.depthWrite = false;
    if (additive) {
      material.blendType = BLEND_ADDITIVEALPHA;
      material.opacity = opacity;
    }
    material.diffuse = new Color(color[0], color[1], color[2], 1);
    material.emissive = new Color(color[0], color[1], color[2], 1);
    material.emissiveIntensity = 1.6;
    material.update();
    return material;
  }

  private makeOrb(name: string, material: StandardMaterial, distance: number, size: number): Entity {
    const entity = new Entity(name);
    entity.addComponent('render', { type: 'sphere', material });
    entity.render!.castShadows = false;
    entity.render!.receiveShadows = false;
    entity.setLocalScale(size, size, size);
    entity.setLocalPosition(0, distance, 0);
    const instance = entity.render!.meshInstances[0];
    if (instance) instance.drawOrder = -8;
    this.root.addChild(entity);
    return entity;
  }

  /** Apply a palette sample. Materials are only rebuilt when colours move. */
  setPalette(zenith: Rgb, horizon: Rgb, starOpacity: number): void {
    const changed =
      Math.abs(zenith[0] - this.lastZenith[0]) +
      Math.abs(zenith[1] - this.lastZenith[1]) +
      Math.abs(zenith[2] - this.lastZenith[2]) +
      Math.abs(horizon[0] - this.lastHorizon[0]) +
      Math.abs(horizon[1] - this.lastHorizon[1]) +
      Math.abs(horizon[2] - this.lastHorizon[2]) >
      0.004;
    if (changed) {
      for (const band of this.bands) {
        const mid = (band.t0 + band.t1) * 0.5;
        // Horizon colour holds near the ground and blends to zenith overhead.
        const blend = Math.pow(Math.min(1, mid / 0.62), 0.8);
        const r = lerp(horizon[0], zenith[0], blend);
        const g = lerp(horizon[1], zenith[1], blend);
        const b = lerp(horizon[2], zenith[2], blend);
        band.material.diffuse = new Color(r, g, b, 1);
        band.material.update();
      }
      this.lastZenith = zenith;
      this.lastHorizon = horizon;
    }
    this.starOpacity = starOpacity;
    this.starMaterial.opacity = starOpacity;
    this.starMaterial.update();
    this.stars.enabled = starOpacity > 0.02;
    this.night.value = starOpacity;
  }

  /** Position the sun and moon from unit directions. */
  setDirections(sunDirection: Rgb, moonDirection: Rgb, sunAboveHorizon: boolean): void {
    const place = (entity: Entity, dir: Rgb, distance: number): void => {
      entity.setLocalPosition(dir[0] * distance, dir[1] * distance, dir[2] * distance);
    };
    place(this.sun, sunDirection, 690);
    place(this.sunGlow, sunDirection, 690);
    place(this.moon, moonDirection, 690);
    place(this.moonGlow, moonDirection, 690);
    this.sun.enabled = sunAboveHorizon;
    this.sunGlow.enabled = sunAboveHorizon;
    this.moon.enabled = !sunAboveHorizon;
    this.moonGlow.enabled = !sunAboveHorizon;
  }

  setSunColor(color: Rgb): void {
    this.sunMaterial.diffuse = new Color(color[0], color[1], color[2], 1);
    this.sunMaterial.emissive = new Color(color[0], color[1], color[2], 1);
    this.sunMaterial.update();
    this.sunGlowMaterial.diffuse = new Color(color[0], color[1] * 0.85, color[2] * 0.6, 1);
    this.sunGlowMaterial.emissive = new Color(color[0], color[1] * 0.85, color[2] * 0.6, 1);
    this.sunGlowMaterial.update();
  }

  update(dt: number, camera: { x: number; y: number; z: number }): void {
    this.root.setPosition(camera.x, camera.y, camera.z);
    this.starRoot.setLocalEulerAngles(0, (performance.now() * 0.0018) % 360, 0);
    void dt;
  }

  dispose(): void {
    for (const mesh of this.ownedMeshes) mesh.destroy();
    for (const band of this.bands) band.material.destroy();
    this.starMaterial.destroy();
    this.sunMaterial.destroy();
    this.sunGlowMaterial.destroy();
    this.moonMaterial.destroy();
    this.moonGlowMaterial.destroy();
    this.root.destroy();
  }
}
