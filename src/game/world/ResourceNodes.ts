/**
 * Visible gather nodes. Authored coordinates come from the progression content;
 * this layer draws a small crystal outcrop for each cache, animates it, hides
 * gathered nodes and reports the nearest one for the interact prompt.
 */
import { Color, Entity, StandardMaterial, type AppBase } from 'playcanvas';
import { RESOURCES, RESOURCE_NODES } from '../progression/content';
import type { ResourceId, ResourceNodeDefinition } from '../progression/types';
import { distance2D } from '../util/math';
import { heightAt } from './heightfield';

export interface ResourceInteraction {
  id: string;
  type: ResourceId;
  label: string;
  x: number;
  y: number;
  z: number;
  distance: number;
}

const GATHER_RADIUS = 3.7;

function parseColor(hex: string): Color {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return new Color(r, g, b);
}

interface NodeActor {
  definition: ResourceNodeDefinition;
  root: Entity;
  ring: Entity;
  beacon: Entity;
  phase: number;
}

export class ResourceNodes {
  readonly root: Entity;
  private readonly nodes = new Map<string, NodeActor>();
  private readonly materials: StandardMaterial[] = [];
  private readonly crystalMaterials = new Map<ResourceId, StandardMaterial>();
  private gathered = new Set<string>();
  private surveyActive = false;
  private time = 0;

  constructor(app: AppBase) {
    this.root = new Entity('resource-nodes');
    app.root.addChild(this.root);

    for (const definition of RESOURCE_NODES) this.build(definition);
  }

  private material(name: string, color: Color, emissive: boolean): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse = emissive ? new Color(color.r * 0.12, color.g * 0.12, color.b * 0.12) : color;
    material.useMetalness = !emissive;
    material.metalness = emissive ? 0 : 0.45;
    material.gloss = emissive ? 0.2 : 0.55;
    material.useLighting = !emissive;
    material.useFog = true;
    if (emissive) {
      material.emissive = color;
      material.emissiveIntensity = 1.35;
    }
    material.update();
    this.materials.push(material);
    return material;
  }

  private crystalMaterial(type: ResourceId): StandardMaterial {
    const existing = this.crystalMaterials.get(type);
    if (existing) return existing;
    const definition = RESOURCES[type];
    const material = this.material(`resource-glow-${type}`, parseColor(definition.color), true);
    this.crystalMaterials.set(type, material);
    return material;
  }

  private primitive(
    parent: Entity,
    type: 'box' | 'cylinder' | 'sphere' | 'torus',
    position: [number, number, number],
    scale: [number, number, number],
    material: StandardMaterial,
    rotation: [number, number, number] = [0, 0, 0],
  ): Entity {
    const entity = new Entity(`resource-${type}`);
    entity.addComponent('render', { type, material });
    entity.setLocalPosition(...position);
    entity.setLocalScale(...scale);
    entity.setLocalEulerAngles(...rotation);
    entity.render!.castShadows = false;
    entity.render!.receiveShadows = true;
    parent.addChild(entity);
    return entity;
  }

  private build(definition: ResourceNodeDefinition): void {
    const root = new Entity(`cache:${definition.id}`);
    const ground = heightAt(definition.x, definition.z);
    root.setPosition(definition.x, ground, definition.z);
    this.root.addChild(root);

    const stone = this.material('resource-stone', new Color(0.21, 0.22, 0.2), false);
    const glow = this.crystalMaterial(definition.type);

    this.primitive(root, 'cylinder', [0, 0.12, 0], [0.52, 0.24, 0.52], stone);
    this.primitive(root, 'box', [0, 0.55, 0], [0.34, 0.82, 0.34], glow, [0, 28, 8]);
    this.primitive(root, 'box', [0.22, 0.42, -0.08], [0.18, 0.48, 0.18], glow, [8, -34, 14]);
    const ring = this.primitive(root, 'torus', [0, 0.28, 0], [0.78, 0.86, 0.78], glow, [78, 0, 0]);
    const beacon = this.primitive(root, 'sphere', [0, 1.22, 0], [0.1, 0.14, 0.1], glow);
    beacon.enabled = false;

    this.nodes.set(definition.id, {
      definition,
      root,
      ring,
      beacon,
      phase: definition.id.length * 0.63 + definition.x * 0.01,
    });
  }

  /** Applied whenever progression changes or the survey ability is unlocked. */
  apply(gathered: readonly string[], surveyActive: boolean): void {
    this.gathered = new Set(gathered);
    this.surveyActive = surveyActive;
    for (const node of this.nodes.values()) {
      const collected = this.gathered.has(node.definition.id);
      node.root.enabled = !collected;
      node.beacon.enabled = surveyActive && !collected;
    }
  }

  update(dt: number, time: number, player: { x: number; z: number }): void {
    this.time = time;
    for (const node of this.nodes.values()) {
      if (!node.root.enabled) continue;
      const bob = Math.sin(time * 1.35 + node.phase) * 0.06;
      for (const child of node.root.children) {
        if (child === node.ring) continue;
        if (child.name !== 'resource-box' && child.name !== 'resource-sphere') continue;
        const baseY = child.name === 'resource-sphere' ? 1.22 : child.getLocalPosition().y > 0.5 ? 0.55 : 0.42;
        child.setLocalPosition(child.getLocalPosition().x, baseY + bob, child.getLocalPosition().z);
        child.setLocalEulerAngles(child.getLocalEulerAngles().x, time * 34 + node.phase * 20, child.getLocalEulerAngles().z);
      }
      node.ring.setLocalEulerAngles(78, time * 18 + node.phase * 12, 0);
      if (node.beacon.enabled) {
        const distance = distance2D(player.x, player.z, node.definition.x, node.definition.z);
        node.beacon.setLocalScale(0.1 + (1 - Math.min(1, distance / 90)) * 0.16, 0.14, 0.1);
      }
      void dt;
    }
  }

  nearestInteraction(player: { x: number; y: number; z: number }): ResourceInteraction | null {
    let best: ResourceInteraction | null = null;
    for (const node of this.nodes.values()) {
      if (!node.root.enabled) continue;
      const position = node.root.getPosition();
      const distance = distance2D(player.x, player.z, position.x, position.z);
      if (distance > GATHER_RADIUS) continue;
      if (Math.abs(player.y - position.y) > 4) continue;
      const candidate: ResourceInteraction = {
        id: node.definition.id,
        type: node.definition.type,
        label: `Gather ${RESOURCES[node.definition.type].name}`,
        x: position.x,
        y: position.y,
        z: position.z,
        distance,
      };
      if (!best || candidate.distance < best.distance) best = candidate;
    }
    return best;
  }

  get remaining(): number {
    return RESOURCE_NODES.length - this.gathered.size;
  }

  get survey(): boolean {
    return this.surveyActive;
  }

  get placements(): Array<{ id: string; type: ResourceId; x: number; y: number; z: number }> {
    return RESOURCE_NODES.map((node) => ({
      id: node.id,
      type: node.type,
      x: node.x,
      y: heightAt(node.x, node.z),
      z: node.z,
    }));
  }

  get elapsed(): number {
    return this.time;
  }

  dispose(): void {
    for (const material of this.materials) material.destroy();
    this.nodes.clear();
    this.root.destroy();
  }
}
