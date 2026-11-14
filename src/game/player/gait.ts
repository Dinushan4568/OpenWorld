/**
 * Procedural gait synthesis.
 *
 * Pure maths with no engine dependency: given the character's locomotion state
 * it produces target rotations for every joint of the Wayfarer rig. The runtime
 * animator (CharacterModel) damps towards these targets, which is what makes
 * the motion feel continuous even when speed or grounding changes abruptly.
 *
 * All angles are radians. The rig faces +Z, limbs hang along -Y, so:
 *  - positive X rotation swings a limb backwards (-Z),
 *  - negative X rotation swings it forwards (+Z),
 *  - positive Z rotation tips a body part towards -X (the character's left).
 */

export const GAIT_JOINTS = [
  'hips',
  'skirt',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulder_l',
  'shoulder_r',
  'upper_arm_l',
  'upper_arm_r',
  'forearm_l',
  'forearm_r',
  'hand_l',
  'hand_r',
  'thigh_l',
  'thigh_r',
  'shin_l',
  'shin_r',
  'foot_l',
  'foot_r',
  'backpack',
  'cape',
  'cape_tip',
] as const;

export type GaitJoint = (typeof GAIT_JOINTS)[number];

export interface JointPose {
  /** Rotation about X (pitch / limb swing), radians. */
  rx: number;
  /** Rotation about Y (yaw / twist), radians. */
  ry: number;
  /** Rotation about Z (roll / lean), radians. */
  rz: number;
  /** Local position offset from the rest pose, metres. */
  px: number;
  py: number;
  pz: number;
}

export type GaitPose = Record<GaitJoint, JointPose>;

export interface GaitInput {
  /** Planar speed in m/s. */
  speed: number;
  /** Reference speed used to normalise the run blend (usually sprint speed). */
  maxSpeed: number;
  /** Radians, advanced by `advanceGaitPhase`. */
  phase: number;
  /** Seconds since the session started (idle breathing / cloth noise). */
  time: number;
  grounded: boolean;
  verticalVelocity: number;
  /** 0..1 landing impulse envelope, decays in the animator. */
  landing: number;
  /** Yaw rate in rad/s (positive = turning right). */
  turnRate: number;
  wading: boolean;
  sprinting: boolean;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const clamp01 = (value: number): number => clamp(value, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
};

export function createPose(): GaitPose {
  const pose = {} as GaitPose;
  for (const joint of GAIT_JOINTS) {
    pose[joint] = { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 };
  }
  return pose;
}

/**
 * Advance the gait phase for a given planar speed.
 *
 * Cadence is derived from a speed-dependent cycle length rather than a fixed
 * animation rate, so the feet stay planted and the character never moonwalks
 * at low speeds or skates at high speeds.
 */
export function advanceGaitPhase(phase: number, speed: number, sprinting: boolean, dt: number): number {
  const cycleLength = 2.1 + speed * 0.34 + (sprinting ? 0.35 : 0);
  const cyclesPerSecond = speed > 0.05 ? clamp(speed / cycleLength, 0.35, 2.6) : 0;
  return (phase + cyclesPerSecond * Math.PI * 2 * dt) % (Math.PI * 2);
}

export function computeGaitPose(input: GaitInput): GaitPose {
  const pose = createPose();
  const maxSpeed = Math.max(0.1, input.maxSpeed);
  const s01 = clamp01(input.speed / maxSpeed);
  const run = smoothstep(0.3, 0.92, s01);
  const moving = smoothstep(0.4, 1.4, input.speed);
  const idle = 1 - moving;
  const air = input.grounded ? 0 : 1;
  const wading = input.wading ? 1 : 0;
  const sprint = input.sprinting ? 1 : 0;
  const swing = Math.sin(input.phase);
  const double = Math.sin(input.phase * 2);
  const landing = clamp01(input.landing);
  // Positive turn rate = turning right; the body rolls towards +X which is
  // a negative Z rotation for a rig that faces +Z.
  const leanRoll = clamp(input.turnRate * -0.16, -0.22, 0.22);

  /* Breathing and idle life ------------------------------------------------ */
  const breath = Math.sin(input.time * 1.15) * 0.5 + 0.5;
  const idleSway = Math.sin(input.time * 0.32);
  const idleLook = Math.sin(input.time * 0.19) * 0.24 + Math.sin(input.time * 0.07) * 0.1;

  /* Hips ------------------------------------------------------------------ */
  const hipSwing = (0.1 + run * 0.16) * moving;
  const hipYaw = swing * hipSwing;
  const bobAmp = moving * (0.012 + run * 0.026);
  const bob = -Math.abs(Math.cos(input.phase)) * bobAmp + bobAmp * 0.5;
  const hipDrop = -Math.sin(input.phase) * (0.02 + run * 0.055) * moving;

  pose.hips.ry = hipYaw;
  pose.hips.rz = hipDrop * 0.7 + leanRoll * 0.18 + idleSway * 0.012 * idle;
  pose.hips.rx = 0.02 + run * 0.02 + landing * 0.05;
  pose.hips.px = swing * (0.008 + run * 0.012) * moving + idleSway * 0.006 * idle;
  pose.hips.py = bob - landing * 0.075 - wading * 0.01;
  pose.hips.pz = 0;

  /* Skirt / jacket tails ---------------------------------------------------- */
  pose.skirt.rx = 0.05 + run * 0.1 + wading * 0.04 - double * 0.02 * moving;
  pose.skirt.rz = -hipYaw * 0.35;

  /* Spine and chest --------------------------------------------------------- */
  const lean = 0.045 + run * 0.13 + sprint * 0.035 + landing * 0.14 + wading * 0.05;
  pose.spine.rx = lean * 0.45;
  pose.spine.ry = -hipYaw * 0.35;
  pose.spine.rz = hipDrop * 0.35 + leanRoll * 0.3;

  pose.chest.rx = lean * 0.6 + breath * 0.012 * idle;
  pose.chest.ry = -hipYaw * 0.55 + idleLook * 0.16;
  pose.chest.rz = hipDrop * 0.4 + leanRoll * 0.55;
  pose.chest.py = 0;

  /* Neck and head ----------------------------------------------------------- */
  pose.neck.rx = -lean * 0.35;
  pose.neck.ry = hipYaw * 0.15;

  pose.head.rx = -lean * 0.55 + air * 0.06 + Math.sin(input.time * 0.7) * 0.012;
  pose.head.ry = hipYaw * 0.25 - idleLook * 0.3;
  pose.head.rz = -leanRoll * 0.5;
  pose.head.px = 0;
  pose.head.py = Math.sin(input.time * 1.15) * 0.004 * idle;

  /* Shoulders --------------------------------------------------------------- */
  const shoulderLift = 0.015 + breath * 0.012 + run * 0.03;
  for (const side of ['l', 'r'] as const) {
    const sign = side === 'l' ? -1 : 1;
    const joint = `shoulder_${side}` as GaitJoint;
    pose[joint].rz = sign * shoulderLift;
    pose[joint].rx = -shoulderLift * 0.4;
  }

  /* Arms ------------------------------------------------------------------- */
  const armAmp = (0.2 + run * 0.34) * moving;
  const armOut = 0.1 + run * 0.04 + air * 0.28 + landing * 0.12 + wading * 0.08;
  const armL = swing * armAmp;
  pose.upper_arm_l.rx = armL - air * 0.22 + landing * 0.1;
  pose.upper_arm_r.rx = -armL - air * 0.22 + landing * 0.1;
  pose.upper_arm_l.rz = -armOut - leanRoll * 0.2;
  pose.upper_arm_r.rz = armOut - leanRoll * 0.2;
  pose.upper_arm_l.ry = 0.08 + run * 0.05;
  pose.upper_arm_r.ry = -0.08 - run * 0.05;

  const elbow = 0.2 + run * 0.5 + sprint * 0.08 + air * 0.32 + landing * 0.2;
  pose.forearm_l.rx = -elbow + Math.max(0, -armL) * 0.25;
  pose.forearm_r.rx = -elbow + Math.max(0, armL) * 0.25;
  pose.forearm_l.rz = 0.03;
  pose.forearm_r.rz = -0.03;

  pose.hand_l.rx = -0.05;
  pose.hand_r.rx = -0.05;
  pose.hand_l.rz = 0.04;
  pose.hand_r.rz = -0.04;

  /* Legs ------------------------------------------------------------------- */
  const thighAmp = (0.26 + run * 0.4) * moving;
  const kneeBase = 0.08 + run * 0.04;
  const kneeAmp = (0.45 + run * 0.75) * moving;

  const thighL = -swing * thighAmp;
  const thighR = swing * thighAmp;
  pose.thigh_l.rx = lerp(thighL, -0.52, air) + landing * 0.28;
  pose.thigh_r.rx = lerp(thighR, 0.02, air) + landing * 0.2;
  pose.thigh_l.rz = -0.015;
  pose.thigh_r.rz = 0.015;

  // The swing leg bends its knee; the planted leg stays comparatively straight.
  const swingKneeL = Math.max(0, Math.sin(input.phase + 0.7));
  const swingKneeR = Math.max(0, Math.sin(input.phase + Math.PI + 0.7));
  pose.shin_l.rx = lerp(kneeBase + swingKneeL * kneeAmp + wading * 0.28, 0.85 + landing * 0.45, air);
  pose.shin_r.rx = lerp(kneeBase + swingKneeR * kneeAmp + wading * 0.28, 0.42 + landing * 0.35, air);
  pose.shin_l.rz = 0;
  pose.shin_r.rz = 0;

  // Ankles roll through heel-strike and toe-off.
  const ankleWave = Math.sin(input.phase + 1.05);
  pose.foot_l.rx = -swing * 0.12 + ankleWave * (0.08 + run * 0.12) - 0.02;
  pose.foot_r.rx = swing * 0.12 - ankleWave * (0.08 + run * 0.12) - 0.02;
  pose.foot_l.rx = lerp(pose.foot_l.rx, -0.22, air);
  pose.foot_r.rx = lerp(pose.foot_r.rx, -0.12, air);
  pose.foot_l.rx += landing * 0.18;
  pose.foot_r.rx += landing * 0.18;

  /* Backpack --------------------------------------------------------------- */
  pose.backpack.py = double * 0.006 * moving - landing * 0.012;
  pose.backpack.rx = -run * 0.03 + landing * 0.04;

  /* Cloak ------------------------------------------------------------------ */
  const wind = 0.05 + Math.sin(input.time * 1.7) * 0.035 + Math.sin(input.time * 0.53) * 0.025;
  const trail = 0.08 + s01 * 0.72 + wading * 0.1 + air * 0.22;
  pose.cape.rx = trail + wind + Math.sin(input.phase + 0.6) * 0.03 * moving;
  pose.cape.ry = Math.sin(input.time * 0.9) * 0.04 - hipYaw * 0.25;
  pose.cape.rz = -hipDrop * 0.4;

  pose.cape_tip.rx = pose.cape.rx * 0.45 + wind * 1.6 + Math.sin(input.time * 2.1) * 0.05;
  pose.cape_tip.ry = pose.cape.ry * 0.6;
  pose.cape_tip.rz = pose.cape.rz * 0.7;

  return pose;
}

/** Landing envelope: quick attack, slower release. */
export function decayLanding(landing: number, dt: number): number {
  return clamp01(landing - dt * 2.6);
}
