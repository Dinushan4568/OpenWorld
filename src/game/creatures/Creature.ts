/**
 * A single robotic creature: one brain, one procedural body, one point light
 * and a small event surface for the manager.
 *
 * Species share this binding entirely; differences come from `SpeciesDefinition`
 * and the model rig. Placement (terrain following, glider altitude, banking,
 * head tracking and night glow) lives here so the brain stays renderer-free.
 */
import { Color, Entity, type AppBase } from 'playcanvas';
import { Emitter } from '../core/emitter';
import { clamp, damp, wrapAngle } from '../util/math';
import { heightAt } from '../world/heightfield';
import { CreatureModel, type CreatureMotion } from './CreatureModel';
import { CreatureBrain, STATE_LABELS } from './brain';
import { SPECIES, type CreatureSpawn, type SpeciesDefinition } from './species';
import type {
  BrainWorld,
  CreatureKind,
  CreatureState,
  EnvironmentEvent,
  ScanReport,
  Vec2,
} from './types';

const RAD = Math.PI / 180;

export interface CreatureContext {
  dt: number;
  time: number;
  night: number;
  player: { x: number; y: number; z: number; speed: number; crouch: boolean; sprinting: boolean; visible: boolean };
  events: readonly EnvironmentEvent[];
  neighbours: readonly Vec2[];
  sample: (x: number, z: number) => { height: number; slope: number; water: boolean };
  blocked: (x: number, z: number) => boolean;
  boundsRadius: number;
}

export interface CreatureEvents extends Record<string, unknown> {
  /** Fictional mechanical vocalisation, played by the manager when nearby. */
  call: { id: string; kind: CreatureKind; distance: number; alarmed: boolean };
  /** A scan revealed a specimen for the first time. */
  scanned: { id: string; kind: CreatureKind };
}

export class Creature extends Emitter<CreatureEvents> {
  readonly spawn: CreatureSpawn;
  readonly species: SpeciesDefinition;
  readonly brain: CreatureBrain;
  readonly model: CreatureModel;
  readonly root = new Entity('creature-entity');
  readonly scale: number;
  scanned = false;

  private readonly lightEntity: Entity | null = null;
  private renderY: number;
  private lastYaw: number;
  private bank = 0;
  private callTimer: number;
  private callIndex = 0;
  private wasAlarmed = false;
  private pulseFlash = 0;

  constructor(app: AppBase, spawn: CreatureSpawn) {
    super();
    this.spawn = spawn;
    this.species = SPECIES[spawn.kind];
    this.scale = spawn.variance?.scale ?? 1;
    this.brain = new CreatureBrain(spawn);
    this.lastYaw = spawn.heading;
    this.callTimer = 6 + (spawn.id.length % 5) * 2.4;
    this.model = new CreatureModel(app.graphicsDevice, this.species, {
      scale: this.scale,
      castShadows: spawn.kind === 'grazer' || spawn.kind === 'warden',
    });
    this.root.name = `creature-${spawn.id}`;
    this.root.addChild(this.model.root);
    const ground = heightAt(spawn.x, spawn.z);
    this.renderY =
      spawn.kind === 'drifter' ? ground + this.species.motion.flightAltitude * this.scale : ground;
    this.root.setPosition(spawn.x, this.renderY, spawn.z);
    this.root.setLocalEulerAngles(0, spawn.heading / RAD, 0);

    if (spawn.kind === 'grazer' || spawn.kind === 'warden') {
      const glow = this.species.palette.glow;
      this.lightEntity = new Entity(`creature-light-${spawn.id}`);
      this.lightEntity.setLocalPosition(0, this.species.heightMetres * 0.55, 0);
      this.lightEntity.addComponent('light', {
        type: 'point',
        color: new Color(glow[0], glow[1], glow[2]),
        intensity: 0.9,
        range: spawn.kind === 'grazer' ? 14 : 10,
        castShadows: false,
      });
      this.root.addChild(this.lightEntity);
    }
    app.root.addChild(this.root);
  }

  get kind(): CreatureKind {
    return this.spawn.kind;
  }

  get state(): CreatureState {
    return this.brain.state;
  }

  /** World-space point used for line-of-sight and scan framing. */
  get aimPoint(): { x: number; y: number; z: number } {
    const flying = this.spawn.kind === 'drifter';
    return {
      x: this.brain.x,
      y: this.renderY + (flying ? 0.1 : this.species.heightMetres * this.scale * 0.55),
      z: this.brain.z,
    };
  }

  get distanceToPlayer(): number {
    return Math.hypot(this.brain.x - this.lastPlayer.x, this.brain.z - this.lastPlayer.z);
  }

  private lastPlayer: { x: number; z: number } = { x: 0, z: 0 };

  update(context: CreatureContext): ReturnType<CreatureBrain['update']> {
    const { dt } = context;
    this.lastPlayer = { x: context.player.x, z: context.player.z };
    const world: BrainWorld = {
      player: context.player,
      events: context.events,
      sample: context.sample,
      blocked: context.blocked,
      neighbours: context.neighbours,
      boundsRadius: context.boundsRadius,
      night: context.night,
    };
    const output = this.brain.update(dt, world);
    const ground = context.sample(output.x, output.z);
    const flying = this.spawn.kind === 'drifter';
    const altitude = this.species.motion.flightAltitude;
    const bob = flying ? Math.sin(context.time * 0.55 + this.spawn.x * 0.02) * 0.8 : 0;
    const targetY = flying
      ? ground.height + altitude * this.scale + bob
      : ground.height;
    this.renderY = damp(this.renderY, targetY, flying ? 2.8 : 12, dt);
    this.root.setPosition(output.x, this.renderY, output.z);
    this.root.setLocalEulerAngles(0, output.yaw / RAD, 0);

    const yawRate = wrapAngle(output.yaw - this.lastYaw) / Math.max(0.0001, dt);
    this.lastYaw = output.yaw;
    this.bank = damp(this.bank, clamp(-yawRate * 0.22, -0.55, 0.55), 3.5, dt);

    const toPlayer = Math.atan2(context.player.x - output.x, context.player.z - output.z);
    const lookYaw = clamp(wrapAngle(toPlayer - output.yaw), -0.7, 0.7);
    const lookPitch = clamp(
      Math.atan2(
        context.player.y + 1.4 - (this.renderY + this.species.heightMetres * this.scale * 0.6),
        Math.max(0.5, this.distanceToPlayer),
      ),
      -0.35,
      0.4,
    );
    const motion: CreatureMotion = {
      dt,
      time: context.time,
      speed: output.speed,
      state: output.state,
      alert: output.alert,
      display: output.display,
      flying,
      bank: this.bank,
      yawRate,
      lookYaw: this.distanceToPlayer < 26 ? lookYaw : 0,
      lookPitch: this.distanceToPlayer < 26 ? lookPitch : 0,
      dazed: output.dazed,
      night: context.night,
    };
    this.model.update(motion);

    this.pulseFlash = Math.max(0, this.pulseFlash - dt);
    if (this.lightEntity) {
      const base = 0.55 + context.night * 1.25 + (output.alert ? 0.7 : 0) + this.pulseFlash * 1.6;
      this.lightEntity.light!.intensity = base;
    }

    this.updateCalls(context, output.alert, output.state);

    if (output.alert && !this.wasAlarmed) {
      this.callTimer = Math.min(this.callTimer, 0.6);
    }
    this.wasAlarmed = output.alert;
    return output;
  }

  /** Light up the emissive channels when the player's echo pulse lands. */
  flash(strength = 1): void {
    this.pulseFlash = Math.min(1.5, this.pulseFlash + strength);
  }

  display(seconds = 4.5): boolean {
    return this.brain.display(seconds);
  }

  disturb(strength = 1): void {
    this.brain.disturb(strength);
    this.flash(strength);
    this.callTimer = Math.min(this.callTimer, 0.2);
  }

  startle(amount: number): void {
    this.brain.startle(amount);
  }

  report(scannedCount: number, total: number, firstScan: boolean): ScanReport {
    const species = this.species;
    const state = this.brain.state;
    return {
      id: this.spawn.id,
      kind: species.kind,
      name: species.name,
      codename: species.codename,
      classification: species.classification,
      temperament: species.temperamentLine,
      behaviour: species.behaviour,
      diet: species.diet,
      sizeLabel: species.sizeLabel,
      massKg: species.massKg,
      heightMetres: species.heightMetres,
      lengthMetres: species.lengthMetres,
      threat: species.threat,
      threatLabel: species.threatLabel,
      state,
      stateLabel: STATE_LABELS[state],
      distance: this.distanceToPlayer,
      awareness: this.brain.awareness,
      weakness: species.weakness,
      scanned: scannedCount,
      total,
      firstScan,
    };
  }

  private updateCalls(context: CreatureContext, alert: boolean, state: CreatureState): void {
    this.callTimer -= context.dt;
    if (this.callTimer > 0) return;
    const alarmed = alert || state === 'alert' || state === 'display' || state === 'flee' || state === 'dazed';
    this.callTimer = alarmed
      ? 2.2 + (this.callIndex % 3) * 0.9
      : 14 + (this.callIndex % 4) * 3.5;
    this.callIndex += 1;
    this.emit('call', {
      id: this.spawn.id,
      kind: this.spawn.kind,
      distance: this.distanceToPlayer,
      alarmed,
    });
  }

  dispose(): void {
    this.clear();
    // The model owns the root entity and every child it built.
    this.model.dispose();
  }
}
