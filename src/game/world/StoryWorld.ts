/**
 * Visible story layer: the three characters, their belongings and the ancient
 * mechanisms they point at. The mission director supplies availability and NPC
 * positions; this class only draws, animates and reports proximity.
 */
import {
  BLEND_ADDITIVEALPHA,
  Color,
  Entity,
  StandardMaterial,
  type AppBase,
} from 'playcanvas';
import type { AssetManager } from '../core/AssetManager';
import { CharacterModel } from '../player/CharacterModel';
import { INTERACTABLES, NPCS } from '../story/content';
import type { InteractableDefinition, NpcDefinition, WorldStoryView } from '../story/types';
import { clamp, damp, distance2D, wrapAngle } from '../util/math';
import { heightAt } from './heightfield';

export interface StoryInteraction {
  id: string;
  kind: 'npc' | 'prop';
  label: string;
  x: number;
  y: number;
  z: number;
  distance: number;
}

interface NpcActor {
  definition: NpcDefinition;
  root: Entity;
  model: CharacterModel | null;
  marker: Entity;
  markerMaterial: StandardMaterial;
  drone: Entity | null;
  rings: Entity[];
  materials: StandardMaterial[];
  phase: number;
  facing: number;
}

interface StoryProp {
  definition: InteractableDefinition;
  root: Entity;
  animated: Entity[];
  glow: StandardMaterial[];
  baseY: number;
  phase: number;
}

const NPC_TALK_RADIUS = 4.4;
const PROP_RADIUS = 3.9;

const ARCHIVIST_TINT = {
  fabric: new Color(0.2, 0.15, 0.12),
  leather: new Color(0.32, 0.21, 0.12),
  cloth: new Color(0.16, 0.2, 0.17),
  accent: new Color(0.94, 0.58, 0.24),
};

const SALVAGER_TINT = {
  fabric: new Color(0.08, 0.16, 0.15),
  leather: new Color(0.2, 0.19, 0.12),
  cloth: new Color(0.07, 0.13, 0.14),
  accent: new Color(0.37, 0.82, 0.66),
};

export class StoryWorld {
  readonly root: Entity;
  private readonly app: AppBase;
  private readonly assets: AssetManager;
  private readonly npcs = new Map<string, NpcActor>();
  private readonly props = new Map<string, StoryProp>();
  private readonly materials: StandardMaterial[] = [];
  private readonly stone: StandardMaterial;
  private readonly metal: StandardMaterial;
  private readonly brass: StandardMaterial;
  private readonly glowTeal: StandardMaterial;
  private readonly glowAmber: StandardMaterial;
  private readonly glowGreen: StandardMaterial;
  private readonly markerMain: StandardMaterial;
  private readonly markerSide: StandardMaterial;
  private readonly markerOff: StandardMaterial;
  private view: WorldStoryView = {
    available: [],
    consumed: [],
    solvedPuzzles: [],
    readMemories: [],
    npcs: {},
    highlights: {},
    chapterComplete: false,
  };
  private time = 0;

  constructor(app: AppBase, assets: AssetManager) {
    this.app = app;
    this.assets = assets;
    this.root = new Entity('story-world');
    app.root.addChild(this.root);

    this.stone = this.material('story-stone', new Color(0.27, 0.26, 0.23), 0.05, 0.3);
    this.metal = this.material('story-metal', new Color(0.16, 0.19, 0.19), 0.7, 0.4);
    this.brass = this.material('story-brass', new Color(0.48, 0.34, 0.16), 0.75, 0.35);
    this.glowTeal = this.glowMaterial('story-teal', new Color(0.22, 1, 0.82), 1.8);
    this.glowAmber = this.glowMaterial('story-amber', new Color(1, 0.62, 0.24), 1.6);
    this.glowGreen = this.glowMaterial('story-green', new Color(0.45, 1, 0.45), 1.3);
    this.markerMain = this.glowMaterial('story-marker-main', new Color(1, 0.68, 0.28), 1.5);
    this.markerSide = this.glowMaterial('story-marker-side', new Color(0.35, 0.95, 0.8), 1.3);
    this.markerOff = this.glowMaterial('story-marker-off', new Color(0.25, 0.3, 0.29), 0.4);

    for (const npc of NPCS) this.buildNpc(npc);
    for (const prop of INTERACTABLES) this.buildProp(prop);
  }

  /* ------------------------------ materials ---------------------------- */

  private material(name: string, diffuse: Color, metalness: number, gloss: number): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse = diffuse;
    material.useMetalness = true;
    material.metalness = metalness;
    material.gloss = gloss;
    material.useFog = true;
    material.update();
    this.materials.push(material);
    return material;
  }

  private glowMaterial(name: string, color: Color, intensity: number): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse = new Color(0.02, 0.04, 0.04);
    material.emissive = color;
    material.emissiveIntensity = intensity;
    material.useLighting = false;
    material.useFog = true;
    material.update();
    this.materials.push(material);
    return material;
  }

  private addPrimitive(
    parent: Entity,
    type: 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus',
    position: [number, number, number],
    scale: [number, number, number],
    material: StandardMaterial,
    options: { rotationY?: number; rotationX?: number; castShadows?: boolean } = {},
  ): Entity {
    const entity = new Entity(`story-${type}`);
    entity.addComponent('render', { type, material });
    entity.setLocalPosition(...position);
    entity.setLocalScale(...scale);
    entity.setLocalEulerAngles(options.rotationX ?? 0, options.rotationY ?? 0, 0);
    entity.render!.castShadows = options.castShadows ?? false;
    entity.render!.receiveShadows = true;
    parent.addChild(entity);
    return entity;
  }

  /* --------------------------------- NPCs ------------------------------ */

  private buildNpc(definition: NpcDefinition): void {
    const root = new Entity(`npc:${definition.id}`);
    root.setPosition(definition.home.x, heightAt(definition.home.x, definition.home.z) + (definition.yOffset ?? 0), definition.home.z);
    root.setEulerAngles(0, (definition.heading * 180) / Math.PI, 0);
    this.root.addChild(root);

    const materials: StandardMaterial[] = [];
    let model: CharacterModel | null = null;
    const rings: Entity[] = [];
    let drone: Entity | null = null;

    if (definition.archetype === 'caretaker') {
      const projector = this.addPrimitive(root, 'cylinder', [0, 0.22, 0], [0.72, 0.44, 0.72], this.metal);
      projector.render!.castShadows = true;
      this.addPrimitive(root, 'torus', [0, 0.48, 0], [0.82, 0.6, 0.82], this.glowTeal);
      const body = this.holoMaterial('sable-body', new Color(0.35, 1, 0.92), 0.22);
      const bust = this.addPrimitive(root, 'cylinder', [0, 1.28, 0], [0.34, 1.5, 0.34], body);
      bust.setLocalEulerAngles(0, 0, 0);
      const head = this.addPrimitive(root, 'sphere', [0, 2.15, 0], [0.32, 0.4, 0.32], body);
      head.render!.castShadows = false;
      for (let i = 0; i < 3; i += 1) {
        const ring = this.addPrimitive(
          root,
          'torus',
          [0, 1.35 + i * 0.36, 0],
          [0.9 + i * 0.08, 1.1 + i * 0.08, 0.9 + i * 0.08],
          i === 1 ? this.glowAmber : this.glowTeal,
          { rotationX: 65 + i * 18, rotationY: i * 42 },
        );
        ring.render!.castShadows = false;
        rings.push(ring);
      }
      const core = this.addPrimitive(root, 'sphere', [0, 1.55, 0], [0.2, 0.2, 0.2], this.glowGreen);
      core.render!.castShadows = false;
      const light = new Entity('sable-light');
      light.addComponent('light', {
        type: 'point',
        color: new Color(0.45, 1, 0.9),
        intensity: 1.1,
        range: 11,
        castShadows: false,
      });
      light.setLocalPosition(0, 2.1, 0);
      root.addChild(light);
      model = null;
    } else {
      model = new CharacterModel(this.app, this.assets);
      model.root.name = `npc-model:${definition.id}`;
      root.addChild(model.root);
      this.tintNpc(model, definition.archetype, materials);
      if (definition.archetype === 'archivist') {
        this.addPrimitive(root, 'cylinder', [0.5, 1.02, 0.12], [0.045, 2.04, 0.045], this.brass);
        this.addPrimitive(root, 'sphere', [0.5, 2.08, 0.12], [0.12, 0.16, 0.12], this.glowAmber);
        this.addPrimitive(root, 'box', [0.3, 0.94, -0.18], [0.5, 0.46, 0.25], this.metal);
        this.addPrimitive(root, 'box', [-0.34, 1.02, -0.08], [0.22, 0.34, 0.18], this.brass);
      } else {
        this.addPrimitive(root, 'box', [0.28, 1.15, -0.3], [0.62, 0.76, 0.34], this.metal);
        this.addPrimitive(root, 'box', [0.28, 1.48, -0.3], [0.42, 0.12, 0.38], this.glowAmber);
        drone = new Entity('kesh-drone');
        drone.setLocalPosition(0.92, 1.62, 0.38);
        root.addChild(drone);
        this.addPrimitive(drone, 'sphere', [0, 0, 0], [0.16, 0.11, 0.16], this.metal);
        const droneRing = this.addPrimitive(drone, 'torus', [0, 0, 0], [0.3, 0.32, 0.3], this.glowTeal, {
          rotationX: 90,
        });
        droneRing.render!.castShadows = false;
      }
    }

    const markerMaterial = this.markerOff;
    const marker = this.addPrimitive(root, 'sphere', [0, definition.archetype === 'caretaker' ? 2.9 : 2.45, 0], [0.15, 0.22, 0.15], markerMaterial);
    marker.render!.castShadows = false;
    marker.enabled = false;

    this.npcs.set(definition.id, {
      definition,
      root,
      model,
      marker,
      markerMaterial,
      drone,
      rings,
      materials,
      phase: definition.id.length * 1.7,
      facing: definition.heading,
    });
  }

  private tintNpc(model: CharacterModel, archetype: string, owned: StandardMaterial[]): void {
    const tint = archetype === 'archivist' ? ARCHIVIST_TINT : SALVAGER_TINT;
    for (const render of model.root.findComponents('render')) {
      for (const mesh of render.meshInstances) {
        const original = mesh.material as StandardMaterial;
        if (!original || original.name?.startsWith('npc-')) continue;
        const clone = new StandardMaterial();
        clone.copy(original);
        clone.name = `npc-${archetype}-${original.name ?? 'material'}`;
        const name = (original.name ?? '').toLowerCase();
        if (name.includes('fabric')) clone.diffuse = tint.fabric;
        else if (name.includes('leather')) clone.diffuse = tint.leather;
        else if (name.includes('cloth')) clone.diffuse = tint.cloth;
        else if (name.includes('accent')) clone.diffuse = tint.accent;
        clone.useFog = true;
        clone.update();
        mesh.material = clone;
        owned.push(clone);
      }
    }
  }

  private holoMaterial(name: string, color: Color, opacity: number): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse = new Color(0.02, 0.06, 0.06);
    material.emissive = color;
    material.emissiveIntensity = 1.2;
    material.opacity = opacity;
    material.blendType = BLEND_ADDITIVEALPHA;
    material.depthWrite = false;
    material.useLighting = false;
    material.useFog = true;
    material.update();
    this.materials.push(material);
    return material;
  }

  /* ------------------------------- props ------------------------------- */

  private buildProp(definition: InteractableDefinition): void {
    const root = new Entity(`story-prop:${definition.id}`);
    const baseY = heightAt(definition.x, definition.z) + (definition.yOffset ?? 0);
    root.setPosition(definition.x, baseY, definition.z);
    root.enabled = false;
    this.root.addChild(root);
    const animated: Entity[] = [];
    const glow: StandardMaterial[] = [];
    const glowClone = (source: StandardMaterial): StandardMaterial => {
      const clone = new StandardMaterial();
      clone.copy(source);
      clone.name = `${source.name}-${definition.id}`;
      clone.update();
      this.materials.push(clone);
      glow.push(clone);
      return clone;
    };

    if (definition.kind === 'case') {
      this.addPrimitive(root, 'box', [0, 0.2, 0], [0.66, 0.4, 0.46], this.metal, { castShadows: true });
      this.addPrimitive(root, 'box', [0, 0.41, 0], [0.68, 0.05, 0.48], this.brass);
      this.addPrimitive(root, 'box', [0, 0.43, 0.22], [0.4, 0.02, 0.03], glowClone(this.glowAmber));
      this.addPrimitive(root, 'torus', [0, 0.3, 0], [0.42, 0.5, 0.42], this.brass, { rotationX: 90 });
    } else if (definition.kind === 'stake') {
      this.addPrimitive(root, 'cylinder', [0, 0.68, 0], [0.07, 1.36, 0.07], this.brass, { castShadows: true });
      this.addPrimitive(root, 'cone', [0, 1.4, 0], [0.16, 0.28, 0.16], this.glowTeal);
      this.addPrimitive(root, 'torus', [0, 1.08, 0], [0.3, 0.34, 0.3], glowClone(this.glowAmber), { rotationX: 90 });
      this.addPrimitive(root, 'box', [0, 0.34, 0.14], [0.34, 0.4, 0.04], this.stone);
    } else if (definition.kind === 'cache') {
      this.addPrimitive(root, 'box', [0, 0.34, 0], [0.86, 0.68, 0.66], this.metal, { castShadows: true });
      this.addPrimitive(root, 'box', [0, 0.34, 0.34], [0.66, 0.18, 0.03], glowClone(this.glowGreen));
      this.addPrimitive(root, 'torus', [0, 0.55, 0], [0.4, 0.48, 0.4], this.brass, { rotationX: 90 });
      const beacon = this.addPrimitive(root, 'sphere', [0, 0.78, 0], [0.09, 0.09, 0.09], glowClone(this.glowAmber));
      animated.push(beacon);
    } else if (definition.kind === 'console') {
      this.addPrimitive(root, 'cylinder', [0, 0.45, 0], [0.72, 0.9, 0.72], this.metal, { castShadows: true });
      this.addPrimitive(root, 'box', [0, 1.1, 0.16], [1.12, 0.3, 0.62], this.brass, { rotationX: -18 });
      for (let i = 0; i < 3; i += 1) {
        const dial = this.addPrimitive(
          root,
          'sphere',
          [-0.32 + i * 0.32, 1.22, 0.3],
          [0.12, 0.12, 0.12],
          glowClone(i === 1 ? this.glowAmber : this.glowTeal),
        );
        dial.render!.castShadows = false;
      }
      const halo = this.addPrimitive(root, 'torus', [0, 1.42, 0], [0.82, 0.95, 0.82], glowClone(this.glowTeal), {
        rotationX: 78,
      });
      animated.push(halo);
    } else if (definition.kind === 'relic') {
      const core = this.addPrimitive(root, 'box', [0, 1.28, 0], [0.3, 0.56, 0.3], glowClone(this.glowAmber), {
        rotationY: 45,
        rotationX: 20,
      });
      const cage = this.addPrimitive(root, 'torus', [0, 1.28, 0], [0.62, 0.72, 0.62], this.brass, {
        rotationX: 60,
      });
      animated.push(core, cage);
    } else if (definition.kind === 'witness') {
      this.addPrimitive(root, 'cylinder', [0, 0.3, 0], [0.9, 0.6, 0.9], this.stone, { castShadows: true });
      this.addPrimitive(root, 'torus', [0, 1.15, 0], [0.86, 1.05, 0.86], this.brass, { rotationX: 90 });
      const core = this.addPrimitive(root, 'sphere', [0, 1.18, 0], [0.38, 0.38, 0.38], glowClone(this.glowTeal));
      const ring = this.addPrimitive(root, 'torus', [0, 1.18, 0], [1.12, 1.28, 1.12], glowClone(this.glowAmber), {
        rotationX: 22,
      });
      animated.push(core, ring);
    } else {
      // Memorial obelisk.
      this.addPrimitive(root, 'box', [0, 0.9, 0], [0.44, 1.8, 0.32], this.stone, { castShadows: true });
      this.addPrimitive(root, 'box', [0, 1.84, 0], [0.52, 0.1, 0.4], this.brass, { rotationY: 45 });
      this.addPrimitive(root, 'box', [0, 1.12, 0.18], [0.25, 0.62, 0.03], glowClone(this.glowTeal));
      const halo = this.addPrimitive(root, 'torus', [0, 0.3, 0], [0.62, 0.74, 0.62], glowClone(this.glowTeal), {
        rotationX: 90,
      });
      animated.push(halo);
    }

    this.props.set(definition.id, {
      definition,
      root,
      animated,
      glow,
      baseY,
      phase: definition.id.length * 0.73,
    });
  }

  /* ------------------------------- update ------------------------------ */

  apply(view: WorldStoryView): void {
    this.view = view;
    const available = new Set(view.available);
    const consumed = new Set(view.consumed);
    const read = new Set(view.readMemories);
    for (const [id, prop] of this.props) {
      const enabled = available.has(id) && !consumed.has(id);
      prop.root.enabled = enabled;
      if (prop.definition.memory) {
        for (const material of prop.glow) {
          material.emissiveIntensity = read.has(prop.definition.memory) ? 0.35 : 1.4;
        }
      }
      if (view.solvedPuzzles.includes(prop.definition.puzzle ?? '')) {
        for (const material of prop.glow) material.emissiveIntensity = 0.3;
      }
    }
    for (const [id, actor] of this.npcs) {
      const location = view.npcs[id];
      if (location) {
        actor.root.setPosition(
          location.x,
          heightAt(location.x, location.z) + (actor.definition.yOffset ?? 0),
          location.z,
        );
        actor.facing = location.heading;
        actor.root.setEulerAngles(0, (location.heading * 180) / Math.PI, 0);
      }
      const highlight = view.highlights[id];
      actor.marker.enabled = Boolean(highlight);
      actor.markerMaterial = highlight === 'side' ? this.markerSide : highlight === 'main' ? this.markerMain : this.markerOff;
      const render = actor.marker.render;
      if (render) render.material = actor.markerMaterial;
    }
  }

  update(dt: number, time: number, player: { x: number; y: number; z: number }): void {
    this.time = time;
    for (const actor of this.npcs.values()) {
      if (actor.model) {
        actor.model.update(dt, time, 0, true, 0, false, { landing: 0, turnRate: 0, running: false });
      }
      const dx = player.x - actor.root.getPosition().x;
      const dz = player.z - actor.root.getPosition().z;
      const distance = Math.hypot(dx, dz);
      if (distance < 11) {
        const desired = Math.atan2(dx, dz);
        const current = (actor.root.getEulerAngles().y * Math.PI) / 180;
        const next = current + wrapAngle(desired - current) * clamp(dt * 2.2, 0, 1);
        actor.root.setEulerAngles(0, (next * 180) / Math.PI, 0);
      }
      actor.marker.setLocalPosition(0, (actor.definition.archetype === 'caretaker' ? 2.9 : 2.45) + Math.sin(time * 1.7 + actor.phase) * 0.12, 0);
      actor.marker.setLocalEulerAngles(0, time * 55 + actor.phase * 20, 0);
      if (actor.drone) {
        actor.drone.setLocalPosition(
          0.92 + Math.cos(time * 0.9 + actor.phase) * 0.18,
          1.62 + Math.sin(time * 1.6 + actor.phase) * 0.12,
          0.38 + Math.sin(time * 0.9 + actor.phase) * 0.18,
        );
        actor.drone.setLocalEulerAngles(0, time * 65, 0);
      }
      for (let i = 0; i < actor.rings.length; i += 1) {
        const ring = actor.rings[i];
        const angles = ring.getLocalEulerAngles();
        ring.setLocalEulerAngles(angles.x, angles.y + dt * (12 + i * 9), angles.z + dt * (4 + i * 3));
      }
    }

    for (const prop of this.props.values()) {
      if (!prop.root.enabled) continue;
      const bob = Math.sin(time * 1.4 + prop.phase) * 0.07;
      if (prop.definition.kind === 'relic') {
        prop.animated[0]?.setLocalPosition(0, 1.28 + bob, 0);
        prop.animated[0]?.setLocalEulerAngles(20, time * 42 + prop.phase * 30, 0);
        prop.animated[1]?.setLocalEulerAngles(60, time * -28, 0);
      } else if (prop.definition.kind === 'witness') {
        prop.animated[0]?.setLocalPosition(0, 1.18 + bob, 0);
        prop.animated[1]?.setLocalEulerAngles(22, time * 30, 0);
      } else if (prop.definition.kind === 'console') {
        prop.animated[0]?.setLocalEulerAngles(78, time * 24, 0);
      } else if (prop.definition.kind === 'memorial') {
        prop.animated[0]?.setLocalEulerAngles(90, time * 16, 0);
      } else if (prop.definition.kind === 'cache') {
        prop.animated[0]?.setLocalPosition(0, 0.78 + bob * 1.4, 0);
      }
      const read = prop.definition.memory ? this.view.readMemories.includes(prop.definition.memory) : false;
      const solved = this.view.solvedPuzzles.includes(prop.definition.puzzle ?? '');
      for (let i = 0; i < prop.glow.length; i += 1) {
        const material = prop.glow[i];
        const target = read || solved ? 0.3 : 1.1 + Math.sin(time * 1.9 + prop.phase + i) * 0.25;
        material.emissiveIntensity = damp(material.emissiveIntensity, target, 3, dt);
      }
    }
  }

  /* ----------------------------- interaction --------------------------- */

  nearestInteraction(player: { x: number; y: number; z: number }): StoryInteraction | null {
    let best: StoryInteraction | null = null;
    for (const actor of this.npcs.values()) {
      const position = actor.root.getPosition();
      const distance = distance2D(player.x, player.z, position.x, position.z);
      if (distance > NPC_TALK_RADIUS) continue;
      if (Math.abs(player.y - position.y) > 4) continue;
      const candidate: StoryInteraction = {
        id: actor.definition.id,
        kind: 'npc',
        label: `Talk to ${actor.definition.name}`,
        x: position.x,
        y: position.y,
        z: position.z,
        distance,
      };
      if (!best || candidate.distance < best.distance) best = candidate;
    }
    for (const prop of this.props.values()) {
      if (!prop.root.enabled) continue;
      const position = prop.root.getPosition();
      const distance = distance2D(player.x, player.z, position.x, position.z);
      if (distance > PROP_RADIUS) continue;
      if (Math.abs(player.y - position.y) > 4.5) continue;
      const candidate: StoryInteraction = {
        id: prop.definition.id,
        kind: 'prop',
        label: prop.definition.label,
        x: position.x,
        y: position.y,
        z: position.z,
        distance,
      };
      if (!best || candidate.distance < best.distance) best = candidate;
    }
    return best;
  }

  /** Debug/test surface: every built story object and where it stands. */
  get placements(): Array<{ id: string; kind: 'npc' | 'prop'; x: number; y: number; z: number }> {
    const result: Array<{ id: string; kind: 'npc' | 'prop'; x: number; y: number; z: number }> = [];
    for (const actor of this.npcs.values()) {
      const position = actor.root.getPosition();
      result.push({ id: actor.definition.id, kind: 'npc', x: position.x, y: position.y, z: position.z });
    }
    for (const prop of this.props.values()) {
      const position = prop.root.getPosition();
      result.push({ id: prop.definition.id, kind: 'prop', x: position.x, y: position.y, z: position.z });
    }
    return result;
  }

  get propCount(): number {
    return this.props.size;
  }

  get npcCount(): number {
    return this.npcs.size;
  }

  get elapsed(): number {
    return this.time;
  }

  dispose(): void {
    for (const actor of this.npcs.values()) {
      for (const material of actor.materials) material.destroy();
      actor.root.destroy();
    }
    this.npcs.clear();
    for (const material of this.materials) material.destroy();
    this.root.destroy();
    void this.app;
    void this.assets;
  }
}
