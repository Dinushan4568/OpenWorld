import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../src/game/world/collision';
import {
  DEFAULT_TUNING,
  createLocomotionState,
  stepLocomotion,
  type LocomotionState,
  type LocomotionWorld,
  type MoveCommand,
  type StepEvents,
} from '../src/game/player/locomotion';

interface WorldOptions {
  height?: (x: number, z: number) => number;
  normalY?: number;
  waterLevel?: number;
  boundaryRadius?: number;
  collision?: CollisionWorld;
}

function makeWorld(options: WorldOptions = {}): LocomotionWorld {
  const height = options.height ?? (() => 0);
  return {
    terrainHeight: height,
    groundHeight: (x, z) => height(x, z),
    normalY: () => options.normalY ?? 1,
    waterLevel: options.waterLevel ?? -100,
    boundaryRadius: options.boundaryRadius ?? 400,
    collision: options.collision,
  };
}

function command(overrides: Partial<MoveCommand> = {}): MoveCommand {
  return { forward: 1, strafe: 0, yaw: 0, run: false, jump: false, ...overrides };
}

function simulate(
  state: LocomotionState,
  world: LocomotionWorld,
  frames: number,
  commandFor: (frame: number) => MoveCommand,
  dt = 1 / 60,
): { events: StepEvents[]; maxY: number; minGap: number } {
  const events: StepEvents[] = [];
  let maxY = -Infinity;
  let minGap = Infinity;
  for (let frame = 0; frame < frames; frame++) {
    events.push(stepLocomotion(state, commandFor(frame), dt, world, DEFAULT_TUNING));
    maxY = Math.max(maxY, state.position.y);
    minGap = Math.min(minGap, state.position.y - world.terrainHeight(state.position.x, state.position.z));
  }
  return { events, maxY, minGap };
}

describe('locomotion solver', () => {
  it('walks forward at walking speed and stays on the ground', () => {
    const world = makeWorld();
    const state = createLocomotionState(0, 0, 0, 0);
    simulate(state, world, 90, () => command());
    expect(state.speed).toBeGreaterThan(3.2);
    expect(state.speed).toBeLessThan(3.6);
    expect(state.position.z).toBeGreaterThan(3);
    expect(state.position.y).toBeCloseTo(0, 4);
    expect(state.grounded).toBe(true);
  });

  it('runs faster when the run input is held', () => {
    const world = makeWorld();
    const state = createLocomotionState(0, 0, 0, 0);
    simulate(state, world, 120, () => command({ run: true }));
    expect(state.speed).toBeGreaterThan(6.2);
    expect(state.speed).toBeLessThan(6.7);
  });

  it('stops smoothly when input is released', () => {
    const world = makeWorld();
    const state = createLocomotionState(0, 0, 0, 0);
    simulate(state, world, 60, () => command());
    simulate(state, world, 60, () => command({ forward: 0 }));
    expect(state.speed).toBeLessThan(0.05);
    expect(state.position.y).toBeCloseTo(0, 4);
  });

  it('jumps, peaks near the ballistic apex and lands with an impact', () => {
    const world = makeWorld();
    const state = createLocomotionState(0, 0, 0, 0);
    const { events, maxY } = simulate(state, world, 120, (frame) => command({ jump: frame === 0 }));
    expect(events.some((event) => event.jumped)).toBe(true);
    expect(maxY).toBeGreaterThan(0.6);
    expect(maxY).toBeLessThan(1.1);
    const landing = events.find((event) => event.landed > 0);
    expect(landing?.landed).toBeGreaterThan(2.5);
    expect(state.position.y).toBeCloseTo(0, 4);
    expect(state.grounded).toBe(true);
  });

  it('allows a coyote-time jump just after walking off a ledge', () => {
    const world = makeWorld({ height: (_x, z) => (z > 0.5 ? -2 : 0) });
    const state = createLocomotionState(0, 0, 0, 0);
    let jumped = false;
    for (let frame = 0; frame < 40 && !jumped; frame++) {
      const airborne = !state.grounded;
      const result = stepLocomotion(state, command({ jump: airborne && state.coyote > 0.06 }), 1 / 60, world, DEFAULT_TUNING);
      jumped = result.jumped;
    }
    expect(jumped).toBe(true);
  });

  it('refuses a jump once the coyote window has expired', () => {
    const world = makeWorld({ height: (_x, z) => (z > 0.5 ? -6 : 0) });
    const state = createLocomotionState(0, 0, 0, 0);
    let jumped = false;
    let waited = 0;
    for (let frame = 0; frame < 180; frame++) {
      if (!state.grounded) waited += 1 / 60;
      const press = !state.grounded && waited > 0.3 && waited < 0.35;
      const result = stepLocomotion(state, command({ jump: press, forward: 0.4 }), 1 / 60, world, DEFAULT_TUNING);
      if (result.jumped) jumped = true;
    }
    expect(jumped).toBe(false);
  });

  it('never ends a frame below the terrain while wandering and jumping', () => {
    const height = (x: number, z: number): number => Math.sin(x * 0.3) * 1.8 + Math.cos(z * 0.22) * 1.5;
    const world = makeWorld({ height, normalY: 0.9 });
    const startY = height(0, 0);
    const state = createLocomotionState(0, 0, 0, startY);
    let seed = 12345;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const { minGap } = simulate(state, world, 900, (frame) => {
      if (frame % 47 === 0) seed = (seed * 7 + 13) % 4294967296;
      return command({
        forward: random() > 0.25 ? 1 : -0.6,
        strafe: random() > 0.7 ? (random() > 0.5 ? 1 : -1) : 0,
        yaw: random() * Math.PI * 2,
        run: random() > 0.5,
        jump: frame % 53 === 0,
      });
    });
    expect(minGap).toBeGreaterThan(-0.002);
    expect(Number.isFinite(state.position.y)).toBe(true);
  });

  it('rejects a climb up a cliff face', () => {
    const world = makeWorld({
      height: (_x, z) => (z > 2 ? (z - 2) * 4 : 0),
      normalY: 0.35,
    });
    const state = createLocomotionState(0, 0, 0, 0);
    simulate(state, world, 180, () => command());
    expect(state.position.z).toBeLessThan(2.6);
  });

  it('keeps the expedition inside the boundary ring', () => {
    const world = makeWorld({ boundaryRadius: 8 });
    const state = createLocomotionState(0, 0, 0, 0);
    const { events } = simulate(state, world, 300, () => command({ run: true }));
    expect(Math.hypot(state.position.x, state.position.z)).toBeLessThanOrEqual(8.01);
    expect(events.some((event) => event.boundary)).toBe(true);
  });

  it('is pushed out of solid props and slides along them', () => {
    const collision = new CollisionWorld();
    collision.add({ x: 0, z: 3, radius: 0.8, base: -1, top: 4, walkable: false, kind: 'pillar' });
    const world = makeWorld({ collision });
    const state = createLocomotionState(0, 0, 0, 0);
    const { events } = simulate(state, world, 150, () => command());
    expect(state.position.z).toBeLessThan(3 - 0.8 - DEFAULT.capsuleRadius + 0.06);
    expect(events.some((event) => event.hitWall)).toBe(true);
    expect(state.position.y).toBeCloseTo(0, 4);
  });

  it('falls off a tall platform instead of snapping down to the terrain', () => {
    const collision = new CollisionWorld();
    collision.add({ x: 0, z: 0, radius: 1.4, base: 0, top: 1.15, walkable: true, kind: 'plateau' });
    const world = {
      terrainHeight: () => 0,
      groundHeight: () => 0,
      normalY: () => 1,
      waterLevel: -100,
      boundaryRadius: 400,
      collision,
    };
    const state = createLocomotionState(0, 0, 0, 1.15);
    stepLocomotion(state, { forward: 0, strafe: 0, yaw: 0, run: false, jump: false }, 1 / 60, world, DEFAULT_TUNING);
    expect(state.grounded).toBe(true);
    // Walk north until the capsule clears the platform edge.
    const run = simulate(state, world, 45, () => command());
    expect(state.position.z).toBeGreaterThan(1.4);
    expect(state.grounded).toBe(false);
    expect(state.position.y).toBeLessThan(1.0);
    expect(state.position.y).toBeGreaterThan(0);
    expect(run.events.some((event) => event.landed > 0)).toBe(false);
  });

  it('steps onto a low walkable platform', () => {
    const collision = new CollisionWorld();
    collision.add({ x: 0, z: 2.5, radius: 2.5, base: 0, top: 0.45, walkable: true, kind: 'step' });
    const world = makeWorld({ collision });
    const state = createLocomotionState(0, 0, 0, 0);
    // The platform spans z = 0..5; 70 frames of walking keeps the character on it.
    simulate(state, world, 70, () => command());
    expect(state.position.z).toBeGreaterThan(2);
    expect(state.position.y).toBeCloseTo(0.45, 2);
    expect(state.grounded).toBe(true);
  });

  it('is blocked by a platform taller than the step height', () => {
    const collision = new CollisionWorld();
    collision.add({ x: 0, z: 2.5, radius: 2.5, base: 0, top: 1.6, walkable: true, kind: 'plinth' });
    const world = makeWorld({ collision });
    const state = createLocomotionState(0, 0, 0, 0);
    simulate(state, world, 120, () => command());
    expect(state.position.z).toBeLessThan(0.2);
  });

  it('slows down and wades in deep water', () => {
    const world = makeWorld({ height: () => -2.5, waterLevel: 0 });
    const state = createLocomotionState(0, 0, 0, -2.5);
    simulate(state, world, 120, () => command());
    expect(state.wading).toBe(true);
    expect(state.speed).toBeLessThan(PLAYER_LIMIT);
  });

  it('keeps heading and turn rate finite while weaving', () => {
    const world = makeWorld();
    const state = createLocomotionState(0, 0, 0, 0);
    for (let frame = 0; frame < 240; frame++) {
      stepLocomotion(
        state,
        command({ forward: 1, strafe: Math.sin(frame * 0.05) }),
        1 / 60,
        world,
        DEFAULT_TUNING,
      );
      expect(Number.isFinite(state.heading)).toBe(true);
      expect(Number.isFinite(state.turnRate)).toBe(true);
    }
    expect(Math.abs(state.turnRate)).toBeLessThan(200);
  });
});

const DEFAULT = DEFAULT_TUNING;
const PLAYER_LIMIT = DEFAULT.walkSpeed * 0.55;
