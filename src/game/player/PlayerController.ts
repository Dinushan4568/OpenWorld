import { Entity, type AppBase } from 'playcanvas';
import { PLAYER, WORLD } from '../config';
import type { AssetManager } from '../core/AssetManager';
import { Emitter } from '../core/emitter';
import { clamp } from '../util/math';
import type { CollisionWorld } from '../world/collision';
import { heightAt, normalAt } from '../world/heightfield';
import { createLocomotionWorld } from '../world/navigation';
import { CharacterModel } from './CharacterModel';
import {
  DEFAULT_TUNING,
  createLocomotionState,
  stepLocomotion,
  type LocomotionState,
  type LocomotionTuning,
  type LocomotionWorld,
  type MoveCommand,
  type StepEvents,
} from './locomotion';

export type SurfaceKind = 'grass' | 'rock' | 'water';

export interface PlayerEvents extends Record<string, unknown> {
  footstep: { surface: SurfaceKind };
  jumped: undefined;
  landed: { impact: number };
  boundary: undefined;
  wading: { active: boolean };
}

export interface PlayerUpdateOptions {
  /** True while the run input is held. */
  run: boolean;
  /** True on the frame a jump was pressed. */
  jump: boolean;
}

export interface PlayerDebugState {
  speed: number;
  heading: number;
  grounded: boolean;
  wading: boolean;
  airTime: number;
  landing: number;
  groundY: number;
  turnRate: number;
  stridePhase: number;
  hasModel: boolean;
  collisionCount: number;
}

/**
 * Third-person player controller.
 *
 * Gameplay semantics live here; the heavy lifting is delegated to the
 * engine-free `stepLocomotion` solver so the movement contract can be tested
 * headlessly. The controller only bridges input, the PlayCanvas entity and the
 * animated character model.
 */
export class PlayerController extends Emitter<PlayerEvents> {
  readonly root: Entity;
  readonly model: CharacterModel;
  readonly state: LocomotionState;

  time = 0;
  private readonly world: LocomotionWorld;
  private readonly collision: CollisionWorld | null;
  private readonly app: AppBase;
  private stepDistance = 0;
  private wasWading = false;
  private readonly tuning: LocomotionTuning;

  constructor(
    app: AppBase,
    start: { x: number; y: number; z: number; heading: number },
    assets?: AssetManager,
    collision?: CollisionWorld,
  ) {
    super();
    this.app = app;
    this.collision = collision ?? null;
    this.tuning = { ...DEFAULT_TUNING };
    this.world = createLocomotionWorld(collision);
    this.model = new CharacterModel(app, assets);
    this.root = this.model.root;
    app.root.addChild(this.root);

    const ground = Math.max(start.y, heightAt(start.x, start.z), WORLD.waterLevel - 1.0);
    this.state = createLocomotionState(start.x, start.z, start.heading, ground);
    this.root.setPosition(start.x, ground, start.z);
    this.root.setEulerAngles(0, (start.heading * 180) / Math.PI, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Public read-only surface                                           */
  /* ------------------------------------------------------------------ */

  get position(): { x: number; y: number; z: number } {
    return this.state.position;
  }

  get velocity(): { x: number; y: number; z: number } {
    return this.state.velocity;
  }

  get heading(): number {
    return this.state.heading;
  }

  set heading(value: number) {
    this.state.heading = value;
  }

  get grounded(): boolean {
    return this.state.grounded;
  }

  get wading(): boolean {
    return this.state.wading;
  }

  get speed(): number {
    return this.state.speed;
  }

  get turnRate(): number {
    return this.state.turnRate;
  }

  get landing(): number {
    return this.state.landing;
  }

  /**
   * Apply RPG movement modifiers without ever mutating the shared
   * `DEFAULT_TUNING` module constant (it is used by headless solver tests).
   */
  applyProgressionMovement(modifiers: {
    moveSpeed: number;
    jump: number;
    waterSpeed: number;
    doubleJump: boolean;
  }): void {
    this.tuning.walkSpeed = PLAYER.walkSpeed * modifiers.moveSpeed;
    this.tuning.runSpeed = PLAYER.runSpeed * modifiers.moveSpeed;
    this.tuning.jumpVelocity = PLAYER.jumpVelocity * modifiers.jump;
    this.tuning.waterSpeed = modifiers.waterSpeed;
    this.tuning.airJumps = modifiers.doubleJump ? 1 : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Frame update                                                       */
  /* ------------------------------------------------------------------ */

  update(dt: number, command: { moveX: number; moveY: number; cameraYaw: number } & PlayerUpdateOptions): void {
    this.time += Math.max(0, dt);

    const solverCommand: MoveCommand = {
      forward: clamp(command.moveY, -1, 1),
      strafe: clamp(command.moveX, -1, 1),
      yaw: command.cameraYaw,
      run: command.run,
      jump: command.jump,
    };

    const events = stepLocomotion(this.state, solverCommand, dt, this.world, this.tuning);
    this.handleEvents(events);

    const wadingChanged = this.state.wading !== this.wasWading;
    this.wasWading = this.state.wading;
    if (wadingChanged) this.emit('wading', { active: this.state.wading });

    this.root.setPosition(this.state.position.x, this.state.position.y, this.state.position.z);
    this.root.setEulerAngles(0, (this.state.heading * 180) / Math.PI, 0);

    this.model.update(
      dt,
      this.time,
      this.state.speed,
      this.state.grounded,
      this.state.velocity.y,
      this.state.wading,
      {
        landing: this.state.landing,
        turnRate: this.state.turnRate,
        running: command.run && this.state.speed > this.tuning.walkSpeed * 1.05,
      },
    );

    this.updateFootsteps(dt, command);
  }

  private handleEvents(events: StepEvents): void {
    if (events.jumped) this.emit('jumped', undefined);
    if (events.landed > 2.2) this.emit('landed', { impact: events.landed });
    if (events.boundary) this.emit('boundary', undefined);
  }

  private updateFootsteps(dt: number, command: PlayerUpdateOptions): void {
    if (!this.state.grounded || this.state.speed < 0.55) {
      this.stepDistance = Math.min(this.stepDistance, 1.1);
      return;
    }
    this.stepDistance += this.state.speed * dt;
    const threshold = command.run ? 2.7 : 1.85;
    if (this.stepDistance < threshold) return;
    this.stepDistance = 0;
    this.emit('footstep', { surface: this.surfaceKind() });
  }

  private surfaceKind(): SurfaceKind {
    if (this.state.wading) return 'water';
    const normalY = normalAt(this.state.position.x, this.state.position.z)[1];
    const height = heightAt(this.state.position.x, this.state.position.z);
    if (normalY < 0.82 || height > 24) return 'rock';
    return 'grass';
  }

  /* ------------------------------------------------------------------ */
  /* Placement / debugging                                              */
  /* ------------------------------------------------------------------ */

  teleport(x: number, z: number, heading = this.state.heading): void {
    const ground = this.groundAt(x, z);
    this.state.position.x = x;
    this.state.position.y = ground;
    this.state.position.z = z;
    this.state.velocity.x = 0;
    this.state.velocity.y = 0;
    this.state.velocity.z = 0;
    this.state.grounded = true;
    this.state.airTime = 0;
    this.state.coyote = this.tuning.coyoteTime;
    this.state.airJumpsUsed = 0;
    this.state.landing = 0;
    this.state.heading = heading;
    this.stepDistance = 0;
    this.root.setPosition(x, ground, z);
    this.root.setEulerAngles(0, (heading * 180) / Math.PI, 0);
  }

  private groundAt(x: number, z: number): number {
    const terrain = Math.max(heightAt(x, z), WORLD.waterLevel - 1.0);
    const platform = this.collision?.supportAt(x, z, terrain + PLAYER.stepHeight, PLAYER.stepHeight) ?? -Infinity;
    return Math.max(terrain, platform);
  }

  getDebugState(): PlayerDebugState {
    return {
      speed: this.state.speed,
      heading: this.state.heading,
      grounded: this.state.grounded,
      wading: this.state.wading,
      airTime: this.state.airTime,
      landing: this.state.landing,
      groundY: this.world.groundHeight(this.state.position.x, this.state.position.z, PLAYER.capsuleRadius),
      turnRate: this.state.turnRate,
      stridePhase: this.model.animationPhase,
      hasModel: this.model.usingAsset,
      collisionCount: this.collision?.count ?? 0,
    };
  }

  /** Nearest land position to a point — used when restoring a save that ended in water. */
  static clampToLand(x: number, z: number): { x: number; z: number } {
    const limit = WORLD.boundaryRadius - 4;
    const clampPoint = (px: number, pz: number): { x: number; z: number } => {
      const radius = Math.hypot(px, pz);
      if (radius <= limit) return { x: px, z: pz };
      const scale = limit / radius;
      return { x: px * scale, z: pz * scale };
    };
    const inside = clampPoint(x, z);
    if (heightAt(inside.x, inside.z) > WORLD.waterLevel + 0.2) return inside;
    for (let i = 1; i <= 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const px = inside.x + Math.cos(angle) * i * 3.5;
      const pz = inside.z + Math.sin(angle) * i * 3.5;
      if (heightAt(px, pz) > WORLD.waterLevel + 0.6 && Math.hypot(px, pz) < limit) return { x: px, z: pz };
    }
    return { x: WORLD.spawn.x, z: WORLD.spawn.z };
  }

  destroy(): void {
    this.model.destroy();
    this.root.destroy();
    void this.app;
  }
}
