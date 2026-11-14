// @vitest-environment jsdom
import * as pc from 'playcanvas';
import { describe, expect, it } from 'vitest';
import { ResourceNodes } from '../src/game/world/ResourceNodes';
import { RESOURCE_NODES } from '../src/game/progression/content';
import { heightAt } from '../src/game/world/heightfield';

const playerAt = (x: number, z: number) => ({ x, y: heightAt(x, z), z });

async function make() {
  const canvas = document.createElement('canvas');
  const device = await pc.createGraphicsDevice(canvas, { deviceTypes: ['null'] } as never);
  const app = new pc.Application(canvas, { graphicsDevice: device } as never);
  return { app, nodes: new ResourceNodes(app) };
}

describe('resource node layer', () => {
  it('builds all authored caches and finds the nearest one', async () => {
    const { nodes } = await make();
    expect(nodes.placements).toHaveLength(RESOURCE_NODES.length);
    expect(nodes.root.name).toBe('resource-nodes');
    for (const placement of nodes.placements) {
      expect(Number.isFinite(placement.x)).toBe(true);
      expect(Number.isFinite(placement.y)).toBe(true);
      expect(Number.isFinite(placement.z)).toBe(true);
      expect(Math.abs(placement.y - heightAt(placement.x, placement.z))).toBeLessThan(1);
    }
    const first = RESOURCE_NODES[0];
    const interaction = nodes.nearestInteraction(playerAt(first.x, first.z));
    expect(interaction?.id).toBe(first.id);
    expect(interaction?.label).toContain('Gather');
    expect(nodes.remaining).toBe(RESOURCE_NODES.length);
    for (let i = 0; i < 40; i += 1) nodes.update(1 / 30, i / 30, playerAt(first.x, first.z));
    expect(nodes.elapsed).toBeGreaterThan(0);
    nodes.dispose();
    expect(nodes.root.parent).toBeNull();
  });

  it('hides gathered caches and exposes the survey marker state', async () => {
    const { nodes } = await make();
    const first = RESOURCE_NODES[0];
    nodes.apply([first.id], true);
    expect(nodes.survey).toBe(true);
    expect(nodes.remaining).toBe(RESOURCE_NODES.length - 1);
    expect(nodes.nearestInteraction(playerAt(first.x, first.z))).toBeNull();
    nodes.apply([], false);
    expect(nodes.survey).toBe(false);
    expect(nodes.remaining).toBe(RESOURCE_NODES.length);
    nodes.dispose();
  });
});
