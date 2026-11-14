/**
 * Procedural bodies for the four robotic species.
 *
 * Each rigid joint is a PlayCanvas entity with one merged opaque mesh and one
 * optional emissive mesh, so the whole menagerie stays cheap to draw. Limbs,
 * plates and pistons are built from a tiny local geometry kit; animation is
 * driven entirely from `CreatureMotion`, which the brain fills in.
 */
import { Color, Entity, Mesh, MeshInstance, StandardMaterial, type GraphicsDevice } from 'playcanvas';
import { clamp, damp } from '../util/math';
import { buildMesh, type MeshData } from '../util/meshBuilder';
import { addBox, addCone, addCylinder, addRing, addSphere, mesh } from './geometry';
import type { RigRole, SpeciesDefinition } from './species';
import type { CreatureState } from './types';

export interface CreatureMotion {
  dt: number;
  time: number;
  speed: number;
  state: CreatureState;
  alert: boolean;
  display: number;
  flying: boolean;
  bank: number;
  yawRate: number;
  lookYaw: number;
  lookPitch: number;
  dazed: boolean;
  night: number;
}

interface JointRef {
  name: string;
  entity: Entity;
  role: RigRole;
  side: -1 | 0 | 1;
  phase: number;
  base: [number, number, number];
  index: number;
}

const RAD = 180 / Math.PI;

export class CreatureModel {
  readonly root = new Entity('creature');
  readonly joints: JointRef[] = [];
  readonly species: SpeciesDefinition;

  private readonly device: GraphicsDevice;
  private readonly bodyMaterial: StandardMaterial;
  private readonly glowMaterial: StandardMaterial;
  private readonly eyeMaterial: StandardMaterial;
  private readonly meshes: Mesh[] = [];
  private readonly castShadows: boolean;
  private phase = 0;
  private alertBlend = 0;
  private displayBlend = 0;
  private dazedBlend = 0;

  constructor(
    device: GraphicsDevice,
    species: SpeciesDefinition,
    options: { scale?: number; castShadows?: boolean } = {},
  ) {
    this.device = device;
    this.species = species;
    this.castShadows = options.castShadows ?? false;
    this.root.name = `creature-${species.kind}`;
    const scale = options.scale ?? 1;
    this.root.setLocalScale(scale, scale, scale);

    const palette = species.palette;
    this.bodyMaterial = new StandardMaterial();
    this.bodyMaterial.diffuse = new Color(1, 1, 1);
    this.bodyMaterial.useMetalness = true;
    this.bodyMaterial.metalness = species.kind === 'drifter' ? 0.22 : 0.34;
    this.bodyMaterial.gloss = species.kind === 'grazer' ? 0.34 : 0.52;
    this.bodyMaterial.useFog = true;
    this.bodyMaterial.update();

    this.glowMaterial = new StandardMaterial();
    this.glowMaterial.diffuse = new Color(0.01, 0.02, 0.02);
    this.glowMaterial.emissive = new Color(palette.glow[0], palette.glow[1], palette.glow[2]);
    this.glowMaterial.emissiveIntensity = 1.4;
    this.glowMaterial.useLighting = false;
    this.glowMaterial.useFog = true;
    this.glowMaterial.update();

    this.eyeMaterial = new StandardMaterial();
    this.eyeMaterial.diffuse = new Color(0.02, 0.02, 0.02);
    this.eyeMaterial.emissive = new Color(palette.eye[0], palette.eye[1], palette.eye[2]);
    this.eyeMaterial.emissiveIntensity = 2.2;
    this.eyeMaterial.useLighting = false;
    this.eyeMaterial.useFog = true;
    this.eyeMaterial.update();

    switch (species.kind) {
      case 'scuttler':
        this.buildScuttler();
        break;
      case 'grazer':
        this.buildGrazer();
        break;
      case 'drifter':
        this.buildDrifter();
        break;
      default:
        this.buildWarden();
        break;
    }
  }

  /* ------------------------------- materials ---------------------------- */

  private paletteColor(key: keyof SpeciesDefinition['palette']): [number, number, number] {
    return this.species.palette[key];
  }

  private part(
    name: string,
    parent: Entity,
    pivot: [number, number, number],
    bodyBuild: (data: MeshData) => void,
    glowBuild?: (data: MeshData) => void,
    role: RigRole = 'body',
    side: -1 | 0 | 1 = 0,
    phase = 0,
  ): JointRef {
    const entity = new Entity(name);
    entity.setLocalPosition(pivot[0], pivot[1], pivot[2]);
    parent.addChild(entity);
    const instances: MeshInstance[] = [];
    const body = mesh();
    bodyBuild(body);
    if (body.positions.length > 0) {
      const geometry = buildMesh(this.device, body, `${this.species.kind}-${name}`);
      this.meshes.push(geometry);
      const instance = new MeshInstance(geometry, this.bodyMaterial);
      instance.castShadows = this.castShadows;
      instances.push(instance);
    }
    if (glowBuild) {
      const glow = mesh();
      glowBuild(glow);
      if (glow.positions.length > 0) {
        const geometry = buildMesh(this.device, glow, `${this.species.kind}-${name}-glow`);
        this.meshes.push(geometry);
        const instance = new MeshInstance(geometry, this.glowMaterial);
        instance.castShadows = false;
        instances.push(instance);
      }
    }
    if (instances.length > 0) {
      entity.addComponent('render');
      entity.render!.meshInstances = instances;
      entity.render!.castShadows = this.castShadows;
    }
    const ref: JointRef = {
      name,
      entity,
      role,
      side,
      phase,
      base: [...pivot],
      index: this.joints.length,
    };
    this.joints.push(ref);
    return ref;
  }

  private rootPart(
    name: string,
    pivot: [number, number, number],
    bodyBuild: (data: MeshData) => void,
    glowBuild?: (data: MeshData) => void,
    role: RigRole = 'body',
  ): JointRef {
    return this.part(name, this.root, pivot, bodyBuild, glowBuild, role);
  }

  /* --------------------------------- rigs ------------------------------- */

  private buildScuttler(): void {
    const plate = this.paletteColor('plate');
    const dark = this.paletteColor('dark');
    const joint = this.paletteColor('joint');
    const glow = this.paletteColor('glow');
    const eye = this.paletteColor('eye');

    const body = this.rootPart(
      'body',
      [0, 0.52, 0],
      (d) => {
        addBox(d, [0, 0, 0], [0.46, 0.24, 0.64], plate);
        addBox(d, [0, -0.13, 0.02], [0.36, 0.12, 0.5], dark);
        addBox(d, [0, 0.15, -0.04], [0.34, 0.06, 0.42], joint);
        for (let i = -1; i <= 1; i += 1) {
          addBox(d, [0, 0.19, -0.1 + i * 0.12], [0.3, 0.04, 0.05], dark);
        }
        addBox(d, [0.235, -0.02, 0], [0.04, 0.1, 0.5], joint);
        addBox(d, [-0.235, -0.02, 0], [0.04, 0.1, 0.5], joint);
        addCylinder(d, [0.15, 0.18, -0.3], [0.15, 0.33, -0.34], 0.035, joint, 6);
        addCylinder(d, [-0.15, 0.18, -0.3], [-0.15, 0.33, -0.34], 0.035, joint, 6);
        addBox(d, [0, 0.22, 0.05], [0.22, 0.03, 0.22], dark);
        for (let i = -1; i <= 1; i += 1) {
          addSphere(d, [0.24, 0.05, i * 0.18], 0.018, joint, 5, 3);
          addSphere(d, [-0.24, 0.05, i * 0.18], 0.018, joint, 5, 3);
        }
      },
      (d) => {
        addBox(d, [0, -0.2, 0.06], [0.16, 0.03, 0.3], glow);
        addBox(d, [0.225, 0, -0.18], [0.02, 0.05, 0.1], glow);
        addBox(d, [-0.225, 0, -0.18], [0.02, 0.05, 0.1], glow);
      },
    );

    const head = this.part(
      'head',
      body.entity,
      [0, 0.06, 0.34],
      (d) => {
        addBox(d, [0, 0.04, 0.06], [0.3, 0.18, 0.32], plate);
        addBox(d, [0, -0.04, 0.18], [0.22, 0.08, 0.14], dark);
        addCylinder(d, [0.1, 0.06, 0.14], [0.17, 0.14, 0.04], 0.02, joint, 5);
        addCylinder(d, [-0.1, 0.06, 0.14], [-0.17, 0.14, 0.04], 0.02, joint, 5);
        addBox(d, [0, 0.13, -0.02], [0.2, 0.03, 0.24], joint);
      },
      (d) => {
        addSphere(d, [0.085, 0.04, 0.22], 0.032, eye, 8, 5);
        addSphere(d, [-0.085, 0.04, 0.22], 0.032, eye, 8, 5);
        addBox(d, [0, 0.08, 0.215], [0.14, 0.012, 0.012], eye);
      },
      'head',
    );

    this.part(
      'jaw',
      head.entity,
      [0, -0.08, 0.18],
      (d) => {
        addBox(d, [0, -0.02, 0.08], [0.18, 0.06, 0.2], dark);
        addBox(d, [0.07, 0.01, 0.16], [0.03, 0.04, 0.06], joint);
        addBox(d, [-0.07, 0.01, 0.16], [0.03, 0.04, 0.06], joint);
      },
      undefined,
      'jaw',
    );

    for (const side of [-1, 1] as const) {
      this.part(
        `antenna-${side < 0 ? 'l' : 'r'}`,
        head.entity,
        [side * 0.1, 0.12, 0.14],
        (d) => addCylinder(d, [0, 0, 0], [side * 0.06, 0.26, 0.08], 0.012, joint, 5),
        (d) => addSphere(d, [side * 0.06, 0.26, 0.08], 0.022, eye, 6, 4),
        'antenna',
        side,
        side < 0 ? 0.4 : 1.9,
      );

      this.part(
        `vane-${side < 0 ? 'l' : 'r'}`,
        body.entity,
        [side * 0.24, 0.16, -0.06],
        (d) => {
          addBox(d, [side * 0.1, 0.1, 0], [0.2, 0.02, 0.32], plate);
          addBox(d, [side * 0.02, 0.1, 0], [0.03, 0.05, 0.3], joint);
          addBox(d, [side * 0.19, 0.1, 0], [0.02, 0.04, 0.28], dark);
        },
        (d) => addBox(d, [side * 0.1, 0.115, 0], [0.16, 0.012, 0.26], glow),
        'vane',
        side,
      );
    }

    this.part(
      'tail',
      body.entity,
      [0, 0.02, -0.32],
      (d) => {
        addCylinder(d, [0, 0, 0], [0, -0.04, -0.32], 0.03, joint, 6);
        addBox(d, [0, -0.03, -0.4], [0.02, 0.12, 0.18], plate);
        addBox(d, [0, -0.03, -0.48], [0.14, 0.02, 0.1], dark);
      },
      (d) => addBox(d, [0, -0.03, -0.4], [0.012, 0.08, 0.12], glow),
      'tail',
    );

    const legConfig = [
      { index: 1, z: 0.2, phase: 0 },
      { index: 2, z: 0, phase: Math.PI },
      { index: 3, z: -0.2, phase: 0 },
    ];
    for (const side of [-1, 1] as const) {
      for (const config of legConfig) {
        this.part(
          `leg-${side < 0 ? 'l' : 'r'}${config.index}`,
          body.entity,
          [side * 0.27, 0.02, config.z],
          (d) => {
            addSphere(d, [0, 0, 0], 0.06, joint, 8, 5);
            addCylinder(d, [0, 0, 0], [side * 0.2, -0.28, 0.02], 0.045, joint, 7);
            addSphere(d, [side * 0.2, -0.28, 0.02], 0.048, dark, 8, 4);
            addCylinder(d, [side * 0.2, -0.28, 0.02], [side * 0.24, -0.5, 0.06], 0.032, dark, 6);
            addBox(d, [side * 0.24, -0.53, 0.1], [0.09, 0.05, 0.17], plate);
            addBox(d, [side * 0.24, -0.545, 0.16], [0.06, 0.03, 0.05], joint);
          },
          undefined,
          'leg',
          side,
          config.phase,
        );
      }
    }
  }

  private buildGrazer(): void {
    const plate = this.paletteColor('plate');
    const dark = this.paletteColor('dark');
    const joint = this.paletteColor('joint');
    const glow = this.paletteColor('glow');
    const eye = this.paletteColor('eye');

    const hips = this.rootPart(
      'hips',
      [0, 2.75, 0],
      (d) => {
        addBox(d, [0, 0, 0], [1.5, 0.6, 1.3], dark);
        addBox(d, [0, 0.2, 0.1], [1.1, 0.3, 1.0], plate);
        addCylinder(d, [0.7, 0, 0], [0.7, 0, 1.0], 0.18, joint, 8);
        addCylinder(d, [-0.7, 0, 0], [-0.7, 0, 1.0], 0.18, joint, 8);
      },
    );

    const body = this.part(
      'body',
      hips.entity,
      [0, 0, 0],
      (d) => {
        addBox(d, [0, 0.4, 0.1], [1.9, 1.3, 3.0], plate);
        addBox(d, [0, 1.02, 0], [1.6, 0.22, 2.4], dark);
        addBox(d, [0, 0.05, 0.2], [2.0, 0.35, 2.2], dark);
        for (let i = -2; i <= 2; i += 1) {
          addBox(d, [0, 1.16, i * 0.48], [1.45, 0.16, 0.18], joint);
          addBox(d, [0.98, 0.55, i * 0.4], [0.14, 0.7, 0.1], joint);
          addBox(d, [-0.98, 0.55, i * 0.4], [0.14, 0.7, 0.1], joint);
        }
        addBox(d, [0.86, 0.95, 1.25], [0.44, 0.3, 0.6], plate);
        addBox(d, [-0.86, 0.95, 1.25], [0.44, 0.3, 0.6], plate);
        addCylinder(d, [0.3, 1.2, -1.2], [0.3, 1.35, -0.2], 0.06, dark, 6);
        addCylinder(d, [-0.3, 1.2, -1.2], [-0.3, 1.35, -0.2], 0.06, dark, 6);
        addBox(d, [0, 0.35, -1.5], [1.2, 0.8, 0.3], dark);
        for (let i = -2; i <= 2; i += 1) {
          addSphere(d, [0.72, 0.98, i * 0.5], 0.04, joint, 5, 3);
          addSphere(d, [-0.72, 0.98, i * 0.5], 0.04, joint, 5, 3);
        }
      },
      (d) => {
        addBox(d, [0.86, 0.2, -0.9], [0.18, 0.35, 0.6], glow);
        addBox(d, [-0.86, 0.2, -0.9], [0.18, 0.35, 0.6], glow);
        addBox(d, [0, 0.22, -1.66], [0.7, 0.4, 0.06], glow);
        addBox(d, [0, 1.2, 0.2], [0.5, 0.03, 0.9], glow);
      },
    );

    const neck1 = this.part(
      'neck-1',
      body.entity,
      [0, 0.85, 1.55],
      (d) => {
        addCylinder(d, [0, 0, 0], [0, 0.8, 0.65], 0.3, plate, 9, 0.24);
        addCylinder(d, [0.22, 0.2, 0.15], [0.22, 0.62, 0.55], 0.08, joint, 6);
        addCylinder(d, [-0.22, 0.2, 0.15], [-0.22, 0.62, 0.55], 0.08, joint, 6);
      },
    );
    const neck2 = this.part(
      'neck-2',
      neck1.entity,
      [0, 0.9, 0.72],
      (d) => {
        addCylinder(d, [0, 0, 0], [0, 0.7, 0.55], 0.25, plate, 9, 0.2);
        addBox(d, [0, 0.35, 0.24], [0.34, 0.2, 0.1], joint);
      },
      (d) => addBox(d, [0, 0.3, 0.27], [0.16, 0.03, 0.04], glow),
    );

    const head = this.part(
      'head',
      neck2.entity,
      [0, 0.8, 0.6],
      (d) => {
        addBox(d, [0, 0.06, 0.18], [0.66, 0.48, 0.9], plate);
        addBox(d, [0, 0.28, 0.12], [0.5, 0.14, 0.7], joint);
        addBox(d, [0, -0.12, 0.3], [0.5, 0.16, 0.5], dark);
        addCone(d, [0, 0.36, 0.55], [0, 0.5, 0.72], 0.14, joint, 6);
        addBox(d, [0.31, 0.1, 0.2], [0.08, 0.2, 0.4], dark);
        addBox(d, [-0.31, 0.1, 0.2], [0.08, 0.2, 0.4], dark);
      },
      (d) => {
        addSphere(d, [0.2, 0.1, 0.5], 0.07, eye, 8, 5);
        addSphere(d, [-0.2, 0.1, 0.5], 0.07, eye, 8, 5);
        addBox(d, [0, 0.2, 0.56], [0.4, 0.025, 0.03], glow);
      },
      'head',
    );

    this.part(
      'jaw',
      head.entity,
      [0, -0.18, 0.45],
      (d) => {
        addBox(d, [0, -0.05, 0.15], [0.48, 0.16, 0.62], dark);
        addBox(d, [0.16, 0.02, 0.42], [0.06, 0.08, 0.12], joint);
        addBox(d, [-0.16, 0.02, 0.42], [0.06, 0.08, 0.12], joint);
      },
      undefined,
      'jaw',
    );

    let tailParent: Entity = body.entity;
    const tailPivots: Array<[number, number, number]> = [
      [0, 0.45, -1.7],
      [0, 0, -1.25],
      [0, 0, -1.15],
    ];
    const tailLengths = [1.2, 1.1, 1.0];
    tailPivots.forEach((pivot, index) => {
      const ref = this.part(
        `tail-${index + 1}`,
        tailParent,
        pivot,
        (d) => {
          const length = tailLengths[index];
          addCylinder(d, [0, 0, 0], [0, 0, -length], 0.26 - index * 0.06, plate, 8, 0.2 - index * 0.05);
          addBox(d, [0, 0.2, -length * 0.5], [0.12, 0.28, length * 0.6], joint);
          if (index === 2) {
            addBox(d, [0, 0.28, -length * 0.8], [0.5, 0.06, 0.4], dark);
          }
        },
        index === 1 ? (d) => addBox(d, [0, 0.21, -lengthHalf(1)], [0.06, 0.16, 0.7], glow) : undefined,
        'tail',
        0,
        index * 0.6,
      );
      tailParent = ref.entity;
    });

    const legConfigs: Array<{ name: string; x: number; z: number; phase: number }> = [
      { name: 'fl', x: -1, z: 1.35, phase: 0 },
      { name: 'fr', x: 1, z: 1.35, phase: Math.PI },
      { name: 'bl', x: -1, z: -1.35, phase: Math.PI },
      { name: 'br', x: 1, z: -1.35, phase: 0 },
    ];
    for (const leg of legConfigs) {
      const side = leg.x < 0 ? -1 : 1;
      const upper = this.part(
        `leg-${leg.name}-upper`,
        body.entity,
        [leg.x * 0.92, -0.22, leg.z],
        (d) => {
          addSphere(d, [0, 0, 0], 0.3, joint, 8, 5);
          addCylinder(d, [0, 0, 0], [0, -1.25, 0], 0.3, plate, 9, 0.2);
          addCylinder(d, [side * 0.2, -0.2, 0], [side * 0.26, -0.9, 0], 0.07, dark, 6);
        },
        undefined,
        'leg',
        side,
        leg.phase,
      );
      this.part(
        `leg-${leg.name}-lower`,
        upper.entity,
        [0, -1.25, 0],
        (d) => {
          addSphere(d, [0, 0, 0], 0.22, dark, 8, 5);
          addCylinder(d, [0, 0, 0], [0, -1.28, 0], 0.19, plate, 9, 0.16);
          addBox(d, [0, -1.3, 0.12], [0.34, 0.12, 0.44], dark);
          addBox(d, [0, -1.36, 0.28], [0.26, 0.06, 0.14], joint);
        },
        undefined,
        'shin',
        side,
        leg.phase,
      );
    }
  }

  private buildDrifter(): void {
    const plate = this.paletteColor('plate');
    const dark = this.paletteColor('dark');
    const joint = this.paletteColor('joint');
    const glow = this.paletteColor('glow');
    const eye = this.paletteColor('eye');

    const body = this.rootPart(
      'body',
      [0, 0, 0],
      (d) => {
        addBox(d, [0, 0, 0.05], [0.56, 0.3, 1.0], plate);
        addCone(d, [0, 0, 0.55], [0, 0.02, 0.95], 0.24, plate, 8);
        addBox(d, [0, 0.16, -0.1], [0.34, 0.1, 0.5], joint);
        addBox(d, [0, -0.14, 0.1], [0.3, 0.06, 0.6], dark);
        addBox(d, [0.26, 0, -0.2], [0.08, 0.18, 0.4], dark);
        addBox(d, [-0.26, 0, -0.2], [0.08, 0.18, 0.4], dark);
        addCylinder(d, [0, -0.1, -0.45], [0, -0.1, -0.7], 0.06, joint, 6);
      },
      (d) => {
        addSphere(d, [0, -0.17, 0.05], 0.16, glow, 10, 6);
        addBox(d, [0, 0.17, -0.1], [0.2, 0.02, 0.3], glow);
      },
    );

    const head = this.part(
      'head',
      body.entity,
      [0, 0.16, 0.58],
      (d) => {
        addSphere(d, [0, 0.02, 0.08], 0.2, plate, 10, 6);
        addCylinder(d, [0, 0.02, 0.16], [0, 0.02, 0.3], 0.1, dark, 8);
        addBox(d, [0, 0.18, 0.02], [0.24, 0.05, 0.2], joint);
        addCylinder(d, [0, -0.1, 0.1], [0, -0.18, 0.24], 0.04, joint, 6);
      },
      (d) => {
        addSphere(d, [0, 0.03, 0.31], 0.075, eye, 8, 5);
        addRing(d, [0, 0.03, 0.3], 0.11, 0.012, glow, 12, 3);
      },
      'head',
    );

    for (const side of [-1, 1] as const) {
      const wing = this.part(
        `wing-${side < 0 ? 'l' : 'r'}-1`,
        body.entity,
        [side * 0.3, 0.1, 0.02],
        (d) => {
          addCylinder(d, [0, 0, 0], [side * 0.9, 0.05, 0.02], 0.045, joint, 6);
          addBox(d, [side * 0.45, 0.02, 0.02], [0.9, 0.025, 0.34], plate);
          addBox(d, [side * 0.45, 0.04, 0.16], [0.86, 0.02, 0.04], dark);
          addBox(d, [side * 0.2, 0.03, 0.02], [0.1, 0.05, 0.3], joint);
        },
        (d) => addBox(d, [side * 0.7, 0.05, 0.02], [0.16, 0.012, 0.2], glow),
        'wing',
        side,
      );
      this.part(
        `wing-${side < 0 ? 'l' : 'r'}-2`,
        wing.entity,
        [side * 0.9, 0.05, 0.02],
        (d) => {
          addCylinder(d, [0, 0, 0], [side * 0.85, 0.02, 0.0], 0.03, joint, 6);
          addBox(d, [side * 0.44, 0.01, 0.0], [0.86, 0.02, 0.26], plate);
          addBox(d, [side * 0.8, 0.0, 0.0], [0.1, 0.03, 0.18], dark);
        },
        (d) => addBox(d, [side * 0.6, 0.025, 0.0], [0.2, 0.012, 0.14], glow),
        'wingtip',
        side,
      );
    }

    this.part(
      'tail-1',
      body.entity,
      [0, 0.02, -0.55],
      (d) => {
        addCylinder(d, [0, 0, 0], [0, 0, -0.5], 0.04, joint, 6);
        addBox(d, [0, 0.04, -0.35], [0.05, 0.3, 0.4], plate);
      },
      (d) => addBox(d, [0, 0.1, -0.34], [0.012, 0.14, 0.3], glow),
      'tail',
    );
    this.part(
      'tail-2',
      this.joints[this.joints.length - 1].entity,
      [0, 0, -0.5],
      (d) => {
        addCylinder(d, [0, 0, 0], [0, 0, -0.45], 0.03, joint, 6);
        addBox(d, [0, 0.06, -0.3], [0.04, 0.4, 0.34], dark);
        addBox(d, [0, 0.1, -0.48], [0.16, 0.04, 0.2], plate);
      },
      undefined,
      'tail',
      0,
      0.7,
    );

    this.part(
      'ring',
      body.entity,
      [0, -0.24, 0],
      (d) => addRing(d, [0, 0, 0], 0.34, 0.022, joint, 18, 4),
      (d) => addRing(d, [0, 0, 0], 0.42, 0.012, glow, 20, 3),
      'ring',
    );

    void head;
  }

  private buildWarden(): void {
    const plate = this.paletteColor('plate');
    const dark = this.paletteColor('dark');
    const joint = this.paletteColor('joint');
    const glow = this.paletteColor('glow');
    const eye = this.paletteColor('eye');

    const hips = this.rootPart(
      'hips',
      [0, 1.72, 0],
      (d) => {
        addBox(d, [0, 0, 0], [0.92, 0.42, 0.62], dark);
        addBox(d, [0, 0.2, 0], [0.72, 0.18, 0.5], plate);
        addCylinder(d, [0, 0.1, 0], [0, 0.34, 0], 0.22, joint, 8);
      },
      (d) => addBox(d, [0, 0.1, 0.3], [0.3, 0.08, 0.03], glow),
    );

    const torso = this.part(
      'torso',
      hips.entity,
      [0, 0.42, 0],
      (d) => {
        addBox(d, [0, 0.4, 0], [1.2, 1.0, 0.78], plate);
        addBox(d, [0, 0.44, 0.34], [0.9, 0.7, 0.18], dark);
        addBox(d, [0, 0.86, 0], [1.34, 0.22, 0.9], joint);
        addBox(d, [0.56, 0.84, 0], [0.28, 0.28, 0.56], plate);
        addBox(d, [-0.56, 0.84, 0], [0.28, 0.28, 0.56], plate);
        for (let i = -1; i <= 1; i += 1) {
          addBox(d, [0, 0.16 + i * 0.24, 0.37], [0.66, 0.12, 0.08], plate);
        }
        addCylinder(d, [0.3, 0.1, -0.36], [0.3, 0.72, -0.36], 0.06, joint, 6);
        addCylinder(d, [-0.3, 0.1, -0.36], [-0.3, 0.72, -0.36], 0.06, joint, 6);
        for (const x of [-0.42, 0.42]) {
          for (const y of [0.2, 0.62]) {
            addSphere(d, [x, y, 0.4], 0.025, joint, 5, 3);
          }
        }
      },
      (d) => {
        addBox(d, [0, 0.5, 0.44], [0.34, 0.34, 0.03], glow);
        addBox(d, [0.3, 0.16, 0.44], [0.16, 0.04, 0.03], glow);
        addBox(d, [-0.3, 0.16, 0.44], [0.16, 0.04, 0.03], glow);
      },
    );

    this.part(
      'pack',
      torso.entity,
      [0, 0.5, -0.45],
      (d) => {
        addBox(d, [0, 0, 0], [0.72, 0.7, 0.32], dark);
        addCylinder(d, [0.2, -0.3, 0.0], [0.2, 0.34, 0.0], 0.07, joint, 6);
        addCylinder(d, [-0.2, -0.3, 0.0], [-0.2, 0.34, 0.0], 0.07, joint, 6);
        addBox(d, [0, 0.36, 0.0], [0.6, 0.08, 0.24], plate);
      },
      (d) => {
        addBox(d, [0, 0, -0.18], [0.4, 0.3, 0.02], glow);
        addBox(d, [0.2, 0.36, 0.0], [0.16, 0.02, 0.16], glow);
        addBox(d, [-0.2, 0.36, 0.0], [0.16, 0.02, 0.16], glow);
      },
      'pack',
    );

    const head = this.part(
      'head',
      torso.entity,
      [0, 1.0, 0],
      (d) => {
        addCylinder(d, [0, 0, 0], [0, 0.16, 0], 0.16, joint, 8);
        addBox(d, [0, 0.32, 0.04], [0.52, 0.4, 0.56], plate);
        addBox(d, [0, 0.32, 0.33], [0.42, 0.18, 0.08], dark);
        addBox(d, [0, 0.54, 0.02], [0.2, 0.1, 0.46], joint);
        addBox(d, [0.27, 0.34, 0.0], [0.06, 0.24, 0.4], dark);
        addBox(d, [-0.27, 0.34, 0.0], [0.06, 0.24, 0.4], dark);
      },
      (d) => {
        addBox(d, [0, 0.32, 0.38], [0.34, 0.06, 0.02], eye);
        addSphere(d, [0.16, 0.3, 0.36], 0.04, eye, 6, 4);
        addSphere(d, [-0.16, 0.3, 0.36], 0.04, eye, 6, 4);
      },
      'head',
    );

    const armParts: Record<string, Entity> = {};
    for (const side of [-1, 1] as const) {
      const upper = this.part(
        `arm-${side < 0 ? 'l' : 'r'}-upper`,
        torso.entity,
        [side * 0.62, 0.78, 0],
        (d) => {
          addSphere(d, [0, 0, 0], 0.24, joint, 8, 5);
          addCylinder(d, [0, 0, 0], [0, -0.78, 0], 0.17, plate, 8, 0.14);
          addBox(d, [side * 0.14, -0.34, 0], [0.08, 0.5, 0.3], dark);
        },
        undefined,
        'arm',
        side,
      );
      armParts[side < 0 ? 'l' : 'r'] = upper.entity;
      const lower = this.part(
        `arm-${side < 0 ? 'l' : 'r'}-lower`,
        upper.entity,
        [0, -0.78, 0],
        (d) => {
          addSphere(d, [0, 0, 0], 0.15, dark, 8, 5);
          addCylinder(d, [0, 0, 0], [0, -0.68, 0], 0.14, plate, 8, 0.12);
          addBox(d, [0, -0.62, 0.04], [0.22, 0.2, 0.24], joint);
        },
        undefined,
        'forearm',
        side,
      );
      armParts[side < 0 ? 'l' : 'r'] = lower.entity;
    }

    this.part(
      'shield',
      armParts.l,
      [0.08, -0.58, 0.16],
      (d) => {
        addBox(d, [0, 0, 0.08], [0.96, 1.1, 0.12], plate);
        addBox(d, [0, 0.48, 0.1], [0.7, 0.2, 0.16], joint);
        addBox(d, [0, -0.5, 0.1], [0.7, 0.16, 0.16], dark);
        addCylinder(d, [0.42, 0.42, 0.08], [0.42, -0.42, 0.08], 0.05, joint, 6);
        addCylinder(d, [-0.42, 0.42, 0.08], [-0.42, -0.42, 0.08], 0.05, joint, 6);
        for (let i = -2; i <= 2; i += 1) {
          addSphere(d, [i * 0.17, 0.52, 0.16], 0.022, joint, 5, 3);
        }
      },
      (d) => {
        addRing(d, [0, 0, 0.15], 0.28, 0.02, glow, 16, 4);
        addBox(d, [0, 0, 0.15], [0.16, 0.16, 0.02], glow);
      },
      'shield',
      -1,
    );

    this.part(
      'pike',
      armParts.r,
      [-0.05, -0.7, 0.1],
      (d) => {
        addCylinder(d, [0, 0, -0.6], [0, 0.55, 2.1], 0.05, dark, 6);
        addCone(d, [0, 0.55, 2.1], [0, 0.7, 2.6], 0.11, joint, 6);
        addBox(d, [0, 0.1, 0.1], [0.18, 0.16, 0.5], plate);
      },
      (d) => addBox(d, [0, 0.55, 2.1], [0.05, 0.05, 0.2], glow),
      'pike',
      1,
    );

    for (const side of [-1, 1] as const) {
      const upper = this.part(
        `leg-${side < 0 ? 'l' : 'r'}-upper`,
        hips.entity,
        [side * 0.34, -0.18, 0],
        (d) => {
          addSphere(d, [0, 0, 0], 0.2, joint, 8, 5);
          addCylinder(d, [0, 0, 0], [0, -0.86, 0], 0.18, plate, 8, 0.14);
          addBox(d, [side * 0.14, -0.4, 0.14], [0.08, 0.5, 0.12], dark);
        },
        undefined,
        'leg',
        side,
        side < 0 ? 0 : Math.PI,
      );
      this.part(
        `leg-${side < 0 ? 'l' : 'r'}-lower`,
        upper.entity,
        [0, -0.86, 0],
        (d) => {
          addSphere(d, [0, 0, 0], 0.15, dark, 8, 4);
          addCylinder(d, [0, 0, 0], [0, -0.68, 0], 0.14, plate, 8, 0.12);
          addBox(d, [0, -0.7, 0.14], [0.3, 0.14, 0.46], dark);
          addBox(d, [0, -0.76, 0.3], [0.24, 0.06, 0.14], joint);
        },
        undefined,
        'shin',
        side,
        side < 0 ? 0 : Math.PI,
      );
    }

    void head;
  }

  /* ------------------------------ animation ----------------------------- */

  update(motion: CreatureMotion): void {
    const dt = Math.max(0.0001, motion.dt);
    const walk = this.species.motion.walkSpeed;
    const speedFactor = clamp(motion.speed / Math.max(0.2, walk), 0, 2.2);
    const moving = motion.speed > 0.08;
    this.phase += dt * (moving ? 2.6 + motion.speed * this.species.motion.stride : 0.7);
    this.alertBlend = damp(this.alertBlend, motion.alert ? 1 : 0, 3.5, dt);
    this.displayBlend = damp(this.displayBlend, motion.state === 'display' ? 1 : 0, 4.2, dt);
    this.dazedBlend = damp(this.dazedBlend, motion.dazed ? 1 : 0, 7, dt);

    const time = motion.time;
    const walkAmp = Math.min(1, speedFactor) * (1 - this.dazedBlend * 0.9);
    const dazedWobble = Math.sin(time * 17) * 0.08 * this.dazedBlend;

    for (const joint of this.joints) {
      const phase = this.phase + joint.phase;
      switch (joint.role) {
        case 'leg': {
          const swing = Math.sin(phase) * 0.42 * walkAmp + dazedWobble;
          const splay = joint.side * 0.04 * walkAmp;
          joint.entity.setLocalEulerAngles(swing * RAD, 0, splay * RAD);
          break;
        }
        case 'shin': {
          const flex = Math.max(0, Math.sin(phase + 0.7)) * 0.5 * walkAmp;
          joint.entity.setLocalEulerAngles(-flex * RAD, 0, 0);
          break;
        }
        case 'arm': {
          const swing = Math.sin(phase + Math.PI) * 0.22 * walkAmp;
          const raise = this.alertBlend * 0.22 + this.displayBlend * 0.5;
          const shieldBonus = joint.side < 0 ? this.alertBlend * 0.3 + this.displayBlend * 0.45 : 0;
          joint.entity.setLocalEulerAngles((-raise - shieldBonus + swing) * RAD, 0, joint.side * 0.05 * RAD);
          break;
        }
        case 'forearm': {
          const bend = 0.08 + Math.max(0, Math.sin(phase)) * 0.12 * walkAmp + this.alertBlend * 0.16;
          joint.entity.setLocalEulerAngles(-bend * RAD, 0, 0);
          break;
        }
        case 'shield': {
          const open = this.alertBlend * 0.12 + this.displayBlend * 0.22;
          joint.entity.setLocalEulerAngles(open * RAD, 0, (-0.05 + open) * RAD);
          break;
        }
        case 'pike': {
          const sway = Math.sin(time * 1.4) * 0.02 + this.alertBlend * 0.18 + this.displayBlend * 0.3;
          joint.entity.setLocalEulerAngles(sway * RAD, 0, 0);
          break;
        }
        case 'wing': {
          const sign = joint.base[0] >= 0 ? 1 : -1;
          const beat = Math.sin(time * this.species.motion.beatRate * Math.PI * 2 + (joint.side < 0 ? 0 : Math.PI * 0.5));
          const glide = 0.12 + walkAmp * 0.28;
          const flap = beat * (0.42 + walkAmp * 0.35) + glide;
          joint.entity.setLocalEulerAngles(0, 0, sign * flap * RAD + motion.bank * 0.3 * RAD);
          break;
        }
        case 'wingtip': {
          const sign = joint.base[0] >= 0 ? 1 : -1;
          const beat = Math.sin(time * this.species.motion.beatRate * Math.PI * 2 - 0.7 + (joint.side < 0 ? 0 : Math.PI * 0.5));
          joint.entity.setLocalEulerAngles(0, 0, sign * beat * 0.32 * RAD + motion.bank * 0.2 * RAD);
          break;
        }
        case 'tail': {
          const sway = Math.sin(time * (1.3 + speedFactor) + joint.index * 0.7) * 0.12;
          joint.entity.setLocalEulerAngles(0, sway * RAD, 0);
          break;
        }
        case 'head': {
          const yaw = clamp(motion.lookYaw, -0.75, 0.75) + Math.sin(time * 0.7) * 0.05;
          // Negative X tips the snout upward, so a target above the head needs
          // a negative pitch.
          const pitch = -clamp(motion.lookPitch, -0.35, 0.4) - this.displayBlend * 0.18;
          joint.entity.setLocalEulerAngles(pitch * RAD, yaw * RAD, 0);
          break;
        }
        case 'neck': {
          const raise = this.displayBlend * 0.22 + Math.sin(time * 0.9) * 0.03;
          joint.entity.setLocalEulerAngles(-raise * RAD, 0, 0);
          break;
        }
        case 'jaw': {
          const open = this.alertBlend * 0.08 + this.displayBlend * 0.22 + Math.max(0, Math.sin(time * 0.8)) * 0.02;
          joint.entity.setLocalEulerAngles(open * RAD, 0, 0);
          break;
        }
        case 'vane': {
          const fold = this.dazedBlend * 0.7 + this.alertBlend * 0.45;
          joint.entity.setLocalEulerAngles(0, 0, joint.side * (fold + Math.sin(time * 2.1 + joint.index) * 0.04) * RAD);
          break;
        }
        case 'antenna': {
          const sway = Math.sin(time * 2.4 + joint.index) * 0.16 + this.alertBlend * 0.1;
          joint.entity.setLocalEulerAngles(sway * RAD, 0, joint.side * sway * 0.6 * RAD);
          break;
        }
        case 'ring': {
          joint.entity.setLocalEulerAngles(0, (time * 70) % 360, 0);
          break;
        }
        case 'body': {
          const bob = Math.sin(this.phase * 2) * 0.018 * walkAmp;
          const pitch = -this.displayBlend * (this.species.kind === 'grazer' ? 9 : 4) + Math.sin(time * 0.8) * 0.4;
          const roll = this.species.kind === 'drifter' ? motion.bank * 0.6 : 0;
          joint.entity.setLocalPosition(joint.base[0], joint.base[1] + bob, joint.base[2]);
          joint.entity.setLocalEulerAngles(pitch * RAD, 0, roll * RAD);
          break;
        }
        default:
          break;
      }
    }

    // Radiators and cores breathe with state; at night the glow leads the eye.
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + this.species.motion.stride);
    const glow = 1.1 + motion.night * 1.9 + this.alertBlend * 0.9 + this.displayBlend * 1.3 + pulse * 0.25 + this.dazedBlend * (0.9 + Math.sin(time * 22) * 0.8);
    this.glowMaterial.emissiveIntensity = glow;
    this.eyeMaterial.emissiveIntensity = 1.9 + motion.night * 1.4 + this.alertBlend * 1.6 + this.displayBlend * 2 + this.dazedBlend * 1.2;
  }

  dispose(): void {
    this.root.destroy();
    for (const geometry of this.meshes) geometry.destroy();
    this.meshes.length = 0;
    this.bodyMaterial.destroy();
    this.glowMaterial.destroy();
    this.eyeMaterial.destroy();
    this.joints.length = 0;
  }
}

/** Small helper kept outside the class so the tail builder reads cleanly. */
function lengthHalf(index: number): number {
  return [0, 0.55, 0.5][index] ?? 0.5;
}
