import { Color, Entity, StandardMaterial, Vec3, type AppBase } from 'playcanvas';
import { PLAYER } from '../config';
import type { AssetManager } from '../core/AssetManager';
import { clamp, damp } from '../util/math';
import {
  GAIT_JOINTS,
  advanceGaitPhase,
  computeGaitPose,
  createPose,
  type GaitJoint,
  type JointPose,
} from './gait';

export interface CharacterUpdateOptions {
  /** 0..1 landing impulse envelope. */
  landing: number;
  /** Yaw rate in rad/s. */
  turnRate: number;
  /** True while the run/sprint input is held. */
  running: boolean;
}

interface JointBinding {
  entity: Entity;
  rest: Vec3;
  current: JointPose;
}

interface EmissiveBinding {
  material: StandardMaterial;
  baseIntensity: number;
  pulse: number;
}

const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * The Wayfarer — the expedition's humanoid character.
 *
 * A jointed, originally authored humanoid model (`wayfarer.glb`) is loaded from
 * the asset pipeline and driven by procedural gait synthesis. Joint rotations
 * are damped rather than snapped, so transitions between idle, walk, run and
 * airborne poses stay smooth. If the model is unavailable the class builds an
 * equivalent primitive rig with the same joint names so animation, collisions
 * and camera framing keep working.
 */
export class CharacterModel {
  readonly root: Entity;
  /** True when the authored GLB rig is in use. */
  readonly usingAsset: boolean;
  readonly jointCount: number;

  private readonly visual: Entity;
  private readonly joints = new Map<GaitJoint, JointBinding>();
  private readonly emissives: EmissiveBinding[] = [];
  private readonly ownedMaterials: StandardMaterial[] = [];
  private phase = 0;
  private clock = 0;

  constructor(app: AppBase, assets?: AssetManager) {
    this.root = new Entity('wayfarer');
    this.visual = new Entity('wayfarer-visual');
    this.root.addChild(this.visual);

    const loaded = assets?.instantiate('wayfarer', { castShadows: true, receiveShadows: true }) ?? null;
    if (loaded) {
      loaded.name = 'wayfarer-model';
      this.visual.addChild(loaded);
      this.prepareLoadedModel(loaded);
      this.bindJoints();
      this.usingAsset = true;
    } else {
      if (assets) {
        console.warn('[character] wayfarer.glb unavailable — using the procedural fallback rig.');
      }
      this.visual.addChild(this.buildFallback());
      this.bindJoints();
      this.usingAsset = false;
    }
    this.jointCount = this.joints.size;
    void app;
  }

  /* ------------------------------------------------------------------ */
  /* Model preparation                                                  */
  /* ------------------------------------------------------------------ */

  private prepareLoadedModel(model: Entity): void {
    for (const render of model.findComponents('render')) {
      render.castShadows = true;
      render.receiveShadows = true;
      const material = render.material as StandardMaterial | null;
      if (!material) continue;
      material.useFog = true;
      const name = material.name.toLowerCase();
      if (name.includes('visor')) {
        material.emissiveIntensity = 2.1;
        material.update();
        this.emissives.push({ material, baseIntensity: 2.1, pulse: 1 });
      } else if (name.includes('bio')) {
        material.emissiveIntensity = 1.7;
        material.update();
        this.emissives.push({ material, baseIntensity: 1.7, pulse: 0.7 });
      }
    }
  }

  private bindJoints(): void {
    for (const joint of GAIT_JOINTS) {
      const entity = this.visual.findByName(joint) as Entity | null;
      if (!entity) continue;
      const rest = entity.getLocalPosition().clone();
      this.joints.set(joint, {
        entity,
        rest,
        current: { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 },
      });
    }
    if (!this.joints.has('hips')) {
      console.warn('[character] rig is missing a "hips" joint; animation will be limited.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Animation                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * @param speed planar speed in m/s
   * @param grounded whether the capsule is supported
   * @param verticalVelocity used to differentiate a jump from a fall
   */
  update(
    dt: number,
    time: number,
    speed: number,
    grounded: boolean,
    verticalVelocity: number,
    wading: boolean,
    options: CharacterUpdateOptions = { landing: 0, turnRate: 0, running: false },
  ): void {
    this.clock += dt;
    const maxSpeed = PLAYER.runSpeed;
    const running = options.running && speed > PLAYER.walkSpeed * 1.05;
    this.phase = advanceGaitPhase(this.phase, speed, running, dt);

    const pose = computeGaitPose({
      speed,
      maxSpeed,
      phase: this.phase,
      time: this.clock,
      grounded,
      verticalVelocity,
      landing: clamp(options.landing, 0, 1),
      turnRate: options.turnRate,
      wading,
      sprinting: running,
    });

    this.applyPose(pose, dt, speed);
    this.updateGauges(dt, time);
  }

  private applyPose(pose: ReturnType<typeof createPose>, dt: number, speed: number): void {
    for (const [joint, binding] of this.joints) {
      const target = pose[joint];
      const current = binding.current;
      const lambda = joint === 'cape' || joint === 'cape_tip' ? 6.5 : joint === 'hips' || joint === 'chest' ? 10 : 16;
      current.rx = damp(current.rx, target.rx, lambda, dt);
      current.ry = damp(current.ry, target.ry, lambda, dt);
      current.rz = damp(current.rz, target.rz, lambda, dt);
      current.px = damp(current.px, target.px, lambda, dt);
      current.py = damp(current.py, target.py, lambda, dt);
      current.pz = damp(current.pz, target.pz, lambda, dt);

      binding.entity.setLocalEulerAngles(
        toDegrees(current.rx),
        toDegrees(current.ry),
        toDegrees(current.rz),
      );
      binding.entity.setLocalPosition(
        binding.rest.x + current.px,
        binding.rest.y + current.py,
        binding.rest.z + current.pz,
      );
    }
    // Subtle whole-body lean into acceleration keeps fast turns readable.
    this.visual.setLocalEulerAngles(0, 0, -clamp(speed * 0.004, 0, 0.03));
  }

  private updateGauges(dt: number, time: number): void {
    for (const entry of this.emissives) {
      const wave = Math.sin(time * 2.3 + entry.pulse * 2) * 0.5 + 0.5;
      entry.material.emissiveIntensity = entry.baseIntensity * (0.82 + wave * 0.28);
    }
    void dt;
  }

  /* ------------------------------------------------------------------ */
  /* Primitive fallback rig                                             */
  /* ------------------------------------------------------------------ */

  private buildFallback(): Entity {
    const root = new Entity('wayfarer-fallback');
    const fabric = this.material('fallback-fabric', new Color(0.055, 0.08, 0.09, 1), 0.05, 0.8);
    const leather = this.material('fallback-leather', new Color(0.16, 0.1, 0.05, 1), 0.1, 0.6);
    const metal = this.material('fallback-metal', new Color(0.24, 0.26, 0.27, 1), 0.8, 0.4);
    const accent = this.material('fallback-accent', new Color(0.5, 0.26, 0.08, 1), 0.4, 0.5);
    const visor = this.material('fallback-visor', new Color(0.02, 0.08, 0.09, 1), 0.9, 0.2, new Color(0.2, 0.8, 0.75), 1.8);

    const pivot = (name: string, parent: Entity, x: number, y: number, z: number): Entity => {
      const entity = new Entity(name);
      entity.setLocalPosition(x, y, z);
      parent.addChild(entity);
      return entity;
    };
    const shape = (
      parent: Entity,
      name: string,
      position: [number, number, number],
      scale: [number, number, number],
      material: StandardMaterial,
      type: 'sphere' | 'box' | 'cylinder' = 'sphere',
    ): Entity => {
      const entity = new Entity(name);
      entity.addComponent('render', { type, material });
      entity.setLocalPosition(...position);
      entity.setLocalScale(...scale);
      entity.render!.castShadows = true;
      entity.render!.receiveShadows = true;
      parent.addChild(entity);
      return entity;
    };

    const hips = pivot('hips', root, 0, 0.96, 0);
    shape(hips, 'pelvis', [0, 0, 0], [0.34, 0.26, 0.24], fabric);
    shape(hips, 'belt', [0, 0.05, 0], [0.36, 0.07, 0.26], leather);

    const spine = pivot('spine', hips, 0, 0.08, 0);
    shape(spine, 'abdomen', [0, 0.09, 0], [0.32, 0.32, 0.22], fabric);

    const chest = pivot('chest', spine, 0, 0.17, 0);
    shape(chest, 'ribcage', [0, 0.11, 0], [0.41, 0.42, 0.28], fabric);
    shape(chest, 'breastplate', [0, 0.13, 0.115], [0.32, 0.26, 0.09], metal);

    const neck = pivot('neck', chest, 0, 0.3, 0);
    shape(neck, 'neckline', [0, 0.05, 0], [0.11, 0.13, 0.12], fabric);

    const head = pivot('head', neck, 0, 0.09, 0);
    shape(head, 'helmet', [0, 0.08, 0], [0.22, 0.24, 0.23], metal);
    shape(head, 'visor', [0, 0.09, 0.09], [0.16, 0.09, 0.06], visor);

    const backpack = pivot('backpack', chest, 0, 0.12, -0.17);
    shape(backpack, 'pack', [0, 0, -0.04], [0.26, 0.3, 0.15], leather);
    shape(backpack, 'canister', [0.1, 0.08, -0.08], [0.07, 0.24, 0.07], metal, 'cylinder');

    const cape = pivot('cape', chest, 0, 0.24, -0.13);
    shape(cape, 'cloak', [0, -0.24, -0.06], [0.38, 0.5, 0.03], fabric);
    const capeTip = pivot('cape_tip', cape, 0, -0.44, 0);
    shape(capeTip, 'cloak-tip', [0, -0.1, -0.055], [0.34, 0.3, 0.03], fabric);

    for (const side of ['l', 'r'] as const) {
      const sign = side === 'l' ? -1 : 1;
      const shoulder = pivot(`shoulder_${side}`, chest, sign * 0.205, 0.235, 0);
      shape(shoulder, 'pauldron', [0, -0.01, 0], [0.17, 0.15, 0.19], metal);

      const upperArm = pivot(`upper_arm_${side}`, shoulder, sign * 0.02, -0.045, 0);
      shape(upperArm, 'upper-arm', [0, -0.13, 0], [0.11, 0.27, 0.11], fabric);
      shape(upperArm, 'armband', [0, -0.19, 0], [0.12, 0.03, 0.12], accent);

      const forearm = pivot(`forearm_${side}`, upperArm, 0, -0.265, 0);
      shape(forearm, 'forearm', [0, -0.12, 0], [0.095, 0.25, 0.095], fabric);
      shape(forearm, 'vambrace', [0, -0.09, 0.03], [0.1, 0.15, 0.06], metal);

      const hand = pivot(`hand_${side}`, forearm, 0, -0.25, 0);
      shape(hand, 'glove', [0, -0.05, 0.01], [0.09, 0.13, 0.08], leather);

      const thigh = pivot(`thigh_${side}`, hips, sign * 0.095, -0.055, 0);
      shape(thigh, 'thigh', [0, -0.2, 0], [0.17, 0.42, 0.17], fabric);
      shape(thigh, 'thigh-guard', [0, -0.1, 0.045], [0.12, 0.26, 0.06], leather);

      const shin = pivot(`shin_${side}`, thigh, 0, -0.415, 0);
      shape(shin, 'shin', [0, -0.19, 0], [0.13, 0.4, 0.13], fabric);
      shape(shin, 'knee', [0, -0.02, 0.04], [0.13, 0.13, 0.09], metal);

      const foot = pivot(`foot_${side}`, shin, 0, -0.375, 0.01);
      shape(foot, 'boot', [0, -0.06, 0.05], [0.13, 0.1, 0.28], leather);
      shape(foot, 'toe', [0, -0.08, 0.12], [0.11, 0.07, 0.12], metal);
    }

    return root;
  }

  private material(
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
    if (emissive) {
      material.emissive = emissive;
      material.emissiveIntensity = emissiveIntensity;
    }
    material.update();
    this.ownedMaterials.push(material);
    return material;
  }

  /* ------------------------------------------------------------------ */

  setVisible(visible: boolean): void {
    this.root.enabled = visible;
  }

  /** Diagnostics for the HUD/automated checks. */
  get animationPhase(): number {
    return this.phase;
  }

  destroy(): void {
    for (const material of this.ownedMaterials) material.destroy();
    this.root.destroy();
  }
}
