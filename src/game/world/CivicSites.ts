import {
  BLEND_ADDITIVEALPHA,
  Color,
  Entity,
  StandardMaterial,
  type AppBase,
} from 'playcanvas';
import type { ModelName } from '../config';
import type { AssetManager } from '../core/AssetManager';
import { createRandom, distance2D, randomRange } from '../util/math';
import { heightAt, riverProfile } from './heightfield';
import type { CollisionWorld } from './collision';
import type { Lighting } from './Lighting';
import { PROP_SOLIDS } from './solids';
import { REGIONS } from './regions';

const deg = (radians: number): number => (radians * 180) / Math.PI;

interface SiteMaterials {
  stone: StandardMaterial;
  metal: StandardMaterial;
  glow: StandardMaterial;
  wood: StandardMaterial;
  owned: StandardMaterial[];
}

/**
 * Always-resident hero architecture for the five regions: the city square and
 * its towers, Station Theta's reactor deck, the Mother Tree, and the stone
 * bridge over the Crystal River. These are the landmarks the streaming world is
 * composed around, and they own the practical lights that come on at night.
 */
export class CivicSites {
  readonly root: Entity;
  private readonly app: AppBase;
  private readonly assets: AssetManager;
  private readonly lighting: Lighting;
  private readonly collision: CollisionWorld | null;
  private readonly materials: SiteMaterials;
  private readonly accents: Entity[] = [];

  constructor(app: AppBase, assets: AssetManager, lighting: Lighting, collision?: CollisionWorld) {
    this.app = app;
    this.assets = assets;
    this.lighting = lighting;
    this.collision = collision ?? null;
    this.root = new Entity('civic-sites');
    app.root.addChild(this.root);

    // `owned` must exist before the factories run: `material()` registers each
    // material here for disposal, and `this.materials` is not assigned yet.
    const owned: StandardMaterial[] = [];
    this.materials = {
      stone: this.material(owned, 'site-stone', new Color(0.34, 0.33, 0.3), 0.05, 0.3),
      metal: this.material(owned, 'site-metal', new Color(0.2, 0.24, 0.25), 0.7, 0.42),
      glow: this.material(
        owned,
        'site-glow',
        new Color(0.08, 0.32, 0.3),
        0.2,
        0.6,
        new Color(0.3, 1, 0.86),
        1.6,
      ),
      wood: this.material(owned, 'site-wood', new Color(0.16, 0.12, 0.08), 0.04, 0.3),
      owned,
    };

    this.buildCitySquare();
    this.buildReactorDeck();
    this.buildMotherTree();
    this.buildRiverBridge();
  }

  private material(
    owned: StandardMaterial[],
    name: string,
    diffuse: Color,
    metalness: number,
    gloss: number,
    emissive?: Color,
    emissiveIntensity = 0,
  ): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse = diffuse;
    material.useMetalness = true;
    material.metalness = metalness;
    material.gloss = gloss;
    material.useFog = true;
    if (emissive) {
      material.emissive = emissive;
      material.emissiveIntensity = emissiveIntensity;
    }
    material.update();
    owned.push(material);
    return material;
  }

  private prop(name: ModelName, x: number, z: number, scale: number, rotation = 0, yOffset = 0): Entity {
    const y = heightAt(x, z) + yOffset;
    let entity = this.assets.instantiate(name, { castShadows: true, receiveShadows: true });
    if (!entity) entity = this.assets.createFallback(name);
    entity.setPosition(x, y, z);
    entity.setEulerAngles(0, rotation, 0);
    entity.setLocalScale(scale, scale, scale);
    this.root.addChild(entity);
    this.registerSolid(name, x, z, y, scale);
    return entity;
  }

  private registerSolid(name: ModelName, x: number, z: number, baseY: number, scale: number): void {
    if (!this.collision) return;
    const solid = PROP_SOLIDS[name];
    if (!solid) return;
    const halfX = (solid.halfX ?? solid.radius) * scale;
    const halfZ = (solid.halfZ ?? solid.radius) * scale;
    this.collision.add({
      x,
      z,
      radius: Math.max(halfX, halfZ),
      base: baseY - 0.25,
      top: baseY + solid.height * scale,
      walkable: solid.walkable ?? false,
      kind: `hero:${name}`,
      shape: solid.shape,
      halfX: solid.shape === 'box' ? halfX : undefined,
      halfZ: solid.shape === 'box' ? halfZ : undefined,
    });
  }

  private primitive(
    type: 'box' | 'cylinder' | 'sphere' | 'torus',
    x: number,
    y: number,
    z: number,
    scale: [number, number, number],
    material: StandardMaterial,
    shadow = true,
    rotationY = 0,
  ): Entity {
    const entity = new Entity(`site-${type}`);
    entity.addComponent('render', { type, material });
    entity.setPosition(x, y, z);
    entity.setEulerAngles(0, rotationY, 0);
    entity.setLocalScale(...scale);
    entity.render!.castShadows = shadow;
    entity.render!.receiveShadows = true;
    this.root.addChild(entity);
    return entity;
  }

  private lamp(x: number, z: number, height: number, color: Color, intensity: number, range: number): void {
    const y = heightAt(x, z);
    this.primitive('cylinder', x, y + height * 0.5, z, [0.18, height, 0.18], this.materials.metal, true);
    const bulb = this.primitive('sphere', x, y + height, z, [0.35, 0.35, 0.35], this.materials.glow, false);
    this.lighting.addAccent(`site-lamp-${this.accents.length}`, x, y + height, z, color, intensity, range, 0.8 + this.accents.length * 0.07);
    this.accents.push(bulb);
  }

  private buildCitySquare(): void {
    const centre = REGIONS.city.center;
    const y = heightAt(centre.x, centre.z);
    const rng = createRandom(51015);

    // Raised stone plaza with a stepped edge.
    this.primitive('cylinder', centre.x, y + 0.16, centre.z, [26, 0.32, 26], this.materials.stone, false);
    this.primitive('cylinder', centre.x, y + 0.4, centre.z, [18, 0.2, 18], this.materials.stone, false);
    if (this.collision) {
      // Outer apron and raised inner dais, matching the two stone discs.
      this.collision.add({
        x: centre.x,
        z: centre.z,
        radius: 13,
        base: y - 0.2,
        top: y + 0.34,
        walkable: true,
        kind: 'hero:city-apron',
      });
      this.collision.add({
        x: centre.x,
        z: centre.z,
        radius: 9,
        base: y + 0.24,
        top: y + 0.5,
        walkable: true,
        kind: 'hero:city-plaza',
      });
    }

    // Civic tower at the centre, flanked by apartment slabs and a gateway arch.
    this.prop('city_tower', centre.x, centre.z, 1.15, 18);
    this.prop('city_block', centre.x - 20, centre.z + 12, 1.05, 90);
    this.prop('city_block', centre.x + 18, centre.z - 16, 0.95, 270);
    this.prop('city_arch', centre.x + 24, centre.z + 22, 1.1, 0);
    this.prop('temple_pillar', centre.x - 12, centre.z - 12, 1.1, 15);
    this.prop('temple_pillar', centre.x + 12, centre.z - 14, 0.9, 40);
    this.prop('ruin_wall', centre.x - 24, centre.z - 20, 0.9, 75);

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      const radius = 16 + rng() * 9;
      const x = centre.x + Math.cos(a) * radius;
      const z = centre.z + Math.sin(a) * radius;
      this.prop(rng() > 0.5 ? 'fern' : 'rock_cluster', x, z, randomRange(rng, 0.6, 1.3), rng() * 360);
      if (i % 3 === 0) this.lamp(centre.x + Math.cos(a) * 11, centre.z + Math.sin(a) * 11, 4.2, new Color(1, 0.7, 0.4), 3.2, 22);
    }
    // Reclaimed planter rows.
    for (let i = 0; i < 12; i++) {
      const x = centre.x + randomRange(rng, -11, 11);
      const z = centre.z + randomRange(rng, -11, 11);
      if (distance2D(x, z, centre.x, centre.z) < 5) continue;
      this.prop('fern', x, z, randomRange(rng, 0.6, 1.1), rng() * 360);
    }
    this.lamp(centre.x + 6, centre.z + 6, 5, new Color(1, 0.74, 0.45), 4.2, 26);
  }

  private buildReactorDeck(): void {
    const centre = REGIONS.facility.center;
    const y = heightAt(centre.x, centre.z);

    // Metal deck and containment ring.
    this.primitive('cylinder', centre.x, y + 0.1, centre.z, [32, 0.24, 32], this.materials.metal, false);
    this.primitive('torus', centre.x, y + 0.45, centre.z, [12, 0.1, 12], this.materials.glow, false);
    if (this.collision) {
      this.collision.add({
        x: centre.x,
        z: centre.z,
        radius: 15,
        base: y - 0.2,
        top: y + 0.24,
        walkable: true,
        kind: 'hero:reactor-deck',
      });
    }

    // The dormant reactor itself: a scaled Echo Gate ring with a rune band.
    this.prop('echo_gate', centre.x, centre.z, 0.62, 0, 0.2);
    this.prop('gate_rune', centre.x, centre.z, 0.62, 0, 0.2);
    this.primitive('sphere', centre.x, y + 3.6, centre.z, [2.6, 2.6, 2.6], this.materials.glow, false);

    // Ring of pylons and dishes, with laboratory modules behind them.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const radius = 19;
      this.prop('facility_pylon', centre.x + Math.cos(a) * radius, centre.z + Math.sin(a) * radius, 1.05, deg(a));
    }
    const rng = createRandom(6161);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const radius = 30;
      this.prop('facility_block', centre.x + Math.cos(a) * radius, centre.z + Math.sin(a) * radius, 0.95, deg(a) + 90);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.9;
      const radius = 24 + rng() * 7;
      this.prop(rng() > 0.4 ? 'crystal_cluster' : 'facility_dish', centre.x + Math.cos(a) * radius, centre.z + Math.sin(a) * radius, randomRange(rng, 0.6, 1.0), rng() * 360);
    }

    // Conduits running out from the deck.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const length = 18;
      const x = centre.x + Math.cos(a) * length * 0.5;
      const z = centre.z + Math.sin(a) * length * 0.5;
      this.primitive('box', x, y + 0.35, z, [1.2, 0.35, length], this.materials.metal, false, deg(a));
    }
    this.lighting.addAccent('reactor-glow', centre.x, y + 4.5, centre.z, new Color(0.35, 1, 0.88), 5.5, 42, 0.7);
    this.lighting.addAccent('facility-deck-lamp', centre.x + 10, y + 5, centre.z - 8, new Color(0.5, 0.9, 1), 2.6, 24, 1.2);
  }

  private buildMotherTree(): void {
    const x = 190;
    const z = -104;
    const y = heightAt(x, z);
    const rng = createRandom(9091);

    this.prop('spire_tree', x, z, 3.3, 24);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const radius = 12 + rng() * 6;
      this.prop('spire_tree', x + Math.cos(a) * radius, z + Math.sin(a) * radius, randomRange(rng, 1.3, 2.2), rng() * 360);
    }
    // Ring of stones and a glowing grove rune.
    this.primitive('cylinder', x, y + 0.3, z, [7, 0.6, 7], this.materials.stone, true);
    this.primitive('torus', x, y + 0.7, z, [6.4, 0.09, 6.4], this.materials.glow, false);
    if (this.collision) {
      this.collision.add({ x, z, radius: 3.5, base: y - 0.1, top: y + 0.6, walkable: true, kind: 'hero:grove-stone' });
      this.collision.add({ x, z, radius: 1.4, base: y + 0.6, top: y + 1.8, walkable: false, kind: 'hero:mother-tree' });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.prop(rng() > 0.5 ? 'crystal_cluster' : 'fern', x + Math.cos(a) * (16 + rng() * 8), z + Math.sin(a) * (16 + rng() * 8), randomRange(rng, 0.6, 1.2), rng() * 360);
    }
    this.lighting.addAccent('grove-glow', x, y + 3, z, new Color(0.4, 1, 0.75), 3.4, 28, 0.9);
  }

  private buildRiverBridge(): void {
    const profile = riverProfile();
    // Nearest profile point to the trail crossing.
    let station = profile.stations[0];
    let best = Infinity;
    for (const candidate of profile.stations) {
      const delta = Math.abs(candidate.z - 30) + Math.abs(candidate.x - 6) * 0.5;
      if (delta < best) {
        best = delta;
        station = candidate;
      }
    }
    const index = profile.stations.indexOf(station);
    const next = profile.stations[Math.min(profile.stations.length - 1, index + 1)];
    const prev = profile.stations[Math.max(0, index - 1)];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;
    // A low footbridge: the deck clears the water and runs out until both ends
    // meet the banks, so the player can simply walk on and off.
    const deckY = station.y + 2.45;
    const deckTop = deckY + 0.25;
    const deckWidth = 5.2;
    let halfSpan = Math.max(8, station.width * 0.55);
    for (let d = halfSpan; d <= 20; d += 0.5) {
      const east = heightAt(station.x + nx * d, station.z + nz * d);
      const west = heightAt(station.x - nx * d, station.z - nz * d);
      if (east >= deckTop - 0.3 && west >= deckTop - 0.3) {
        halfSpan = d;
        break;
      }
    }
    const endA = { x: station.x + nx * halfSpan, z: station.z + nz * halfSpan };
    const endB = { x: station.x - nx * halfSpan, z: station.z - nz * halfSpan };

    // Deck, rails and supports.
    this.primitive('box', station.x, deckY, station.z, [halfSpan * 2 + 2, 0.5, deckWidth], this.materials.stone, true);
    for (const side of [-1, 1]) {
      const offsetX = tx / len;
      const offsetZ = tz / len;
      const rx = station.x + offsetX * (deckWidth * 0.5) * side;
      const rz = station.z + offsetZ * (deckWidth * 0.5) * side;
      this.primitive('box', rx, deckY + 0.45, rz, [halfSpan * 2, 0.9, 0.25], this.materials.stone, true);
    }
    for (const end of [endA, endB]) {
      const ground = heightAt(end.x, end.z);
      const height = Math.max(0.5, deckY - ground);
      this.primitive('box', end.x, ground + height * 0.5, end.z, [1.8, height, deckWidth * 0.9], this.materials.stone, true);
    }
    // Stepped approaches where an end sits below its bank by more than a step.
    for (const [end, out] of [
      [endA, 1],
      [endB, -1],
    ] as const) {
      if (Math.abs(heightAt(end.x, end.z) - deckTop) < 0.8) continue;
      let bankDistance = 0;
      let bankHeight = 0;
      for (let d = 2; d <= 14; d += 0.5) {
        const h = heightAt(end.x + nx * out * d, end.z + nz * out * d);
        if (h >= deckTop + 0.2) {
          bankDistance = d;
          bankHeight = h;
          break;
        }
      }
      const rise = bankHeight - deckTop;
      if (bankDistance <= 0 || rise <= 0.3) continue;
      const count = Math.max(1, Math.ceil(rise / 0.34));
      const tread = bankDistance / count;
      for (let i = 0; i < count; i++) {
        const top = deckTop + ((i + 1) / count) * rise;
        const distance = tread * (i + 0.5);
        const sx = end.x + nx * out * distance;
        const sz = end.z + nz * out * distance;
        const depth = tread * 1.25;
        this.primitive('box', sx, top - 0.9, sz, [1.9, 1.8, depth], this.materials.stone, true);
        if (this.collision) {
          this.collision.add({
            x: sx,
            z: sz,
            radius: 1.1,
            base: top - 1.8,
            top,
            walkable: true,
            kind: 'hero:bridge-step',
            shape: 'box',
            halfX: 0.95,
            halfZ: depth * 0.5,
          });
        }
      }
    }

    // Stone piers carrying the deck down to the gorge floor.
    for (const fraction of [-0.62, -0.24, 0.24, 0.62]) {
      const x = station.x + nx * halfSpan * fraction;
      const z = station.z + nz * halfSpan * fraction;
      const ground = heightAt(x, z) - 0.4;
      const height = deckY - ground;
      if (height < 0.5) continue;
      this.primitive('box', x, ground + height * 0.5, z, [1.5, height, 1.5], this.materials.stone, true);
    }
    // Four lantern posts at the corners.
    const corners = [
      { x: station.x + nx * (halfSpan - 1) + (tx / len) * 2.2, z: station.z + nz * (halfSpan - 1) + (tz / len) * 2.2 },
      { x: station.x + nx * (halfSpan - 1) - (tx / len) * 2.2, z: station.z + nz * (halfSpan - 1) - (tz / len) * 2.2 },
      { x: station.x - nx * (halfSpan - 1) + (tx / len) * 2.2, z: station.z - nz * (halfSpan - 1) + (tz / len) * 2.2 },
      { x: station.x - nx * (halfSpan - 1) - (tx / len) * 2.2, z: station.z - nz * (halfSpan - 1) - (tz / len) * 2.2 },
    ];
    for (const corner of corners) {
      this.primitive('cylinder', corner.x, deckY + 1.3, corner.z, [0.14, 2.6, 0.14], this.materials.metal, false);
      this.primitive('sphere', corner.x, deckY + 2.7, corner.z, [0.3, 0.3, 0.3], this.materials.glow, false);
    }
    this.lighting.addAccent('bridge-lamp', station.x, deckY + 3, station.z, new Color(1, 0.78, 0.45), 3.4, 20, 1.4);

    // Walkable deck collider (the bridge is axis-aligned at this crossing).
    if (this.collision) {
      const halfX = halfSpan + 1;
      const halfZ = deckWidth * 0.5;
      this.collision.add({
        x: station.x,
        z: station.z,
        radius: Math.max(halfX, halfZ),
        base: deckY - 0.6,
        top: deckY + 0.25,
        walkable: true,
        kind: 'hero:river-bridge',
        shape: 'box',
        halfX,
        halfZ,
      });
      for (const side of [-1, 1]) {
        this.collision.add({
          x: station.x,
          z: station.z + (tz / len) * (deckWidth * 0.5) * side,
          radius: 0.2,
          base: deckY - 0.05,
          top: deckY + 1.15,
          walkable: false,
          kind: 'hero:bridge-parapet',
          shape: 'box',
          halfX: halfSpan,
          halfZ: 0.14,
        });
      }
    }
    // Approach markers on both banks.
    this.prop('monolith_spire', endA.x + nx * 4, endA.z + nz * 4, 0.5, 20);
    this.prop('monolith_spire', endB.x - nx * 4, endB.z - nz * 4, 0.5, 65);
  }

  dispose(): void {
    for (const material of this.materials.owned) material.destroy();
    this.root.destroy();
  }
}
