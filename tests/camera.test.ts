import type { Entity } from 'playcanvas';
import { describe, expect, it } from 'vitest';
import { ThirdPersonCamera } from '../src/game/player/ThirdPersonCamera';
import { CAMERA } from '../src/game/config';
import { CollisionWorld } from '../src/game/world/collision';

function cameraRig(): { rig: ThirdPersonCamera; position: { x: number; y: number; z: number }; fov: () => number } {
  const position = { x: 0, y: 0, z: 0 };
  let fov = 68;
  const entity = {
    camera: {
      get fov() {
        return fov;
      },
      set fov(value: number) {
        fov = value;
      },
    },
    setPosition(x: number, y: number, z: number) {
      position.x = x;
      position.y = y;
      position.z = z;
    },
    lookAt() {},
  } as unknown as Entity;
  const rig = new ThirdPersonCamera(entity, 0);
  rig.setCinematic(false);
  return { rig, position, fov: () => fov };
}

describe('third-person camera', () => {
  it('turns the view to the right when the mouse moves right', () => {
    const { rig } = cameraRig();
    rig.applyLook(100, 0, 1, false);
    expect(rig.yaw).toBeGreaterThan(0);
    expect(rig.yaw).toBeCloseTo(0.24, 5);
  });

  it('scales look input with the sensitivity setting', () => {
    const { rig } = cameraRig();
    rig.applyLook(50, 0, 2, false);
    expect(rig.yaw).toBeCloseTo(50 * 0.0024 * 2, 5);
  });

  it('looks down when the mouse moves down, and inverts on request', () => {
    const normal = cameraRig().rig;
    normal.applyLook(0, 120, 1, false);
    expect(normal.pitch).toBeGreaterThan(0.22);

    const inverted = cameraRig().rig;
    inverted.pitch = 0;
    inverted.applyLook(0, 120, 1, true);
    expect(inverted.pitch).toBeLessThan(0);
  });

  it('clamps pitch and zoom to the configured limits', () => {
    const { rig } = cameraRig();
    for (let i = 0; i < 60; i++) rig.applyLook(0, 400, 1, false);
    expect(rig.pitch).toBeLessThanOrEqual(CAMERA.maxPitch + 1e-9);
    for (let i = 0; i < 20; i++) rig.zoom(400);
    expect(rig.distance).toBeLessThanOrEqual(CAMERA.maxDistance + 1e-9);
    for (let i = 0; i < 40; i++) rig.zoom(-400);
    expect(rig.distance).toBeGreaterThanOrEqual(CAMERA.minDistance - 1e-9);
  });

  it('shortens the boom instead of letting the lens enter a solid prop', () => {
    const { rig, position } = cameraRig();
    rig.setCollisionWorld(new CollisionWorld());
    const wall = new CollisionWorld();
    wall.add({ x: 0, z: -4, radius: 1.2, base: -500, top: 500, walkable: false, kind: 'wall' });
    rig.setCollisionWorld(wall);

    for (let i = 0; i < 40; i++) {
      rig.update(1 / 60, { x: 0, y: 100, z: 0 }, { sprinting: false, wading: false, speed: 0 });
    }
    const focus = { x: 0, y: 100 + CAMERA.height, z: -CAMERA.shoulder };
    const boom = Math.hypot(position.x - focus.x, position.z - focus.z);
    expect(boom).toBeLessThan(CAMERA.distance - 1);
    expect(boom).toBeGreaterThan(1);
    expect(wall.blocked(position.x, position.y, position.z, 0.1)).toBe(false);
  });

  it('keeps the shoulder offset while following the target', () => {
    const { rig, position } = cameraRig();
    rig.distance = 5;
    rig.snapToTarget({ x: 10, y: 0, z: -4 });
    expect(Math.hypot(position.x - 10, position.z + 4)).toBeGreaterThan(4);
    expect(position.y).toBeGreaterThan(1.4);
  });
});
