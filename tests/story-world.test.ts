// @vitest-environment jsdom
import * as pc from 'playcanvas';
import { describe, expect, it } from 'vitest';
import { AssetManager } from '../src/game/core/AssetManager';
import { StoryWorld } from '../src/game/world/StoryWorld';
import { StoryDirector } from '../src/game/story/StoryDirector';
import { INTERACTABLES, NPCS } from '../src/game/story/content';
import { heightAt } from '../src/game/world/heightfield';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const playerAt = (x: number, z: number) => ({ x, y: heightAt(x, z), z });

async function makeWorld() {
  const canvas = document.createElement('canvas');
  const device = await pc.createGraphicsDevice(canvas, { deviceTypes: ['null'] } as never);
  const app = new pc.Application(canvas, { graphicsDevice: device } as never);
  const director = new StoryDirector(new MemoryStorage());
  const world = new StoryWorld(app, new AssetManager(app));
  const sync = (): void => world.apply(director.worldView());
  sync();
  return { app, director, world, sync };
}

function talk(
  director: StoryDirector,
  world: StoryWorld,
  npcId: string,
  x: number,
  z: number,
  choices: Array<[string, string]>,
): void {
  const nearest = world.nearestInteraction(playerAt(x, z));
  expect(nearest?.kind).toBe('npc');
  expect(nearest?.id).toBe(npcId);
  const session = director.beginNpcDialogue(npcId);
  if (!session) throw new Error(`No conversation for ${npcId}`);
  for (const [node, choice] of choices) {
    expect(session.view.nodeId).toBe(node);
    const step = director.choose(session, choice);
    if (step.view) session.view = step.view;
    if (step.close) {
      director.finishDialogue(session);
      return;
    }
  }
  director.finishDialogue(session);
}

function use(
  director: StoryDirector,
  world: StoryWorld,
  x: number,
  z: number,
): { type: string; id: string } {
  const nearest = world.nearestInteraction(playerAt(x, z));
  if (!nearest) throw new Error(`Nothing to interact with near ${x},${z}`);
  const result = director.interact(nearest.id);
  return { type: result.type, id: nearest.id };
}

describe('story world', () => {
  it('builds every character and story object at a grounded position', async () => {
    const canvas = document.createElement('canvas');
    const device = await pc.createGraphicsDevice(canvas, { deviceTypes: ['null'] } as never);
    const app = new pc.Application(canvas, { graphicsDevice: device } as never);
    const director = new StoryDirector(new MemoryStorage());
    const world = new StoryWorld(app, new AssetManager(app));

    expect(world.npcCount).toBe(3);
    expect(world.propCount).toBe(16);
    expect(world.placements).toHaveLength(19);
    for (const placement of world.placements) {
      expect(Number.isFinite(placement.x)).toBe(true);
      expect(Number.isFinite(placement.y)).toBe(true);
      expect(Number.isFinite(placement.z)).toBe(true);
      expect(Math.abs(placement.y - heightAt(placement.x, placement.z))).toBeLessThan(1);
    }

    world.apply(director.worldView());
    const iona = world.nearestInteraction(playerAt(40, 4));
    expect(iona?.kind).toBe('npc');
    expect(iona?.id).toBe('iona');
    const memorial = world.nearestInteraction(playerAt(38, -46));
    expect(memorial?.id).toBe('memory-plaza');
    // The survey ledger is dormant until Iona asks for it.
    expect(world.nearestInteraction(playerAt(54, -20))).toBeNull();

    director.missions.notify({ type: 'talk', target: 'iona' });
    world.apply(director.worldView());
    const ledger = world.nearestInteraction(playerAt(54, -20));
    expect(ledger?.kind).toBe('prop');
    expect(ledger?.id).toBe('survey-ledger');
    expect(ledger?.label).toBe("Recover Mara Vale's survey ledger");

    for (let i = 0; i < 90; i += 1) world.update(1 / 30, i / 30, playerAt(40, 4));
    expect(world.elapsed).toBeGreaterThan(0);

    expect(() => world.dispose()).not.toThrow();
    expect(world.root.parent).toBeNull();
  });

  it('plays the main chapter through proximity prompts and real story objects', async () => {
    const { director, world, sync } = await makeWorld();
    talk(director, world, 'iona', 40, 4, [
      ['start', 'ask'],
      ['ask', 'accept'],
    ]);
    sync();
    expect(use(director, world, 54, -20)).toEqual({ type: 'pickup', id: 'survey-ledger' });
    sync();
    talk(director, world, 'iona', 40, 4, [
      ['start', 'read'],
      ['reveal', 'theta'],
      ['theta', 'accept_main'],
    ]);
    expect(director.state.completed).toContain('main_survey');

    director.updatePosition(-100, 190);
    sync();
    talk(director, world, 'sable9', -100, 178, [
      ['start', 'what'],
      ['what', 'witness'],
      ['witness', 'accept'],
    ]);
    sync();
    expect(use(director, world, -108, 178).type).toBe('puzzle');
    const puzzle = director.interact('continuity-console');
    if (puzzle.type === 'puzzle') director.solvePuzzle(puzzle.puzzle.id);
    sync();
    expect(use(director, world, -94, 182)).toEqual({ type: 'pickup', id: 'continuity-key' });
    sync();
    talk(director, world, 'iona', 40, 4, [
      ['start', 'gate'],
      ['gate', 'plan'],
      ['plan', 'accept_gate'],
    ]);
    sync();
    director.setShards(5);
    sync();
    expect(director.currentObjective()?.id).toBe('meet_iona_gate');
    talk(director, world, 'iona', 140, 86, [
      ['start', 'ready'],
      ['ready', 'go'],
    ]);
    sync();
    expect(use(director, world, 152, 88).type).toBe('puzzle');
    director.solvePuzzle('witness-array');
    sync();
    const witness = director.interact('gate-witness');
    expect(witness.type).toBe('dialogue');
    if (witness.type !== 'dialogue') return;
    const session = witness.session;
    for (const [node, choice] of [['start', 'want'], ['want', 'broadcast'], ['broadcast_confirm', 'choose_return']] as const) {
      expect(session.view.nodeId).toBe(node);
      const step = director.choose(session, choice);
      if (step.view) session.view = step.view;
      if (choice === 'choose_return') expect(step.close).toBe(true);
    }
    director.finishDialogue(session);
    expect(director.state.ending).toBe('broadcast');
    expect(director.chapterComplete).toBe(true);
    expect(world.nearestInteraction(playerAt(140, 86))?.id).toBe('iona');

    world.dispose();
  });


  it('places every side objective, character and memorial at a usable position', async () => {
    const { director, world, sync } = await makeWorld();
    for (const mission of ['side_caches', 'side_stakes', 'side_caretakers']) {
      expect(director.missions.startMission(mission, { force: true })).toBe(true);
    }
    sync();

    for (const id of ['cache-north', 'cache-west', 'cache-south']) {
      const entry = INTERACTABLES.find((item) => item.id === id);
      if (!entry) throw new Error(`missing ${id}`);
      const nearest = world.nearestInteraction(playerAt(entry.x, entry.z));
      expect(nearest?.id).toBe(id);
      expect(director.interact(id).type).toBe('pickup');
      sync();
    }
    for (const id of ['stake-east', 'stake-forest', 'stake-ridge']) {
      const entry = INTERACTABLES.find((item) => item.id === id);
      if (!entry) throw new Error(`missing ${id}`);
      const nearest = world.nearestInteraction(playerAt(entry.x, entry.z));
      expect(nearest?.id).toBe(id);
      expect(director.interact(id).type).toBe('pickup');
      sync();
    }

    for (const npc of NPCS) {
      expect(world.nearestInteraction(playerAt(npc.home.x, npc.home.z))?.id).toBe(npc.id);
    }
    for (const memory of INTERACTABLES.filter((entry) => entry.memory)) {
      expect(world.nearestInteraction(playerAt(memory.x, memory.z))?.id).toBe(memory.id);
    }

    world.dispose();
  });
});
