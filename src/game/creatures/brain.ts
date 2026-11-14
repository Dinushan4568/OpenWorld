/**
 * Reusable creature brain.
 *
 * One implementation drives all four species. Species differ only by the
 * numbers and traits they feed into it — perception cone, temperament, motion,
 * patrol route — so behaviour can be simulated, tuned and tested headlessly.
 *
 * Components:
 *  - perception      (sight cone + hearing + concealment, awareness accrual)
 *  - steering        (desired heading, obstacle / water / slope avoidance)
 *  - routine         (idle → patrol → wait → patrol, or roaming)
 *  - event reaction  (waterfall surges, reactor hum, beacons, echo pulses)
 *  - threat response (flee, alert display, intrusion advance)
 *  - homing          (leash + return to patrol area)
 *
 * All movement is deterministic for a given spawn, so tests can run thousands
 * of ticks and assert invariants.
 */
import { clamp, damp, dampAngle, createRandom, distance2D, randomRange, wrapAngle } from '../util/math';
import { SPECIES, type CreatureSpawn, type SpeciesDefinition } from './species';
import type {
  BrainWorld,
  CreatureKind,
  CreatureState,
  EnvironmentEvent,
  Vec2,
} from './types';

export const STATE_LABELS: Record<CreatureState, string> = {
  idle: 'Idle · listening',
  roam: 'Roaming',
  patrol: 'Walking patrol',
  investigate: 'Investigating a disturbance',
  alert: 'Alert · watching you',
  display: 'Displaying',
  flee: 'Fleeing',
  dazed: 'Dazed · rebooting',
  return: 'Returning to its route',
};

export interface BrainConfig {
  id: string;
  kind: CreatureKind;
  home: Vec2;
  patrol: readonly Vec2[];
  roamRadius: number;
  leashRadius: number;
  walkSpeed: number;
  runSpeed: number;
  turnRate: number;
  sightRange: number;
  fovCos: number;
  hearingRange: number;
  awarenessRate: number;
  awarenessDecay: number;
  aggression: number;
  skittishness: number;
  curiosity: number;
  avoidWater: boolean;
  maxSlope: number;
  flyer: boolean;
  idleSeconds: [number, number];
  patrolWait: number;
  investigateSeconds: number;
  fleeSeconds: number;
  personalSpace: number;
  separation: number;
  /** Sight multiplier at full night (1 = unaffected). */
  nightSight: number;
  seed: number;
  scale: number;
}

export interface BrainReaction {
  event: EnvironmentEvent;
  mode: 'investigate' | 'flee' | 'alert';
}

export interface BrainOutput {
  id: string;
  state: CreatureState;
  x: number;
  z: number;
  yaw: number;
  /** Actual planar speed in metres per second. */
  speed: number;
  awareness: number;
  alert: boolean;
  display: number;
  dazed: boolean;
  reaction: BrainReaction | null;
}

/** Awareness above this starts threat behaviour. */
const THREAT_THRESHOLD = 0.55;
/** Awareness above this means a hostile species will challenge the player. */
const HOSTILE_THRESHOLD = 0.7;

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const speciesSpace = (species: SpeciesDefinition): number => {
  switch (species.kind) {
    case 'grazer':
      return 13;
    case 'warden':
      return 9.5;
    case 'drifter':
      return 8;
    default:
      return 4.5;
  }
};

export function createBrainConfig(spawn: CreatureSpawn): BrainConfig {
  const species = SPECIES[spawn.kind];
  const variance = spawn.variance ?? {};
  const scale = variance.scale ?? 1;
  return {
    id: spawn.id,
    kind: spawn.kind,
    home: { x: spawn.x, z: spawn.z },
    patrol: spawn.patrol,
    roamRadius: species.roamRadius,
    leashRadius: species.leashRadius,
    walkSpeed: species.motion.walkSpeed * scale,
    runSpeed: species.motion.runSpeed * scale,
    turnRate: species.motion.turnRate,
    sightRange: species.senses.sightRange,
    fovCos: Math.cos((species.senses.fovDegrees * 0.5 * Math.PI) / 180),
    hearingRange: species.senses.hearingRange,
    awarenessRate: species.senses.awarenessRate,
    awarenessDecay: species.senses.awarenessDecay,
    aggression: clamp(species.temperament.aggression + (variance.aggression ?? 0), 0, 1),
    skittishness: clamp(species.temperament.skittishness + (variance.skittishness ?? 0), 0, 1),
    curiosity: clamp(species.temperament.curiosity + (variance.curiosity ?? 0), 0, 1),
    avoidWater: species.avoidWater,
    maxSlope: species.maxSlope,
    flyer: species.motion.flightAltitude > 0,
    idleSeconds: species.idleSeconds,
    patrolWait: species.patrolWait,
    investigateSeconds: species.investigateSeconds,
    fleeSeconds: species.fleeSeconds,
    personalSpace: speciesSpace(species) * scale,
    separation: (species.kind === 'grazer' ? 4.2 : species.kind === 'warden' ? 2.4 : 1.6) * scale,
    nightSight: species.kind === 'scuttler' ? 0.55 : species.kind === 'grazer' ? 0.8 : species.kind === 'drifter' ? 1.15 : 1.2,
    seed: hashString(spawn.id),
    scale,
  };
}

/** A reusable simulation of one creature's body and intentions. */
export class CreatureBrain {
  readonly config: BrainConfig;
  x: number;
  z: number;
  yaw: number;
  state: CreatureState = 'idle';
  awareness = 0;
  alert = false;
  speed = 0;
  time = 0;

  private readonly rng: () => number;
  private stateTimer = 0;
  private idleTimer = 0;
  private waitTimer = 0;
  private patrolIndex = 0;
  private waypointTimer = 0;
  private investigateTimer = 0;
  private fleeTimer = 0;
  private dazedTimer = 0;
  private displayTimer = 0;
  private displayLength = 1;
  private target: Vec2 | null = null;
  private eventTarget: EnvironmentEvent | null = null;
  private lastEventId = '';
  private roamTarget: Vec2 | null = null;
  private reaction: BrainReaction | null = null;
  private returning = false;
  private fleeSource: Vec2 | null = null;
  private nightFactor = 0;

  constructor(spawn: CreatureSpawn) {
    this.config = createBrainConfig(spawn);
    this.x = spawn.x;
    this.z = spawn.z;
    this.yaw = spawn.heading;
    this.rng = createRandom(this.config.seed);
    this.idleTimer = randomRange(this.rng, 0.2, 1.6);
    this.patrolIndex = this.nearestPatrolIndex();
  }

  get homeDistance(): number {
    return distance2D(this.x, this.z, this.config.home.x, this.config.home.z);
  }

  /** 0..1 progress through an encounter display, for camera framing. */
  get displayProgress(): number {
    return this.displayLength > 0 ? 1 - clamp(this.displayTimer / this.displayLength, 0, 1) : 0;
  }

  get targetPoint(): Vec2 | null {
    if (this.eventTarget) return { x: this.eventTarget.x, z: this.eventTarget.z };
    if (this.state === 'patrol') return this.config.patrol[this.patrolIndex] ?? null;
    if (this.state === 'return' || this.state === 'flee') return this.config.home;
    return this.target ?? this.roamTarget;
  }

  /** Raise the aegis / rear up for a scripted encounter. */
  display(seconds = 4.5): boolean {
    if (this.displayTimer > 0) return false;
    this.displayTimer = seconds;
    this.displayLength = seconds;
    this.state = 'display';
    this.speed = 0;
    return true;
  }

  /**
   * React to a non-violent energy pulse. Every species is briefly dazed; the
   * warden's aegis rings longer, the scuttler's vanes lock, and skittish
   * creatures bolt once the reboot finishes.
   */
  disturb(strength = 1): void {
    const amount = clamp(strength, 0, 1.5);
    this.dazedTimer = Math.max(this.dazedTimer, 1.1 + amount * 0.9);
    this.awareness = Math.min(this.awareness, 0.25);
    this.fleeTimer = Math.max(this.fleeTimer, 1.4);
    this.state = 'dazed';
    this.speed = 0;
  }

  /** Push awareness up without a line of sight (nearby noise, being scanned). */
  startle(amount: number): void {
    this.awareness = clamp(this.awareness + amount, 0, 1);
  }

  clearAwareness(): void {
    this.awareness = 0;
    this.alert = false;
  }

  update(dt: number, world: BrainWorld): BrainOutput {
    const step = clamp(dt, 0, 0.1);
    this.time += step;
    this.nightFactor = clamp(world.night ?? 0, 0, 1);
    this.reaction = null;
    this.stateTimer += step;

    const player = world.player;
    const dist = distance2D(this.x, this.z, player.x, player.z);
    const toPlayer = Math.atan2(player.x - this.x, player.z - this.z);
    const facing = Math.cos(wrapAngle(toPlayer - this.yaw));

    this.updateAwareness(step, world, dist, facing);
    this.pollEvents(world);

    this.dazedTimer = Math.max(0, this.dazedTimer - step);
    this.displayTimer = Math.max(0, this.displayTimer - step);
    this.fleeTimer = Math.max(0, this.fleeTimer - step);
    if (this.fleeTimer <= 0) this.fleeSource = null;
    if (this.state === 'display' && this.displayTimer <= 0) this.finishDisplay();

    const threatened = this.awareness >= THREAT_THRESHOLD;
    const hostile = this.awareness >= HOSTILE_THRESHOLD && this.config.aggression >= 0.45;

    if (this.dazedTimer > 0) {
      this.enter('dazed');
      this.speed = damp(this.speed, 0, 8, step);
      this.yaw = wrapAngle(this.yaw + Math.sin(this.time * 11) * 0.18 * step);
    } else if (this.displayTimer > 0) {
      this.state = 'display';
      this.speed = damp(this.speed, 0, 8, step);
      this.faceTowards(player.x, player.z, step, 1.3);
    } else if (threatened && this.config.skittishness > this.config.aggression + 0.15 && this.config.fleeSeconds > 0) {
      const source = this.fleeSource ?? player;
      this.runFlee(step, world, source.x, source.z, distance2D(this.x, this.z, source.x, source.z));
    } else if (hostile) {
      this.runAlert(step, world, player.x, player.z, dist);
    } else if (this.homeDistance > this.config.leashRadius) {
      this.returning = true;
      this.runReturn(step, world);
    } else if (this.returning) {
      this.runReturn(step, world);
    } else if (this.eventTarget && this.investigateTimer > 0) {
      this.runInvestigate(step, world);
    } else if (this.config.patrol.length > 0) {
      this.runPatrol(step, world);
    } else {
      this.runRoam(step, world);
    }

    this.alert = this.awareness >= 0.35;
    return {
      id: this.config.id,
      state: this.state,
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      speed: this.speed,
      awareness: this.awareness,
      alert: this.alert,
      display: this.displayProgress,
      dazed: this.dazedTimer > 0,
      reaction: this.reaction,
    };
  }

  /* ------------------------------- senses ------------------------------- */

  private updateAwareness(dt: number, world: BrainWorld, dist: number, facing: number): void {
    const player = world.player;
    // Sneaking is a verb here: walking slowly shrinks the silhouette the
    // machine can resolve, while sprinting advertises you.
    const sneaking = !player.sprinting && player.speed < 1.15;
    const conceal = player.crouch ? 0.5 : sneaking ? 0.72 : player.sprinting ? 1.25 : 1;
    const inCone = facing >= this.config.fovCos;
    const nightSight = 1 + (this.config.nightSight - 1) * this.nightFactor;
    const seen = player.visible && inCone && dist <= this.config.sightRange * conceal * nightSight;
    const motionNoise = player.speed > 1.1 ? 1 : 0.35;
    const hearing = player.crouch ? 0.5 : player.sprinting ? 1.6 : 1;
    const heard = dist <= this.config.hearingRange * hearing * motionNoise && player.speed > 0.4;
    if (seen) {
      const closeness = 1 + clamp(1 - dist / this.config.sightRange, 0, 1) * 0.8;
      this.awareness += dt * this.config.awarenessRate * closeness;
    } else if (heard) {
      this.awareness += dt * this.config.awarenessRate * 0.4;
    } else {
      this.awareness -= dt * this.config.awarenessDecay;
    }
    // A body that blocks the view still counts as a close threat to a guardian.
    if (player.visible && dist < this.config.personalSpace * 0.55) {
      this.awareness = Math.max(this.awareness, 0.85);
    }
    // Panic sustains itself: a bolting creature does not forget the fright
    // mid-stride, it runs until the flee timer expires.
    if (this.fleeTimer > 0) this.awareness = Math.max(this.awareness, 0.57);
    this.awareness = clamp(this.awareness, 0, 1);
  }

  private pollEvents(world: BrainWorld): void {
    if (this.displayTimer > 0 || this.dazedTimer > 0) return;
    let best: EnvironmentEvent | null = null;
    let bestDistance = Infinity;
    for (const event of world.events) {
      if (event.id === this.lastEventId) continue;
      const d = distance2D(this.x, this.z, event.x, event.z);
      if (d > event.radius || d >= bestDistance) continue;
      best = event;
      bestDistance = d;
    }
    if (!best) return;
    this.lastEventId = best.id;
    const skittish = best.startling > 0.55 && this.config.skittishness > 0.35;
    if (skittish) {
      this.fleeTimer = Math.max(this.fleeTimer, this.config.fleeSeconds);
      this.eventTarget = null;
      this.investigateTimer = 0;
      this.fleeSource = { x: best.x, z: best.z };
      this.awareness = Math.max(this.awareness, 0.62);
      this.reaction = { event: best, mode: 'flee' };
    } else if (this.config.curiosity > 0.2) {
      this.eventTarget = best;
      this.investigateTimer = this.config.investigateSeconds;
      this.reaction = { event: best, mode: 'investigate' };
    } else {
      this.awareness = Math.max(this.awareness, 0.45);
      this.reaction = { event: best, mode: 'alert' };
    }
  }

  /* ------------------------------ reactions ----------------------------- */

  private runFlee(dt: number, world: BrainWorld, px: number, pz: number, dist: number): void {
    this.state = 'flee';
    this.fleeTimer = Math.max(this.fleeTimer, 0.6);
    const safeDistance = Math.max(this.config.sightRange * 0.8, this.config.personalSpace * 2);
    if (dist > safeDistance && this.fleeTimer <= 0.6) {
      this.awareness = Math.min(this.awareness, 0.3);
      this.runReturn(dt, world);
      return;
    }
    let awayX = this.x * 2 - px;
    let awayZ = this.z * 2 - pz;
    // Never bolt out of the territory entirely: curve around the den.
    if (distance2D(awayX, awayZ, this.config.home.x, this.config.home.z) > this.config.leashRadius * 1.1) {
      const offsetX = this.x - this.config.home.x;
      const offsetZ = this.z - this.config.home.z;
      const length = Math.hypot(offsetX, offsetZ) || 1;
      awayX = this.x + (offsetX / length) * 10;
      awayZ = this.z + (offsetZ / length) * 10;
    }
    this.advanceTowards(awayX, awayZ, this.config.runSpeed, dt, world);
  }

  private runAlert(dt: number, world: BrainWorld, px: number, pz: number, dist: number): void {
    this.state = 'alert';
    this.faceTowards(px, pz, dt, 1.5);
    const personal = this.config.personalSpace;
    if (this.homeDistance > this.config.leashRadius * 0.85) {
      this.speed = damp(this.speed, 0, 6, dt);
      return;
    }
    if (dist > personal * 1.7 && this.config.aggression > 0.42) {
      // A guardian closes to the edge of its post; it never chases past the leash.
      this.advanceTowards(px, pz, this.config.walkSpeed * 0.85, dt, world);
    } else if (dist < personal * 0.62) {
      const awayX = this.x * 2 - px;
      const awayZ = this.z * 2 - pz;
      this.advanceTowards(awayX, awayZ, this.config.walkSpeed * 0.55, dt, world);
    } else {
      this.speed = damp(this.speed, 0, 7, dt);
      // Idle menace: tiny weight shifts, no drift.
      this.yaw = wrapAngle(this.yaw + Math.sin(this.time * 1.7) * 0.06 * dt);
    }
  }

  private finishDisplay(): void {
    if (this.config.aggression >= this.config.skittishness) {
      this.awareness = Math.max(this.awareness, 0.72);
      this.enter('alert');
    } else {
      this.fleeTimer = Math.max(this.fleeTimer, this.config.fleeSeconds);
      this.awareness = Math.max(this.awareness, 0.6);
      this.enter('flee');
    }
  }

  private runReturn(dt: number, world: BrainWorld): void {
    this.state = 'return';
    const home = this.config.home;
    const d = distance2D(this.x, this.z, home.x, home.z);
    if (d < 3) {
      this.speed = damp(this.speed, 0, 6, dt);
      if (d < 2.2) {
        this.returning = false;
        this.enter('idle');
      }
      return;
    }
    this.advanceTowards(home.x, home.z, this.config.walkSpeed * 1.1, dt, world);
  }

  private runInvestigate(dt: number, world: BrainWorld): void {
    const event = this.eventTarget;
    if (!event) {
      this.investigateTimer = 0;
      return;
    }
    this.state = 'investigate';
    this.investigateTimer = Math.max(0, this.investigateTimer - dt);
    const d = distance2D(this.x, this.z, event.x, event.z);
    if (d > 2.4) {
      this.advanceTowards(event.x, event.z, this.config.walkSpeed * 1.25, dt, world);
    } else {
      this.speed = damp(this.speed, 0, 5, dt);
      const look = Math.sin(this.time * 0.9) * 0.7;
      this.yaw = dampAngle(this.yaw, this.yaw + look * 0.02, 2, dt);
    }
    if (this.investigateTimer <= 0) {
      this.eventTarget = null;
      this.enter('idle');
    }
  }

  /* -------------------------------- routine ----------------------------- */

  private runPatrol(dt: number, world: BrainWorld): void {
    if (this.waitTimer > 0) {
      this.waitTimer = Math.max(0, this.waitTimer - dt);
      this.state = 'idle';
      this.speed = damp(this.speed, 0, 5, dt);
      this.idleLook(dt);
      return;
    }
    const waypoint = this.config.patrol[this.patrolIndex] ?? this.config.patrol[0];
    const d = distance2D(this.x, this.z, waypoint.x, waypoint.z);
    if (d < 2.2) {
      this.patrolIndex = (this.patrolIndex + 1) % this.config.patrol.length;
      this.waitTimer = this.config.patrolWait;
      this.waypointTimer = 0;
      this.speed = damp(this.speed, 0, 6, dt);
      return;
    }
    // A waypoint wedged inside a ruin is skipped rather than trapping the
    // creature against a wall forever.
    this.waypointTimer += dt;
    if (this.waypointTimer > 18) {
      this.waypointTimer = 0;
      this.patrolIndex = (this.patrolIndex + 1) % this.config.patrol.length;
      this.waitTimer = 0.6;
    }
    this.state = 'patrol';
    this.advanceTowards(waypoint.x, waypoint.z, this.config.walkSpeed, dt, world);
  }

  private runRoam(dt: number, world: BrainWorld): void {
    if (this.waitTimer > 0) {
      this.waitTimer = Math.max(0, this.waitTimer - dt);
      this.state = 'idle';
      this.speed = damp(this.speed, 0, 5, dt);
      this.idleLook(dt);
      return;
    }
    if (!this.roamTarget) {
      this.roamTarget = this.pickRoamTarget(world);
      this.stateTimer = 0;
    }
    if (!this.roamTarget) {
      this.state = 'idle';
      this.speed = damp(this.speed, 0, 5, dt);
      this.waitTimer = randomRange(this.rng, this.config.idleSeconds[0], this.config.idleSeconds[1]);
      return;
    }
    const d = distance2D(this.x, this.z, this.roamTarget.x, this.roamTarget.z);
    if (d < 2.5 || this.stateTimer > 22) {
      this.roamTarget = null;
      this.waitTimer = randomRange(this.rng, this.config.idleSeconds[0], this.config.idleSeconds[1]);
      this.speed = damp(this.speed, 0, 6, dt);
      this.state = 'idle';
      return;
    }
    this.state = 'roam';
    this.advanceTowards(this.roamTarget.x, this.roamTarget.z, this.config.walkSpeed * 0.85, dt, world);
  }

  private idleLook(dt: number): void {
    const drift = Math.sin(this.time * 0.5 + this.config.seed * 0.001) * 0.45;
    this.yaw = wrapAngle(this.yaw + drift * dt);
  }

  private pickRoamTarget(world: BrainWorld): Vec2 | null {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const angle = this.rng() * Math.PI * 2;
      const radius = randomRange(this.rng, this.config.roamRadius * 0.35, this.config.roamRadius);
      const x = this.config.home.x + Math.sin(angle) * radius;
      const z = this.config.home.z + Math.cos(angle) * radius;
      if (!this.canStand(x, z, world)) continue;
      const probe = world.sample(x, z);
      if (this.config.avoidWater && probe.water) continue;
      return { x, z };
    }
    return null;
  }

  /* ------------------------------- steering ----------------------------- */

  private advanceTowards(tx: number, tz: number, maxSpeed: number, dt: number, world: BrainWorld): void {
    const desired = Math.atan2(tx - this.x, tz - this.z);
    const heading = this.chooseHeading(desired, world);
    if (heading === null) {
      this.speed = damp(this.speed, 0, 9, dt);
      return;
    }
    this.yaw = dampAngle(this.yaw, heading, this.config.turnRate, dt);
    const turn = Math.abs(wrapAngle(heading - this.yaw));
    const targetSpeed = maxSpeed * (turn > 1.1 ? 0.3 : turn > 0.5 ? 0.7 : 1);
    this.speed = damp(this.speed, targetSpeed, 5, dt);
    this.integrate(dt, world);
  }

  private faceTowards(tx: number, tz: number, dt: number, rateScale: number): void {
    const desired = Math.atan2(tx - this.x, tz - this.z);
    this.yaw = dampAngle(this.yaw, desired, this.config.turnRate * rateScale, dt);
  }

  private integrate(dt: number, world: BrainWorld): void {
    if (this.speed < 0.02) return;
    const nx = this.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.z + Math.cos(this.yaw) * this.speed * dt;
    if (!this.canStand(nx, nz, world)) {
      this.speed = damp(this.speed, 0, 12, dt);
      return;
    }
    this.x = nx;
    this.z = nz;
  }

  /**
   * Pick a heading close to the desired one that is actually walkable.
   * Probes to either side let creatures follow shorelines and slide around
   * ruins instead of walking into them.
   */
  private chooseHeading(desired: number, world: BrainWorld): number | null {
    if (this.config.flyer) {
      const distance = Math.hypot(this.x, this.z);
      if (distance > world.boundsRadius - 14) {
        return Math.atan2(-this.x, -this.z);
      }
      return desired;
    }
    const lookahead = Math.max(1.1, this.config.separation);
    const offsets = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45, 1.9, -1.9];
    for (const offset of offsets) {
      const heading = desired + offset;
      const px = this.x + Math.sin(heading) * lookahead;
      const pz = this.z + Math.cos(heading) * lookahead;
      if (!this.canStand(px, pz, world)) continue;
      if (this.crowded(px, pz, world)) continue;
      return heading;
    }
    return null;
  }

  private canStand(x: number, z: number, world: BrainWorld): boolean {
    if (Math.hypot(x, z) > world.boundsRadius - 8) return false;
    if (this.config.flyer) return true;
    if (world.blocked(x, z)) return false;
    const probe = world.sample(x, z);
    if (probe.slope > this.config.maxSlope) return false;
    if (this.config.avoidWater && probe.water) return false;
    return true;
  }

  private crowded(x: number, z: number, world: BrainWorld): boolean {
    const neighbours = world.neighbours;
    if (!neighbours || neighbours.length === 0) return false;
    for (const other of neighbours) {
      if (distance2D(x, z, other.x, other.z) < this.config.separation) return true;
    }
    return false;
  }

  private nearestPatrolIndex(): number {
    let best = 0;
    let bestDistance = Infinity;
    this.config.patrol.forEach((point, index) => {
      const d = distance2D(this.x, this.z, point.x, point.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = index;
      }
    });
    return best;
  }

  private enter(state: CreatureState): void {
    if (this.state === state) return;
    this.state = state;
    this.stateTimer = 0;
    if (state === 'idle') {
      this.waitTimer = this.waitTimer > 0 ? this.waitTimer : 0;
    }
  }
}

/** Create a brain from a roster entry; also used by tests. */
export function createBrain(spawn: CreatureSpawn): CreatureBrain {
  return new CreatureBrain(spawn);
}
