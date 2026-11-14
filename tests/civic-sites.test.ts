// @vitest-environment jsdom
import * as pc from 'playcanvas';
import { describe, expect, it } from 'vitest';
import { QUALITY_PROFILES } from '../src/game/config';
import { AssetManager } from '../src/game/core/AssetManager';
import { CivicSites } from '../src/game/world/CivicSites';
import { CollisionWorld } from '../src/game/world/collision';
import { Lighting } from '../src/game/world/Lighting';

/**
 * Regression: the site materials are created before `this.materials` exists,
 * so their ownership list must be passed in explicitly. This used to throw
 * "Cannot read properties of undefined (reading 'owned')" during World.build.
 */
describe('hero architecture', () => {
  it('builds the city, reactor, Mother Tree and bridge without throwing', async () => {
    const canvas = document.createElement('canvas');
    const device = await pc.createGraphicsDevice(canvas, { deviceTypes: ['null'] } as never);
    const app = new pc.Application(canvas, { graphicsDevice: device } as never);
    const lighting = new Lighting(app, [0.3, 1, 0.2], QUALITY_PROFILES.low, {
      gate: { x: 152, y: 0, z: 74 },
      plaza: { x: 46, y: 0, z: -34 },
    });
    const collision = new CollisionWorld();
    const civic = new CivicSites(app, new AssetManager(app), lighting, collision);

    expect(civic.root.children.length).toBeGreaterThan(20);
    expect(collision.count).toBeGreaterThan(0);

    expect(() => civic.dispose()).not.toThrow();
    expect(civic.root.parent).toBeNull();
    lighting.root.destroy();
  });
});
