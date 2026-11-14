import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAIT_JOINTS } from '../src/game/player/gait';

interface GltfDocument {
  nodes: Array<{ name: string; mesh?: number; children?: number[]; translation?: number[] }>;
  meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices: number }> }>;
  materials: Array<{ name: string; emissiveFactor?: number[] }>;
  accessors: Array<{ count: number; type: string; min?: number[]; max?: number[] }>;
}

function readCharacter(): { json: GltfDocument; bytes: number } {
  const buffer = readFileSync(join(process.cwd(), 'public/assets/models/wayfarer.glb'));
  expect(buffer.toString('utf8', 0, 4)).toBe('glTF');
  expect(buffer.readUInt32LE(4)).toBe(2);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength)) as GltfDocument;
  return { json, bytes: buffer.length };
}

describe('Wayfarer character asset', () => {
  const { json, bytes } = readCharacter();

  it('is a compact, valid binary glTF scene', () => {
    expect(bytes).toBeGreaterThan(100_000);
    expect(bytes).toBeLessThan(1_400_000);
    expect(json.nodes.length).toBeGreaterThanOrEqual(GAIT_JOINTS.length);
    expect(json.materials.length).toBeGreaterThanOrEqual(6);
  });

  it('exposes every joint the runtime animator drives', () => {
    const names = new Set(json.nodes.map((node) => node.name));
    for (const joint of GAIT_JOINTS) {
      expect(names.has(joint), `missing joint ${joint}`).toBe(true);
    }
  });

  it('has a connected hierarchy rooted at the wayfarer', () => {
    expect(json.nodes[0].name).toBe('wayfarer');
    for (const node of json.nodes) {
      for (const child of node.children ?? []) {
        expect(child).toBeGreaterThanOrEqual(0);
        expect(child).toBeLessThan(json.nodes.length);
      }
      for (const value of node.translation ?? []) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('is human-scaled with the feet at the origin', () => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const walk = (index: number, offset: number[]): void => {
      const node = json.nodes[index];
      const position = [
        offset[0] + (node.translation?.[0] ?? 0),
        offset[1] + (node.translation?.[1] ?? 0),
        offset[2] + (node.translation?.[2] ?? 0),
      ];
      if (node.mesh !== undefined) {
        for (const primitive of json.meshes[node.mesh].primitives) {
          const accessor = json.accessors[primitive.attributes.POSITION];
          for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], (accessor.min?.[axis] ?? 0) + position[axis]);
            max[axis] = Math.max(max[axis], (accessor.max?.[axis] ?? 0) + position[axis]);
          }
        }
      }
      for (const child of node.children ?? []) walk(child, position);
    };
    walk(0, [0, 0, 0]);
    expect(max[1] - min[1]).toBeGreaterThan(1.68);
    expect(max[1] - min[1]).toBeLessThan(1.92);
    expect(Math.abs(min[1])).toBeLessThan(0.06);
    expect(max[0] - min[0]).toBeLessThan(1.2);
  });

  it('ships emissive visor and bio materials for the animator pulse', () => {
    const names = json.materials.map((material) => material.name.toLowerCase());
    expect(names.some((name) => name.includes('visor'))).toBe(true);
    expect(names.some((name) => name.includes('bio'))).toBe(true);
    const emissive = json.materials.filter((material) =>
      (material.emissiveFactor ?? [0, 0, 0]).some((channel) => channel > 0.05),
    );
    expect(emissive.length).toBeGreaterThanOrEqual(2);
  });

  it('has enough geometry for a smooth silhouette but stays real-time', () => {
    const triangles = json.meshes
      .flatMap((mesh) => mesh.primitives)
      .reduce((sum, primitive) => sum + json.accessors[primitive.indices].count / 3, 0);
    expect(triangles).toBeGreaterThan(6000);
    expect(triangles).toBeLessThan(40000);
  });
});

/* -------------------------------------------------------------------------- */
/* Runtime rig binding (no graphics device required)                          */
/* -------------------------------------------------------------------------- */

import { Entity } from 'playcanvas';
import { CharacterModel } from '../src/game/player/CharacterModel';
import type { AssetManager } from '../src/game/core/AssetManager';

function stubRig(): Entity {
  const root = new Entity('wayfarer');
  const make = (name: string, parent: Entity, x = 0, y = 0, z = 0): Entity => {
    const entity = new Entity(name);
    entity.setLocalPosition(x, y, z);
    parent.addChild(entity);
    return entity;
  };
  const hips = make('hips', root, 0, 0.96, 0);
  make('skirt', hips, 0, -0.1, 0);
  const spine = make('spine', hips, 0, 0.08, 0);
  const chest = make('chest', spine, 0, 0.17, 0);
  const neck = make('neck', chest, 0, 0.3, 0);
  make('head', neck, 0, 0.09, 0);
  make('backpack', chest, 0, 0.12, -0.17);
  const cape = make('cape', chest, 0, 0.24, -0.13);
  make('cape_tip', cape, 0, -0.44, 0);
  for (const side of ['l', 'r']) {
    const sign = side === 'l' ? -1 : 1;
    const shoulder = make(`shoulder_${side}`, chest, sign * 0.205, 0.235, 0);
    const arm = make(`upper_arm_${side}`, shoulder, sign * 0.02, -0.045, 0);
    const forearm = make(`forearm_${side}`, arm, 0, -0.265, 0);
    make(`hand_${side}`, forearm, 0, -0.25, 0);
    const thigh = make(`thigh_${side}`, hips, sign * 0.095, -0.055, 0);
    const shin = make(`shin_${side}`, thigh, 0, -0.415, 0);
    make(`foot_${side}`, shin, 0, -0.375, 0.01);
  }
  return root;
}

function instantiateCharacter(): { model: CharacterModel; root: Entity } {
  const assets = { instantiate: () => stubRig() } as unknown as AssetManager;
  const model = new CharacterModel({} as never, assets);
  return { model, root: model.root };
}

/** PlayCanvas Euler APIs use degrees; the gait solver uses radians. */
function worldEuler(root: Entity, joint: string): { x: number; y: number; z: number } {
  const entity = root.findByName(joint)!;
  const euler = entity.getLocalEulerAngles();
  const toRadians = Math.PI / 180;
  return { x: euler.x * toRadians, y: euler.y * toRadians, z: euler.z * toRadians };
}

describe('character runtime binding', () => {
  it('binds the authored rig and drives every joint', () => {
    const { model, root } = instantiateCharacter();
    expect(model.usingAsset).toBe(true);
    expect(model.jointCount).toBe(GAIT_JOINTS.length);

    for (let frame = 0; frame < 90; frame++) {
      model.update(1 / 60, frame / 60, 3.5, true, 0, false);
    }
    expect(model.animationPhase).toBeGreaterThan(0);
    const thigh = worldEuler(root, 'thigh_l');
    expect(Math.abs(thigh.x)).toBeGreaterThan(0.05);
    for (const joint of GAIT_JOINTS) {
      const euler = worldEuler(root, joint);
      expect(Number.isFinite(euler.x + euler.y + euler.z)).toBe(true);
      const position = root.findByName(joint)!.getLocalPosition();
      expect(Number.isFinite(position.x + position.y + position.z)).toBe(true);
    }
  });

  it('damps between poses instead of snapping', () => {
    const { model, root } = instantiateCharacter();
    // Settle the idle pose, then accelerate to a run and watch a single frame.
    for (let frame = 0; frame < 120; frame++) model.update(1 / 60, frame / 60, 0, true, 0, false);
    const before = worldEuler(root, 'thigh_l').x;
    model.update(1 / 60, 2, 6.6, true, 0, false);
    const after = worldEuler(root, 'thigh_l').x;
    expect(Math.abs(after - before)).toBeLessThan(0.2);
  });

  it('tucks the legs in the air and returns to idle on the ground', () => {
    const { model, root } = instantiateCharacter();
    for (let frame = 0; frame < 40; frame++) model.update(1 / 60, frame / 60, 0, true, 0, false);
    for (let frame = 0; frame < 20; frame++) model.update(1 / 60, 1 + frame / 60, 2.2, false, 3.4, false);
    const airborne = worldEuler(root, 'thigh_l').x;
    expect(airborne).toBeLessThan(-0.1);

    for (let frame = 0; frame < 240; frame++) model.update(1 / 60, 2 + frame / 60, 0, true, 0, false);
    const idle = worldEuler(root, 'thigh_l').x;
    expect(Math.abs(idle)).toBeLessThan(0.12);
  });
});
