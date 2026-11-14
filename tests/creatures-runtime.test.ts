// @vitest-environment jsdom
import * as pc from 'playcanvas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreatureManager } from '../src/game/creatures/CreatureManager';
import { CREATURE_SPAWNS, SPECIES_ORDER } from '../src/game/creatures/species';
import type { ScanReport } from '../src/game/creatures/types';
import { CollisionWorld } from '../src/game/world/collision';
import { heightAt } from '../src/game/world/heightfield';

/**
 * Headless integration test: builds the real PlayCanvas bodies against a null
 * graphics device and ticks the manager inside the real analytic terrain, so
 * geometry, animation plumbing, scanning and encounter logic are all exercised
 * without a browser.
 */
let manager: CreatureManager;

beforeAll(async () => {
  const canvas = document.createElement('canvas');
  const device = await pc.createGraphicsDevice(canvas, { deviceTypes: ['null'] } as never);
  const app = new pc.Application(canvas, { graphicsDevice: device } as never);
  manager = new CreatureManager(app, new CollisionWorld());
  manager.build();
});

afterAll(() => {
  manager.dispose();
});

const playerAt = (x: number, z: number, overrides: Partial<{ speed: number; crouch: boolean; sprinting: boolean }> = {}) => ({
  x,
  y: heightAt(x, z),
  z,
  speed: 0,
  crouch: false,
  sprinting: false,
  ...overrides,
});

describe('creature manager in the open world', () => {
  it('spawns every roster entry with a built body', () => {
    expect(manager.creatures).toHaveLength(CREATURE_SPAWNS.length);
    for (const kind of SPECIES_ORDER) {
      expect(manager.creatureCount(kind)).toBeGreaterThanOrEqual(2);
    }
    for (const creature of manager.creatures) {
      expect(creature.model.joints.length).toBeGreaterThan(5);
      const render = creature.root.findComponent('render') ?? creature.model.root.findComponent('render');
      expect(render).toBeTruthy();
      expect(Number.isFinite(creature.root.getPosition().y)).toBe(true);
    }
  });

  it('ticks for twenty seconds without leaving the terrain or the basin', () => {
    const player = playerAt(18, 8);
    for (let i = 0; i < 20 * 30; i += 1) {
      manager.update(1 / 30, i / 30, { player, night: 0.3, interactive: false });
    }
    for (const creature of manager.creatures) {
      const position = creature.root.getPosition();
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
      expect(Number.isFinite(position.z)).toBe(true);
      expect(Math.hypot(position.x, position.z)).toBeLessThan(330);
      if (creature.kind !== 'drifter') {
        expect(Math.abs(position.y - heightAt(position.x, position.z))).toBeLessThan(1.5);
      }
    }
  });

  it('scans a specimen in the camera cone and remembers it', () => {
    const grazer = manager.creatures.find((creature) => creature.kind === 'grazer');
    if (!grazer) throw new Error('grazer missing');
    const origin = playerAt(grazer.brain.x + 8, grazer.brain.z);
    // Camera forward is (-sin yaw, -cos yaw); +PI/2 looks toward -X.
    const report: ScanReport | null = manager.scan(origin, Math.PI / 2, 60);
    expect(report).not.toBeNull();
    expect(report?.kind).toBe('grazer');
    expect(report?.weakness.exploit.toLowerCase()).toContain('pulse');
    expect(report?.scanned).toBeGreaterThanOrEqual(1);
    expect(manager.scannedKinds.has('grazer')).toBe(true);
    expect(manager.hasScanCandidate(origin, Math.PI / 2)).toBe(true);
    expect(manager.hasScanCandidate(origin, -Math.PI / 2)).toBe(false);
  });

  it('dazes nearby machines with a non-violent echo pulse', () => {
    const warden = manager.creatures.find((creature) => creature.kind === 'warden');
    if (!warden) throw new Error('warden missing');
    warden.brain.startle(0.9);
    const before = manager.scannedKinds.size;
    const result = manager.pulse({ x: warden.brain.x, y: heightAt(warden.brain.x, warden.brain.z), z: warden.brain.z });
    expect(result.affected).toBeGreaterThanOrEqual(1);
    expect(result.warden).toBe(true);
    expect(warden.brain.state).toBe('dazed');
    expect(manager.scannedKinds.size).toBe(before);
    const residue = heightAt(warden.brain.x, warden.brain.z);
    expect(Number.isFinite(residue)).toBe(true);
  });

  it('frames a cinematic encounter the first time a large species is met', () => {
    const grazer = manager.creatures.find((creature) => creature.kind === 'grazer');
    if (!grazer) throw new Error('grazer missing');
    const encounters: string[] = [];
    let encounterId = '';
    const off = manager.on('encounter', ({ id, kind, duration, aim }) => {
      encounters.push(kind);
      encounterId = id;
      expect(duration).toBeGreaterThan(3);
      expect(Number.isFinite(aim.y)).toBe(true);
      expect(grazer.brain.state).toBe('display');
    });
    const player = playerAt(grazer.brain.x + 18, grazer.brain.z + 2, { speed: 1 });
    for (let i = 0; i < 30 * 20 && encounters.length === 0; i += 1) {
      manager.update(1 / 30, 20 + i / 30, { player, night: 0.2, interactive: true });
    }
    off();
    expect(encounters).toContain('grazer');
    const framed = manager.scanById(encounterId, player);
    expect(framed?.kind).toBe('grazer');
  });

  it('disposes cleanly', () => {
    expect(() => manager.dispose()).not.toThrow();
  });
});
