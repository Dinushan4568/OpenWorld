/**
 * Capsule locomotion solver.
 *
 * Engine-free and deterministic: the player controller owns a `LocomotionState`
 * and feeds it a `MoveCommand` every frame. The solver handles acceleration,
 * slope rejection, step-ups, wall sliding, jumping with coyote time and input
 * buffering, water drag, the expedition boundary and — critically — guarantees
 * that the character can never end a frame below the walkable surface.
 */
import { PLAYER, WORLD } from '../config';
import { clamp, damp, dampAngle, wrapAngle } from '../util/math';
import type { PushResult } from '../world/collision';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LocomotionState {
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  wading: boolean;
  speed: number;
  heading: number;
  /** Seconds since the character last touched ground. */
  airTime: number;
  /** Remaining jump grace after leaving a ledge. */
  coyote: number;
  /** Remaining buffered jump input. */
  jumpBuffer: number;
  /** 0..1 landing impulse envelope for animation. */
  landing: number;
  /** Yaw rate in rad/s, used for leaning. */
  turnRate: number;
  boundaryCooldown: number;
  /** Extra jumps used since the last grounding (Vault Step). */
  airJumpsUsed: number;
}

export interface MoveCommand {
  /** -1..1 forward axis (positive = away from the camera). */
  forward: number;
  /** -1..1 strafe axis (positive = right). */
  strafe: number;
  /** Camera yaw in radians. */
  yaw: number;
  run: boolean;
  jump: boolean;
}

export interface LocomotionTuning {
  capsuleRadius: number;
  capsuleHeight: number;
  walkSpeed: number;
  runSpeed: number;
  gravity: number;
  jumpVelocity: number;
  maxSlope: number;
  stepHeight: number;
  coyoteTime: number;
  jumpBufferTime: number;
  maxFallSpeed: number;
  groundLambda: number;
  airLambda: number;
  /** Optional unlockable mid-air jump count (Vault Step grants one). */
  airJumps?: number;
  /** Optional water movement multiplier from skills and gear. */
  waterSpeed?: number;
}

export const DEFAULT_TUNING: LocomotionTuning = {
  capsuleRadius: PLAYER.capsuleRadius,
  capsuleHeight: PLAYER.capsuleHeight,
  walkSpeed: PLAYER.walkSpeed,
  runSpeed: PLAYER.runSpeed,
  gravity: PLAYER.gravity,
  jumpVelocity: PLAYER.jumpVelocity,
  maxSlope: PLAYER.maxSlope,
  stepHeight: PLAYER.stepHeight,
  coyoteTime: PLAYER.coyoteTime,
  jumpBufferTime: PLAYER.jumpBufferTime,
  maxFallSpeed: PLAYER.maxFallSpeed,
  groundLambda: PLAYER.groundLambda,
  airLambda: PLAYER.airLambda,
};

export interface CollisionSolver {
  resolve(x: number, z: number, radius: number, feetY: number, height: number, stepHeight?: number): PushResult;
  supportAt(x: number, z: number, feetY: number, stepHeight: number): number;
  blocked?(x: number, y: number, z: number, radius: number): boolean;
}

export interface LocomotionWorld {
  /** Raw terrain height (no props). */
  terrainHeight(x: number, z: number): number;
  /** Highest walkable terrain point under the capsule footprint. */
  groundHeight(x: number, z: number, radius: number): number;
  normalY(x: number, z: number): number;
  waterLevel: number;
  boundaryRadius: number;
  collision?: CollisionSolver;
}

export interface StepEvents {
  jumped: boolean;
  /** Impact speed in m/s when a landing worth animating/sounding occurred. */
  landed: number;
  boundary: boolean;
  hitWall: boolean;
  steppedUp: boolean;
}

export function createLocomotionState(x: number, z: number, heading: number, groundY: number): LocomotionState {
  return {
    position: { x, y: groundY, z },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    wading: false,
    speed: 0,
    heading,
    airTime: 0,
    coyote: PLAYER.coyoteTime,
    jumpBuffer: 0,
    landing: 0,
    turnRate: 0,
    boundaryCooldown: 0,
    airJumpsUsed: 0,
  };
}

const EPS = 1e-4;
/** Tallest drop that is absorbed as a step-down instead of a fall. */
const STEP_DOWN = 0.34;

export function stepLocomotion(
  state: LocomotionState,
  command: MoveCommand,
  rawDt: number,
  world: LocomotionWorld,
  tuning: LocomotionTuning = DEFAULT_TUNING,
): StepEvents {
  const dt = clamp(rawDt, 0.0005, 0.05);
  const events: StepEvents = { jumped: false, landed: 0, boundary: false, hitWall: false, steppedUp: false };
  const radius = tuning.capsuleRadius;
  const height = tuning.capsuleHeight;

  state.landing = Math.max(0, state.landing - dt * 2.6);
  state.boundaryCooldown = Math.max(0, state.boundaryCooldown - dt);
  state.airTime = state.grounded ? 0 : state.airTime + dt;
  state.coyote = state.grounded ? tuning.coyoteTime : Math.max(0, state.coyote - dt);
  state.jumpBuffer = command.jump ? tuning.jumpBufferTime : Math.max(0, state.jumpBuffer - dt);

  /* Desired direction in world space ---------------------------------------- */
  const yaw = command.yaw;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  let wishX = forwardX * command.forward + rightX * command.strafe;
  let wishZ = forwardZ * command.forward + rightZ * command.strafe;
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 1) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }
  const hasInput = wishLength > 0.08;

  /* Water -------------------------------------------------------------------- */
  const terrainNow = world.terrainHeight(state.position.x, state.position.z);
  const depth = world.waterLevel - terrainNow;
  state.wading = depth > 0.05;
  const deep = depth > 1.05;
  const waterDrag = state.wading ? (deep ? 0.42 : 0.74) : 1;
  const swimScale = state.wading ? tuning.waterSpeed ?? 1 : 1;
  const maxSpeed = (command.run ? tuning.runSpeed : tuning.walkSpeed) * waterDrag * swimScale;

  /* Accel / braking ---------------------------------------------------------- */
  const targetX = hasInput ? wishX * maxSpeed : 0;
  const targetZ = hasInput ? wishZ * maxSpeed : 0;
  const lambda = state.grounded ? tuning.groundLambda : tuning.airLambda;
  state.velocity.x = damp(state.velocity.x, targetX, lambda, dt);
  state.velocity.z = damp(state.velocity.z, targetZ, lambda, dt);

  /* Jump --------------------------------------------------------------------- */
  const airJumps = Math.max(0, tuning.airJumps ?? 0);
  if (state.jumpBuffer > 0 && state.coyote > 0) {
    state.velocity.y = tuning.jumpVelocity;
    state.grounded = false;
    state.coyote = 0;
    state.jumpBuffer = 0;
    state.airTime = 0;
    state.airJumpsUsed = 0;
    events.jumped = true;
  } else if (state.jumpBuffer > 0 && airJumps > 0 && state.airJumpsUsed < airJumps) {
    // Vault Step: a slightly weaker second jump, refreshed only on landing.
    state.velocity.y = tuning.jumpVelocity * 0.92;
    state.grounded = false;
    state.jumpBuffer = 0;
    state.airJumpsUsed += 1;
    events.jumped = true;
  }

  state.velocity.y = Math.max(-tuning.maxFallSpeed, state.velocity.y - tuning.gravity * dt);

  /* Horizontal integration with wall sliding -------------------------------- */
  const startX = state.position.x;
  const startZ = state.position.z;
  const feetY = state.position.y;
  const stepX = state.velocity.x * dt;
  const stepZ = state.velocity.z * dt;

  const canStandAt = (x: number, z: number): boolean => {
    const terrain = world.terrainHeight(x, z);
    const climb = terrain - terrainNow;
    const normal = world.normalY(x, z);
    if (normal < tuning.maxSlope && climb > 0.02) return false; // wall of hillside
    if (climb > tuning.stepHeight + 0.35) return false; // sheer ledge
    const platform = world.collision?.supportAt(x, z, feetY, tuning.stepHeight) ?? -Infinity;
    if (Number.isFinite(platform) && platform > feetY + tuning.stepHeight + 0.05) return false;
    return true;
  };

  let nextX = startX + stepX;
  let nextZ = startZ + stepZ;
  if (!canStandAt(nextX, nextZ)) {
    // Slide along whichever axis is still walkable.
    if (canStandAt(startX + stepX, startZ)) {
      nextX = startX + stepX;
      nextZ = startZ;
    } else if (canStandAt(startX, startZ + stepZ)) {
      nextX = startX;
      nextZ = startZ + stepZ;
    } else {
      nextX = startX;
      nextZ = startZ;
    }
    state.velocity.x *= 0.35;
    state.velocity.z *= 0.35;
  }

  if (world.collision) {
    const push = world.collision.resolve(nextX, nextZ, radius, feetY, height, tuning.stepHeight);
    if (push.hit) {
      nextX = push.x;
      nextZ = push.z;
      events.hitWall = true;
      const into = state.velocity.x * push.nx + state.velocity.z * push.nz;
      if (into < 0) {
        state.velocity.x -= into * push.nx;
        state.velocity.z -= into * push.nz;
      }
    }
  }

  /* Expedition boundary ------------------------------------------------------ */
  const radiusFromCentre = Math.hypot(nextX, nextZ);
  if (radiusFromCentre > world.boundaryRadius) {
    const scale = world.boundaryRadius / radiusFromCentre;
    nextX *= scale;
    nextZ *= scale;
    state.velocity.x *= 0.15;
    state.velocity.z *= 0.15;
    if (state.boundaryCooldown <= 0) {
      state.boundaryCooldown = 5;
      events.boundary = true;
    }
  }

  state.position.x = nextX;
  state.position.z = nextZ;

  /* Vertical resolution — the character is never allowed below the floor ---- */
  const terrainGround = world.groundHeight(nextX, nextZ, radius * 0.85);
  const platformTop = world.collision?.supportAt(nextX, nextZ, state.position.y, tuning.stepHeight) ?? -Infinity;
  const support = Math.max(terrainGround, platformTop);
  const waterFloor = world.waterLevel - 1.35;
  const floor = Math.max(support, waterFloor);

  state.position.y += state.velocity.y * dt;

  if (state.position.y <= floor + EPS) {
    const impact = -state.velocity.y;
    if (!state.grounded && state.airTime > 0.06 && impact > 2.2) {
      events.landed = impact;
      state.landing = clamp(impact / 9, 0, 1);
    }
    state.position.y = floor;
    state.velocity.y = 0;
    state.grounded = true;
    state.airJumpsUsed = 0;
  } else if (state.grounded && state.velocity.y <= 0 && state.position.y - floor <= STEP_DOWN) {
    // Walk down slopes and small steps without bouncing into the air. Anything
    // taller than STEP_DOWN turns into a real fall instead of a vertical snap.
    if (state.position.y < floor - 0.02) events.steppedUp = true;
    state.position.y = floor;
    state.velocity.y = 0;
    state.grounded = true;
    state.airJumpsUsed = 0;
  } else {
    state.grounded = false;
  }

  // Belt-and-braces: no frame may end inside the terrain.
  if (state.position.y < floor) {
    state.position.y = floor;
    state.velocity.y = Math.max(0, state.velocity.y);
    state.grounded = true;
    state.airJumpsUsed = 0;
  }

  /* Derived state ------------------------------------------------------------ */
  const planarSpeed = Math.hypot(state.velocity.x, state.velocity.z);
  state.speed = planarSpeed;
  const previousHeading = state.heading;
  if (planarSpeed > 0.28) {
    const targetHeading = Math.atan2(state.velocity.x, state.velocity.z);
    state.heading = dampAngle(state.heading, targetHeading, state.wading ? 6 : 11, dt);
  }
  state.turnRate = dt > 0 ? wrapAngle(state.heading - previousHeading) / dt : 0;

  if (state.grounded && planarSpeed < 0.35) {
    state.airTime = 0;
  }

  return events;
}
