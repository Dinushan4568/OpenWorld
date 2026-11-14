/**
 * Owns the valley's robotic wildlife: spawning, line-of-sight, environmental
 * events, scanning, encounters, echo-pulse reactions and HUD-facing summaries.
 *
 * The manager is the only creature code that touches the world systems
 * (heightfield + collision); every brain below it runs on plain types.
 */
import type { AppBase } from 'playcanvas';
import { Emitter } from '../core/emitter';
import { clamp, distance2D } from '../util/math';
import type { CollisionWorld } from '../world/collision';
import {
  heightAt,
  isInWater,
  riverDistance,
  riverSurfaceAt,
  slopeDegreesAt,
  waterfalls,
} from '../world/heightfield';
import { Creature } from './Creature';
import { CREATURE_SPAWNS, SPECIES_ORDER } from './species';
import type { CreatureKind, EnvironmentEvent, ScanReport, Vec2 } from './types';

export interface CreatureManagerEvents extends Record<string, unknown> {
  encounter: {
    id: string;
    kind: CreatureKind;
    title: string;
    subtitle: string;
    duration: number;
    aim: { x: number; y: number; z: number };
  };
  scan: ScanReport;
  pulse: { affected: number; calmed: number; startled: number; warden: boolean };
  call: { kind: CreatureKind; distance: number; alarmed: boolean };
  reaction: { kind: CreatureKind; name: string; eventKind: string; mode: string; text: string };
  specimen: { scanned: number; total: number };
}

export interface CreatureUpdateContext {
  player: { x: number; y: number; z: number; speed: number; crouch: boolean; sprinting: boolean };
  night: number;
  interactive: boolean;
}

export interface CreatureThreat {
  id: string;
  name: string;
  kind: CreatureKind;
  distance: number;
  threat: number;
  state: string;
  stateLabel: string;
}

interface TimedEvent extends EnvironmentEvent {
  expiresAt: number;
}

const BOUNDS = 330;
const SCAN_RANGE = 58;

const sampleTerrain = (x: number, z: number): { height: number; slope: number; water: boolean } => {
  const height = heightAt(x, z);
  const riverWater = riverDistance(x, z) < 30 && height < riverSurfaceAt(x, z) - 0.12;
  return { height, slope: slopeDegreesAt(x, z), water: isInWater(x, z) || riverWater };
};

export class CreatureManager extends Emitter<CreatureManagerEvents> {
  readonly creatures: Creature[] = [];
  readonly events: TimedEvent[] = [];
  readonly scannedIds = new Set<string>();
  readonly scannedKinds = new Set<CreatureKind>();

  private readonly app: AppBase;
  private readonly collision: CollisionWorld;
  private readonly encounteredKinds = new Set<CreatureKind>();
  private readonly notifiedEvents = new Set<string>();
  private ambientTimer = 9;
  private eventCounter = 0;
  private time = 0;
  private lastScanHint = -10;

  constructor(app: AppBase, collision: CollisionWorld) {
    super();
    this.app = app;
    this.collision = collision;
  }

  build(): void {
    for (const spawn of CREATURE_SPAWNS) {
      const creature = new Creature(this.app, spawn);
      creature.on('call', ({ kind, distance, alarmed }) => {
        this.emit('call', { kind, distance, alarmed });
      });
      this.relocateIfBlocked(creature);
      this.creatures.push(creature);
    }
  }

  get totalSpecies(): number {
    return SPECIES_ORDER.length;
  }

  get scannedSpecies(): number {
    return this.scannedKinds.size;
  }

  get scannedCount(): number {
    return this.scannedIds.size;
  }

  update(dt: number, time: number, context: CreatureUpdateContext): void {
    this.time = time;
    this.pruneEvents();
    if (context.interactive) {
      this.ambientTimer -= dt;
      if (this.ambientTimer <= 0) {
        this.ambientTimer = 16 + (this.eventCounter % 4) * 4;
        this.spawnAmbientEvent(context.player, context.night);
      }
    }

    const positions: Vec2[] = this.creatures.map((creature) => ({ x: creature.brain.x, z: creature.brain.z }));
    const player = {
      x: context.player.x,
      y: context.player.y,
      z: context.player.z,
      speed: context.player.speed,
      crouch: context.player.crouch,
      sprinting: context.player.sprinting,
      visible: true,
    };

    this.creatures.forEach((creature, index) => {
      const neighbours = positions.filter((_, other) => other !== index);
      const distance = distance2D(player.x, player.z, creature.brain.x, creature.brain.z);
      const visible =
        distance < creature.species.senses.sightRange * 1.3 &&
        this.hasLineOfSight(creature.aimPoint, { x: player.x, y: player.y + 1.55, z: player.z });
      const output = creature.update({
        dt,
        time,
        night: context.night,
        player: { ...player, visible },
        events: this.events,
        neighbours,
        sample: sampleTerrain,
        blocked: (x, z) => this.blockedFor(creature.kind, x, z),
        boundsRadius: BOUNDS,
      });

      if (output.reaction && context.interactive) {
        this.announceReaction(creature, output.reaction.event, output.reaction.mode, context);
      }

      if (context.interactive) this.checkEncounter(creature, context);
    });
  }

  /**
   * Spawn safety: if a roster point landed inside a prop or on a cliff, walk a
   * spiral outwards until the creature has ground it can actually stand on.
   */
  private relocateIfBlocked(creature: Creature): void {
    if (creature.kind === 'drifter') return;
    if (this.isFreeGround(creature, creature.brain.x, creature.brain.z)) return;
    for (let radius = 3; radius <= 21; radius += 3) {
      for (let step = 0; step < 12; step += 1) {
        const angle = (step / 12) * Math.PI * 2;
        const x = creature.spawn.x + Math.cos(angle) * radius;
        const z = creature.spawn.z + Math.sin(angle) * radius;
        if (!this.isFreeGround(creature, x, z)) continue;
        creature.brain.x = x;
        creature.brain.z = z;
        creature.brain.config.home = { x, z };
        creature.root.setPosition(x, heightAt(x, z), z);
        return;
      }
    }
  }

  private isFreeGround(creature: Creature, x: number, z: number): boolean {
    const probe = sampleTerrain(x, z);
    if (probe.water || probe.slope > creature.species.maxSlope * 0.8) return false;
    return !this.blockedFor(creature.kind, x, z);
  }

  /* ------------------------------- scanning ---------------------------- */

  /** Scan the robotic signature in the camera cone. */
  scan(origin: { x: number; y: number; z: number }, yaw: number, maxDistance = SCAN_RANGE): ScanReport | null {
    const target = this.pickScanTarget(origin, yaw, maxDistance);
    if (!target) return null;
    return this.finaliseScan(target);
  }

  /**
   * Scan a specific machine by id, ignoring the camera cone. Used while the
   * encounter camera is framing a creature that may not be under the reticle.
   */
  scanById(id: string, origin: { x: number; y: number; z: number }): ScanReport | null {
    const target = this.creatures.find((creature) => creature.spawn.id === id);
    if (!target) return null;
    const eye = { x: origin.x, y: origin.y + 1.65, z: origin.z };
    if (!this.hasLineOfSight(eye, target.aimPoint)) return null;
    return this.finaliseScan(target);
  }

  private finaliseScan(target: Creature): ScanReport {
    const first = !target.scanned;
    target.scanned = true;
    this.scannedIds.add(target.spawn.id);
    this.scannedKinds.add(target.kind);
    target.flash(0.35);
    target.startle(0.08);
    const report = target.report(this.scannedKinds.size, this.totalSpecies, first);
    this.emit('scan', report);
    if (first) this.emit('specimen', { scanned: this.scannedKinds.size, total: this.totalSpecies });
    return report;
  }

  /** True when something scan-able is inside the cone — used for the HUD prompt. */
  hasScanCandidate(origin: { x: number; y: number; z: number }, yaw: number, maxDistance = SCAN_RANGE): boolean {
    return this.pickScanTarget(origin, yaw, maxDistance) !== null;
  }

  /** Throttled feedback line for scanning empty air. */
  noteEmptyScan(): boolean {
    if (this.time - this.lastScanHint < 4) return false;
    this.lastScanHint = this.time;
    return true;
  }

  private pickScanTarget(
    origin: { x: number; y: number; z: number },
    yaw: number,
    maxDistance: number,
  ): Creature | null {
    const eye = { x: origin.x, y: origin.y + 1.65, z: origin.z };
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let best: Creature | null = null;
    let bestScore = -Infinity;
    for (const creature of this.creatures) {
      const aim = creature.aimPoint;
      const dx = aim.x - eye.x;
      const dz = aim.z - eye.z;
      const distance = Math.hypot(dx, dz);
      if (distance > maxDistance || distance < 0.3) continue;
      const dot = (dx * fx + dz * fz) / distance;
      const close = distance < 9;
      if (dot < (close ? 0.1 : 0.5)) continue;
      if (!this.hasLineOfSight(eye, aim)) continue;
      const score = dot * 2.2 - distance / maxDistance;
      if (score > bestScore) {
        bestScore = score;
        best = creature;
      }
    }
    return best;
  }

  /* -------------------------------- pulse ------------------------------ */

  /** Non-violent echo pulse: dazes nearby machines and wakes the world. */
  pulse(origin: { x: number; y: number; z: number }): {
    affected: number;
    calmed: number;
    startled: number;
    warden: boolean;
  } {
    const radius = 34;
    let affected = 0;
    let calmed = 0;
    let startled = 0;
    let warden = false;
    for (const creature of this.creatures) {
      const distance = distance2D(origin.x, origin.z, creature.brain.x, creature.brain.z);
      if (distance > radius) continue;
      const strength = clamp(1 - distance / radius, 0.15, 1);
      const wasAlert = creature.brain.state === 'alert' || creature.brain.state === 'display' || creature.brain.alert;
      creature.disturb(0.55 + strength * 0.45);
      affected += 1;
      if (wasAlert) calmed += 1;
      if (creature.kind === 'scuttler' || creature.kind === 'drifter') startled += 1;
      if (creature.kind === 'warden') warden = true;
    }
    this.events.push({
      id: `echo-${++this.eventCounter}`,
      kind: 'echo-pulse',
      x: origin.x,
      z: origin.z,
      radius: 46,
      startling: 0.4,
      label: 'An echo rolls across the valley floor.',
      expiresAt: this.time + 6,
    });
    const result = { affected, calmed, startled, warden };
    this.emit('pulse', result);
    return result;
  }

  /* ------------------------------ summaries ---------------------------- */

  nearestThreat(player: { x: number; z: number }): CreatureThreat | null {
    let best: Creature | null = null;
    let bestDistance = Infinity;
    for (const creature of this.creatures) {
      const state = creature.brain.state;
      if (state !== 'alert' && state !== 'display' && state !== 'flee' && state !== 'investigate') continue;
      const distance = distance2D(player.x, player.z, creature.brain.x, creature.brain.z);
      if (distance > 42 || distance >= bestDistance) continue;
      best = creature;
      bestDistance = distance;
    }
    if (!best) return null;
    const stateLabels: Record<string, string> = {
      alert: 'watching you',
      display: 'challenging you',
      flee: 'bolting',
      investigate: 'investigating',
    };
    return {
      id: best.spawn.id,
      name: best.species.name,
      kind: best.kind,
      distance: bestDistance,
      threat: best.species.threat,
      state: best.brain.state,
      stateLabel: stateLabels[best.brain.state] ?? best.brain.state,
    };
  }

  creatureCount(kind: CreatureKind): number {
    return this.creatures.filter((creature) => creature.kind === kind).length;
  }

  /* ---------------------------- world plumbing ------------------------- */

  private blockedFor(kind: CreatureKind, x: number, z: number): boolean {
    if (kind === 'drifter') return false;
    const radius = kind === 'grazer' ? 1.2 : kind === 'warden' ? 0.8 : 0.45;
    const height = heightAt(x, z);
    return this.collision.blocked(x, height + radius + 0.25, z, radius);
  }

  private hasLineOfSight(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ): boolean {
    const steps = 7;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      if (heightAt(x, z) + 0.3 > y) return false;
      if (i % 2 === 0 && this.collision.blocked(x, y, z, 0.14)) return false;
    }
    return true;
  }

  private checkEncounter(creature: Creature, context: CreatureUpdateContext): void {
    const encounter = creature.species.encounter;
    if (!encounter) return;
    if (this.encounteredKinds.has(creature.kind)) return;
    const distance = distance2D(context.player.x, context.player.z, creature.brain.x, creature.brain.z);
    if (distance > encounter.range) return;
    if (!this.hasLineOfSight(
      { x: context.player.x, y: context.player.y + 1.6, z: context.player.z },
      creature.aimPoint,
    )) return;
    this.encounteredKinds.add(creature.kind);
    creature.display(5);
    creature.flash(0.5);
    this.emit('encounter', {
      id: creature.spawn.id,
      kind: creature.kind,
      title: encounter.title,
      subtitle: encounter.subtitle,
      duration: 6.4,
      aim: creature.aimPoint,
    });
  }

  private announceReaction(
    creature: Creature,
    event: EnvironmentEvent,
    mode: string,
    context: CreatureUpdateContext,
  ): void {
    if (distance2D(context.player.x, context.player.z, creature.brain.x, creature.brain.z) > 70) return;
    if (this.notifiedEvents.has(event.id)) return;
    this.notifiedEvents.add(event.id);
    const verb =
      mode === 'flee'
        ? 'bolts from'
        : mode === 'alert'
          ? 'freezes at'
          : 'turns toward';
    this.emit('reaction', {
      kind: creature.kind,
      name: creature.species.name,
      eventKind: event.kind,
      mode,
      text: `${creature.species.name} ${verb} ${event.kind.replace('-', ' ')}`,
    });
  }

  private spawnAmbientEvent(
    player: { x: number; z: number },
    night: number,
  ): void {
    const falls = waterfalls[0] ?? { x: 2, z: 186 };
    const candidates: Array<{ distance: number; event: Omit<EnvironmentEvent, 'id'> }> = [
      {
        distance: distance2D(player.x, player.z, falls.x, falls.z),
        event: {
          kind: 'waterfall-surge',
          x: falls.x,
          z: falls.z,
          radius: 70,
          startling: 0.85,
          label: 'The falls surge and throw cold spray.',
        },
      },
      {
        distance: distance2D(player.x, player.z, -198, -25) * (night > 0.5 ? 0.7 : 1),
        event: {
          kind: 'city-beacon',
          x: -198,
          z: -25,
          radius: 75,
          startling: 0.45,
          label: 'A beacon sweeps the empty city square.',
        },
      },
      {
        distance: distance2D(player.x, player.z, -100, 190),
        event: {
          kind: 'reactor-pulse',
          x: -100,
          z: 190,
          radius: 70,
          startling: 0.3,
          label: 'Station Theta vents a low reactor hum.',
        },
      },
      {
        distance: distance2D(player.x, player.z, 96, 40) + 18,
        event: {
          kind: 'wind-gust',
          x: player.x,
          z: player.z,
          radius: 44,
          startling: 0.22,
          label: 'A wind gust rattles the grass.',
        },
      },
    ];
    candidates.sort((a, b) => a.distance - b.distance);
    const chosen = candidates[0].distance < 150 ? candidates[0].event : candidates[3].event;
    const event: TimedEvent = {
      ...chosen,
      id: `env-${++this.eventCounter}`,
      x: chosen.kind === 'wind-gust' ? player.x + 12 : chosen.x,
      z: chosen.kind === 'wind-gust' ? player.z - 8 : chosen.z,
      expiresAt: this.time + 14,
    };
    this.events.push(event);
  }

  private pruneEvents(): void {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      if (this.events[i].expiresAt <= this.time) {
        this.notifiedEvents.delete(this.events[i].id);
        this.events.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const creature of this.creatures) creature.dispose();
    this.creatures.length = 0;
    this.events.length = 0;
    this.clear();
  }
}
