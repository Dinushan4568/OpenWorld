import { describe, expect, it } from 'vitest';
import { CreatureBrain, createBrain, createBrainConfig, STATE_LABELS } from '../src/game/creatures/brain';
import { CREATURE_SPAWNS, SPECIES, type CreatureSpawn } from '../src/game/creatures/species';
import type { BrainWorld, EnvironmentEvent, TerrainProbe, Vec2 } from '../src/game/creatures/types';

const flat = (): TerrainProbe => ({ height: 0, slope: 0, water: false });

interface WorldOptions {
  player?: Partial<BrainWorld['player']>;
  night?: number;
  events?: readonly EnvironmentEvent[];
  sample?: (x: number, z: number) => TerrainProbe;
  blocked?: (x: number, z: number) => boolean;
  neighbours?: readonly Vec2[];
}

function makeWorld(options: WorldOptions = {}): BrainWorld {
  return {
    player: {
      x: 400,
      z: 400,
      speed: 0,
      crouch: false,
      sprinting: false,
      visible: false,
      ...options.player,
    },
    events: options.events ?? [],
    sample: options.sample ?? flat,
    blocked: options.blocked ?? (() => false),
    neighbours: options.neighbours,
    boundsRadius: 330,
    night: options.night ?? 0,
  };
}

function spawnOf(id: string): CreatureSpawn {
  const spawn = CREATURE_SPAWNS.find((entry) => entry.id === id);
  if (!spawn) throw new Error(`missing spawn ${id}`);
  return spawn;
}

function simulate(brain: CreatureBrain, world: BrainWorld, seconds: number, dt = 1 / 30): ReturnType<CreatureBrain['update']> {
  let output = brain.update(dt, world);
  const steps = Math.round(seconds / dt);
  for (let i = 1; i < steps; i += 1) output = brain.update(dt, world);
  return output;
}

describe('reusable creature brain', () => {
  it('starts idle and then walks its patrol without any player present', () => {
    const brain = createBrain(spawnOf('grazer-meadow'));
    const world = makeWorld();
    const start = { x: brain.x, z: brain.z };
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 30; i += 1) {
      const output = brain.update(1 / 30, world);
      seen.add(output.state);
    }
    expect(seen.has('patrol') || seen.has('idle')).toBe(true);
    expect(Math.hypot(brain.x - start.x, brain.z - start.z)).toBeGreaterThan(2);
    expect(brain.homeDistance).toBeLessThanOrEqual(brain.config.leashRadius + 2);
  });

  it('roams around its den when it has no patrol route', () => {
    const brain = createBrain(spawnOf('scuttler-plaza'));
    expect(brain.config.patrol).toHaveLength(0);
    const world = makeWorld();
    const start = { x: brain.x, z: brain.z };
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 30; i += 1) {
      seen.add(brain.update(1 / 30, world).state);
      expect(brain.homeDistance).toBeLessThan(brain.config.roamRadius + 5);
    }
    expect(seen.has('roam')).toBe(true);
    expect(seen.has('idle')).toBe(true);
    expect(Math.hypot(brain.x - start.x, brain.z - start.z)).toBeGreaterThan(1.5);
  });

  it('returns to its patrol area after being displaced', () => {
    const brain = createBrain(spawnOf('warden-city'));
    const home = brain.config.home;
    brain.x = home.x + 75;
    brain.z = home.z + 20;
    const world = makeWorld();
    const first = brain.update(1 / 30, world);
    expect(first.state).toBe('return');
    for (let i = 0; i < 90 * 30; i += 1) brain.update(1 / 30, world);
    expect(brain.homeDistance).toBeLessThan(6);
  });

  it('detects a player standing in front of it', () => {
    const brain = createBrain(spawnOf('warden-city'));
    const world = makeWorld({
      player: {
        x: brain.x + Math.sin(brain.yaw) * 12,
        z: brain.z + Math.cos(brain.yaw) * 12,
        speed: 2.4,
        visible: true,
      },
    });
    const output = simulate(brain, world, 3.5);
    expect(output.awareness).toBeGreaterThan(0.7);
    expect(output.alert).toBe(true);
    expect(['alert', 'display']).toContain(output.state);
  });

  it('sees a sprinting player from further away than a crouching one', () => {
    const spawn = spawnOf('scuttler-grove-1');
    const crouched = createBrain(spawn);
    const sprinting = createBrain(spawn);
    const crouchWorld = makeWorld({ player: { x: crouched.x, z: crouched.z + 20, speed: 1, crouch: true, visible: true } });
    const sprintWorld = makeWorld({ player: { x: sprinting.x, z: sprinting.z + 20, speed: 4.5, sprinting: true, visible: true } });
    const a = simulate(crouched, crouchWorld, 1.5);
    const b = simulate(sprinting, sprintWorld, 1.5);
    expect(a.awareness).toBeLessThan(0.2);
    expect(b.awareness).toBeGreaterThan(a.awareness + 0.2);
  });

  it('sees worse after dark as a small scavenger, and better as a guardian', () => {
    const spawn = spawnOf('scuttler-grove-1');
    const day = createBrain(spawn);
    const night = createBrain(spawn);
    const dayWorld = makeWorld({
      player: { x: day.x + Math.sin(day.yaw) * 24, z: day.z + Math.cos(day.yaw) * 24, speed: 2, visible: true },
      night: 0,
    });
    const nightWorld = makeWorld({
      player: { x: night.x + Math.sin(night.yaw) * 24, z: night.z + Math.cos(night.yaw) * 24, speed: 2, visible: true },
      night: 1,
    });
    const dayAwareness = simulate(day, dayWorld, 1.5).awareness;
    const nightAwareness = simulate(night, nightWorld, 1.5).awareness;
    expect(dayAwareness).toBeGreaterThan(nightAwareness + 0.1);
    expect(createBrainConfig(spawnOf('warden-city')).nightSight).toBeGreaterThan(1);
    expect(createBrainConfig(spawn).nightSight).toBeLessThan(1);
  });

  it('hears movement through cover even when it cannot see the player', () => {
    const brain = createBrain(spawnOf('grazer-meadow'));
    const world = makeWorld({
      player: { x: brain.x + 6, z: brain.z + 10, speed: 3, visible: false },
    });
    const output = simulate(brain, world, 2.5);
    expect(output.awareness).toBeGreaterThan(0.1);
    expect(output.awareness).toBeLessThan(0.9);
  });

  it('reacts to nearby environmental events with curiosity or alarm', () => {
    const curious = createBrain(spawnOf('scuttler-plaza'));
    const calmEvent: EnvironmentEvent = {
      id: 'wind-1',
      kind: 'wind-gust',
      x: curious.x + 8,
      z: curious.z,
      radius: 30,
      startling: 0.2,
      label: 'A gust rolls through the grass.',
    };
    const curiousWorld = makeWorld({ events: [calmEvent] });
    const curiousReaction = curious.update(1 / 30, curiousWorld).reaction;
    expect(curiousReaction?.mode).toBe('investigate');
    const curiousOutput = simulate(curious, curiousWorld, 0.5);
    expect(['investigate', 'roam', 'patrol', 'idle']).toContain(curiousOutput.state);

    const skittish = createBrain(spawnOf('scuttler-grove-1'));
    const loudEvent: EnvironmentEvent = {
      id: 'surge-1',
      kind: 'waterfall-surge',
      x: skittish.x + 6,
      z: skittish.z,
      radius: 40,
      startling: 0.95,
      label: 'The falls surge.',
    };
    const alarmedWorld = makeWorld({ events: [loudEvent] });
    expect(skittish.update(1 / 30, alarmedWorld).reaction?.mode).toBe('flee');
    const alarmedOutput = simulate(skittish, alarmedWorld, 0.8);
    expect(alarmedOutput.state).toBe('flee');
    expect(alarmedOutput.speed).toBeGreaterThan(0.5);
  });

  it('ignores events beyond their radius and remembers each event once', () => {
    const brain = createBrain(spawnOf('grazer-meadow'));
    const far: EnvironmentEvent = {
      id: 'far-event',
      kind: 'city-beacon',
      x: brain.x + 300,
      z: brain.z,
      radius: 20,
      startling: 0.4,
      label: 'Distant beacon.',
    };
    const near: EnvironmentEvent = {
      id: 'near-event',
      kind: 'reactor-pulse',
      x: brain.x + 10,
      z: brain.z,
      radius: 40,
      startling: 0.2,
      label: 'The reactor hums.',
    };
    const world = makeWorld({ events: [far, near] });
    expect(brain.update(1 / 30, world).reaction?.event.id).toBe('near-event');
    // The same event should not be "discovered" again as it persists.
    expect(brain.update(1 / 30, world).reaction).toBeNull();
  });

  it('is dazed by an energy pulse and recovers', () => {
    const brain = createBrain(spawnOf('grazer-meadow'));
    const world = makeWorld();
    brain.startle(0.9);
    brain.disturb(1);
    const dazed = brain.update(1 / 30, world);
    expect(dazed.dazed).toBe(true);
    expect(dazed.state).toBe('dazed');
    expect(dazed.speed).toBeLessThan(0.1);
    const recovered = simulate(brain, world, 4.5);
    expect(recovered.dazed).toBe(false);
    expect(recovered.awareness).toBeLessThan(0.6);
  });

  it('plays a scripted display and then resumes its personality', () => {
    const brain = createBrain(spawnOf('warden-city'));
    const world = makeWorld({ player: { x: brain.x, z: brain.z + 10, speed: 1, visible: true } });
    expect(brain.display(3)).toBe(true);
    expect(brain.display(3)).toBe(false);
    const during = brain.update(1 / 30, world);
    expect(during.state).toBe('display');
    expect(during.display).toBeLessThan(0.1);
    const after = simulate(brain, world, 3.6);
    expect(['alert', 'flee', 'display']).toContain(after.state);
    expect(after.state).not.toBe('display');
  });

  it('never walks into water, blocked props or out of bounds', () => {
    const brain = createBrain({
      ...spawnOf('scuttler-plaza'),
      x: 0,
      z: 0,
      heading: 0,
      patrol: [
        { x: 14, z: 0 },
        { x: 0, z: 14 },
      ],
    });
    const world = makeWorld({
      sample: (x, z) => ({ height: 0, slope: 0, water: x > 3 || z > 10 }),
      blocked: (x, z) => x < -6 && Math.abs(z) < 8,
      neighbours: [{ x: 1.5, z: 1.5 }],
    });
    for (let i = 0; i < 90 * 30; i += 1) {
      brain.update(1 / 30, world);
      expect(brain.x).toBeLessThanOrEqual(3.2);
      expect(brain.z).toBeLessThanOrEqual(10.2);
      expect(brain.x).toBeGreaterThanOrEqual(-6.1);
    }
  });

  it('keeps gliders inside the basin regardless of terrain', () => {
    const brain = createBrain(spawnOf('drifter-lake'));
    brain.x = 0;
    brain.z = 0;
    const world = makeWorld({
      sample: (x) => ({ height: x * 0.1, slope: 90, water: true }),
      blocked: () => true,
      boundsRadius: 120,
    });
    for (let i = 0; i < 120 * 30; i += 1) {
      brain.update(1 / 30, world);
      expect(Math.hypot(brain.x, brain.z)).toBeLessThan(112);
    }
  });

  it('is deterministic for a given spawn', () => {
    const a = createBrain(spawnOf('grazer-grove'));
    const b = createBrain(spawnOf('grazer-grove'));
    const world = makeWorld({ player: { x: 150, z: -50, speed: 3, visible: true } });
    for (let i = 0; i < 40 * 30; i += 1) {
      a.update(1 / 30, world);
      b.update(1 / 30, world);
    }
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.z).toBeCloseTo(b.z, 9);
    expect(a.yaw).toBeCloseTo(b.yaw, 9);
    expect(a.state).toBe(b.state);
  });

  it('reuses one state machine for four distinct personalities', () => {
    const outcomes: Record<string, string> = {};
    for (const kind of ['scuttler', 'grazer', 'drifter', 'warden'] as const) {
      const spawn = CREATURE_SPAWNS.find((entry) => entry.kind === kind);
      if (!spawn) throw new Error(`no spawn for ${kind}`);
      const brain = createBrain({ ...spawn, x: 120, z: 60, heading: 0 });
      const world = makeWorld({ player: { x: 120, z: 70, speed: 2.5, visible: true } });
      const output = simulate(brain, world, 3.2);
      outcomes[kind] = output.state;
    }
    // Scuttlers bolt; guardians stand their ground; the rest react on a spectrum.
    expect(outcomes.scuttler).toMatch(/flee/);
    expect(outcomes.warden).toMatch(/alert|display/);
    expect(outcomes.grazer).toMatch(/alert|display|flee/);
    expect(outcomes.drifter).toMatch(/flee|alert|display/);
  });

  it('labels every state for the HUD and factory configs stay in range', () => {
    for (const kind of ['scuttler', 'grazer', 'drifter', 'warden'] as const) {
      const spawn = CREATURE_SPAWNS.find((entry) => entry.kind === kind);
      if (!spawn) throw new Error('missing spawn');
      const config = createBrainConfig(spawn);
      expect(config.fovCos).toBeGreaterThan(-1);
      expect(config.fovCos).toBeLessThan(0.8);
      expect(config.aggression).toBeGreaterThanOrEqual(0);
      expect(config.aggression).toBeLessThanOrEqual(1);
      expect(config.awarenessRate).toBeGreaterThan(0);
      expect(config.leashRadius).toBeGreaterThan(config.roamRadius);
      expect(speciesLabel(config.kind)).toBeTruthy();
    }
    for (const label of Object.values(STATE_LABELS)) expect(label.length).toBeGreaterThan(3);
  });
});

function speciesLabel(kind: keyof typeof SPECIES): string {
  return SPECIES[kind].name;
}
