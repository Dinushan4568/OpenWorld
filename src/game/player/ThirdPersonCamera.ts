import { type Entity } from 'playcanvas';
import { CAMERA, WORLD } from '../config';
import type { CollisionWorld } from '../world/collision';
import { clamp, damp, wrapAngle } from '../util/math';
import { heightAt } from '../world/heightfield';

/**
 * Spring-damped third-person camera with terrain-aware boom collision, shoulder
 * offset, sprint FOV, landing impulses and a cinematic orbit for the main menu.
 */
export class ThirdPersonCamera {
  yaw: number;
  pitch: number = 0.22;
  distance: number = CAMERA.distance;
  baseFov: number = CAMERA.fov;
  cinematic = true;

  private readonly camera: Entity;
  private readonly position = { x: 0, y: 0, z: 0 };
  private readonly focus = { x: 0, y: 0, z: 0 };
  private currentDistance: number = CAMERA.distance;
  private impulse = 0;
  private shake = 0;
  private shakeScale = 1;
  private cinematicTime = 0;
  private initialised = false;
  private frame: {
    target: { x: number; y: number; z: number };
    radius: number;
    height: number;
    duration: number;
    elapsed: number;
    angle: number;
  } | null = null;
  private collision: CollisionWorld | null = null;

  constructor(camera: Entity, yaw: number) {
    this.camera = camera;
    this.yaw = yaw;
  }

  /** Register the world's collision grid so the boom cannot clip through props. */
  setCollisionWorld(collision: CollisionWorld | null): void {
    this.collision = collision;
  }

  setCinematic(enabled: boolean): void {
    if (this.cinematic === enabled) return;
    this.cinematic = enabled;
    if (!enabled) this.initialised = false;
  }

  get framing(): boolean {
    return this.frame !== null;
  }

  /**
   * Ease into a slow orbit around a point of interest — used by the cinematic
   * creature encounters. Movement input is gated by the caller for the
   * duration, and the framing releases itself when the timer expires.
   */
  frameOn(
    target: { x: number; y: number; z: number },
    options: { duration?: number; radius?: number; height?: number } = {},
  ): void {
    const radius = options.radius ?? Math.max(7, this.distance * 0.8);
    const angle = Math.atan2(this.position.z - target.z, this.position.x - target.x);
    this.frame = {
      target: { ...target },
      radius,
      height: options.height ?? 2.2,
      duration: options.duration ?? 6,
      elapsed: 0,
      angle,
    };
  }

  clearFrame(): void {
    this.frame = null;
  }

  applyLook(dx: number, dy: number, sensitivity: number, invertY: boolean): void {
    if (this.cinematic) return;
    const scale = 0.0024 * sensitivity;
    this.yaw = wrapAngle(this.yaw + dx * scale);
    this.pitch = clamp(this.pitch + dy * scale * (invertY ? -1 : 1), CAMERA.minPitch, CAMERA.maxPitch);
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance + delta * 0.0022, CAMERA.minDistance, CAMERA.maxDistance);
  }

  addLandingImpulse(impact: number): void {
    this.impulse = Math.min(0.32, impact * 0.022) * this.shakeScale;
    this.shake = Math.min(0.08, impact * 0.006) * this.shakeScale;
  }

  /** 0 disables landing shake for players who prefer reduced motion. */
  setShakeScale(scale: number): void {
    this.shakeScale = clamp(scale, 0, 1);
  }

  update(
    dt: number,
    target: { x: number; y: number; z: number },
    options: { sprinting: boolean; wading: boolean; speed: number },
  ): void {
    const time = performance.now() * 0.001;
    this.impulse = damp(this.impulse, 0, 8, dt);
    this.shake = damp(this.shake, 0, 10, dt);

    let desiredCamX: number;
    let desiredCamY: number;
    let desiredCamZ: number;
    let focusX: number;
    let focusY: number;
    let focusZ: number;
    let fovBoost = 0;

    if (this.frame) {
      const frame = this.frame;
      frame.elapsed += dt;
      const angle = frame.angle + frame.elapsed * 0.2;
      focusX = frame.target.x;
      focusY = frame.target.y;
      focusZ = frame.target.z;
      desiredCamX = focusX + Math.cos(angle) * frame.radius;
      desiredCamZ = focusZ + Math.sin(angle) * frame.radius;
      desiredCamY = focusY + frame.height + Math.sin(frame.elapsed * 0.55) * 0.25;
      const floor = Math.max(heightAt(desiredCamX, desiredCamZ), WORLD.waterLevel) + 1.1;
      desiredCamY = Math.max(desiredCamY, floor);
      this.focus.x = focusX;
      this.focus.y = focusY;
      this.focus.z = focusZ;
      if (frame.elapsed >= frame.duration) this.frame = null;
    } else if (this.cinematic) {
      this.cinematicTime += dt;
      const t = this.cinematicTime * 0.045;
      focusX = 96;
      focusY = 18;
      focusZ = 38;
      const radius = 96;
      desiredCamX = focusX + Math.cos(t) * radius;
      desiredCamZ = focusZ + Math.sin(t) * radius;
      desiredCamY = 34 + Math.sin(t * 0.7) * 5;
      desiredCamY = Math.max(desiredCamY, heightAt(desiredCamX, desiredCamZ) + 9);
      this.focus.x = focusX;
      this.focus.y = focusY;
      this.focus.z = focusZ;
      if (!this.initialised) {
        this.position.x = desiredCamX;
        this.position.y = desiredCamY;
        this.position.z = desiredCamZ;
        this.initialised = true;
      }
    } else {
      const rightX = Math.cos(this.yaw);
      const rightZ = -Math.sin(this.yaw);
      focusX = target.x + rightX * CAMERA.shoulder;
      focusY = target.y + CAMERA.height;
      focusZ = target.z + rightZ * CAMERA.shoulder;

      const cosPitch = Math.cos(this.pitch);
      const dirX = -Math.sin(this.yaw) * cosPitch;
      const dirY = Math.sin(this.pitch);
      const dirZ = -Math.cos(this.yaw) * cosPitch;

      // Terrain-aware boom: shorten if the ideal position would clip the ground.
      let allowed = this.distance;
      const steps = 14;
      for (let i = 3; i <= steps; i++) {
        const t = i / steps;
        const px = focusX + dirX * this.distance * t;
        const py = focusY + dirY * this.distance * t;
        const pz = focusZ + dirZ * this.distance * t;
        const terrain = heightAt(px, pz);
        const minimum = Math.max(terrain, WORLD.waterLevel) + 0.55;
        const blockedByProp = this.collision?.blocked(px, py, pz, 0.28) ?? false;
        if (py < minimum || blockedByProp) {
          allowed = this.distance * Math.max(0.12, t - 1 / steps);
          break;
        }
      }
      this.currentDistance = damp(this.currentDistance, allowed, allowed < this.currentDistance ? 22 : 6, dt);

      desiredCamX = focusX + dirX * this.currentDistance;
      desiredCamY = focusY + dirY * this.currentDistance;
      desiredCamZ = focusZ + dirZ * this.currentDistance;
      fovBoost = options.sprinting && options.speed > 4 ? CAMERA.sprintFovBoost : 0;
      if (options.wading) fovBoost -= 1.5;

      this.focus.x = damp(this.focus.x, focusX, 18, dt);
      this.focus.y = damp(this.focus.y, focusY, 18, dt);
      this.focus.z = damp(this.focus.z, focusZ, 18, dt);
      if (!this.initialised) {
        this.position.x = desiredCamX;
        this.position.y = desiredCamY;
        this.position.z = desiredCamZ;
        this.initialised = true;
      }
    }

    const lambda = this.frame ? 2.4 : this.cinematic ? 3 : CAMERA.positionDamping;
    this.position.x = damp(this.position.x, desiredCamX, lambda, dt);
    this.position.y = damp(this.position.y, desiredCamY, lambda, dt);
    this.position.z = damp(this.position.z, desiredCamZ, lambda, dt);

    // Keep the lens above terrain and water no matter what.
    const cameraFloor = Math.max(heightAt(this.position.x, this.position.z), WORLD.waterLevel) + 0.42;
    if (this.position.y < cameraFloor) this.position.y = cameraFloor;

    // Final safety pass: if the damped lens still ends up inside a solid prop,
    // walk it back towards the focus point until it is clear.
    if (this.collision) {
      for (let i = 0; i < 6; i++) {
        if (!this.collision.blocked(this.position.x, this.position.y, this.position.z, 0.3)) break;
        const towardX = this.focus.x - this.position.x;
        const towardY = this.focus.y - this.position.y;
        const towardZ = this.focus.z - this.position.z;
        const distance = Math.hypot(towardX, towardY, towardZ) || 1;
        const step = Math.min(0.55, distance * 0.35);
        this.position.x += (towardX / distance) * step;
        this.position.y += (towardY / distance) * step;
        this.position.z += (towardZ / distance) * step;
        this.currentDistance = Math.max(CAMERA.minDistance * 0.5, this.currentDistance - step);
      }
    }

    const shakeX = this.shake > 0 ? Math.sin(time * 74) * this.shake : 0;
    const shakeY = this.shake > 0 ? Math.cos(time * 61) * this.shake : 0;

    this.camera.setPosition(
      this.position.x + shakeX,
      this.position.y - this.impulse + shakeY,
      this.position.z,
    );
    this.camera.lookAt(this.focus.x, this.focus.y + 0.15, this.focus.z);

    const targetFov = this.baseFov + fovBoost;
    this.camera.camera!.fov = damp(this.camera.camera!.fov, targetFov, 5, dt);
  }

  setBaseFov(fov: number): void {
    this.baseFov = fov;
  }

  snapToTarget(target: { x: number; y: number; z: number }): void {
    const focusX = target.x + Math.cos(this.yaw) * CAMERA.shoulder;
    const focusY = target.y + CAMERA.height;
    const focusZ = target.z - Math.sin(this.yaw) * CAMERA.shoulder;
    const cosPitch = Math.cos(this.pitch);
    this.position.x = focusX + -Math.sin(this.yaw) * cosPitch * this.distance;
    this.position.y = focusY + Math.sin(this.pitch) * this.distance;
    this.position.z = focusZ + -Math.cos(this.yaw) * cosPitch * this.distance;
    this.focus.x = focusX;
    this.focus.y = focusY;
    this.focus.z = focusZ;
    this.initialised = true;
    this.camera.setPosition(this.position.x, this.position.y, this.position.z);
    this.camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
  }
}
