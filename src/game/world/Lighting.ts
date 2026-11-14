import { Color, Entity, type AppBase } from 'playcanvas';
import { WORLD, type QualityProfile } from '../config';

export interface LightingAnchors {
  gate: { x: number; y: number; z: number };
  plaza: { x: number; y: number; z: number };
}

/**
 * Golden-hour key light with cascaded shadows, a cool sky fill and practical
 * emissive accents at the ruins. The key light follows the player so shadow
 * texels stay concentrated where they matter.
 */
export class Lighting {
  readonly root: Entity;
  readonly sun: Entity;
  readonly fill: Entity;
  private readonly accents: Entity[] = [];
  private readonly sunDirection: [number, number, number];
  private readonly profile: QualityProfile;
  private lastAnchorX = Number.NaN;
  private lastAnchorZ = Number.NaN;

  constructor(app: AppBase, sunDirection: [number, number, number], profile: QualityProfile, anchors: LightingAnchors) {
    this.root = new Entity('lighting');
    this.sunDirection = sunDirection;
    this.profile = profile;

    this.sun = new Entity('sun');
    this.sun.addComponent('light', {
      type: 'directional',
      color: new Color(1.0, 0.9, 0.77),
      intensity: 1.85,
      castShadows: profile.shadows,
      shadowResolution: profile.shadowResolution,
      shadowDistance: profile.shadowDistance,
      shadowBias: 0.18,
      normalOffsetBias: 0.06,
      numCascades: 3,
      cascadeDistribution: 0.55,
    });
    this.root.addChild(this.sun);

    this.fill = new Entity('sky-fill');
    this.fill.addComponent('light', {
      type: 'directional',
      color: new Color(0.5, 0.68, 0.78),
      intensity: 0.38,
      castShadows: false,
    });
    this.root.addChild(this.fill);

    this.addAccent(app, 'gate-glow', anchors.gate.x, anchors.gate.y + 6, anchors.gate.z, new Color(0.32, 0.95, 0.82), 4.2, 46);
    this.addAccent(app, 'plaza-glow', anchors.plaza.x, anchors.plaza.y + 3, anchors.plaza.z, new Color(0.38, 0.9, 0.8), 2.2, 26);

    app.root.addChild(this.root);
    this.sun.setPosition(sunDirection[0] * 380, sunDirection[1] * 380, sunDirection[2] * 380);
    this.sun.lookAt(0, 0, 0);
    // Cool fill arrives from the antisolar direction, low over the ridge.
    this.fill.setPosition(-sunDirection[0] * 300, 140, -sunDirection[2] * 300);
    this.fill.lookAt(0, 0, 0);
  }

  private addAccent(
    app: AppBase,
    name: string,
    x: number,
    y: number,
    z: number,
    color: Color,
    intensity: number,
    range: number,
  ): void {
    const accent = new Entity(name);
    accent.addComponent('light', {
      type: 'point',
      color,
      intensity,
      range,
      castShadows: false,
    });
    accent.setPosition(x, y, z);
    this.root.addChild(accent);
    this.accents.push(accent);
    void app;
  }

  applyQuality(profile: QualityProfile): void {
    this.sun.light!.castShadows = profile.shadows;
    this.sun.light!.shadowResolution = profile.shadowResolution;
    this.sun.light!.shadowDistance = profile.shadowDistance;
  }

  /** Keep shadow cascades centred on the expedition. */
  update(targetX: number, targetZ: number, groundY: number): void {
    if (Math.abs(targetX - this.lastAnchorX) < 1.5 && Math.abs(targetZ - this.lastAnchorZ) < 1.5) return;
    this.lastAnchorX = targetX;
    this.lastAnchorZ = targetZ;
    const height = Math.max(30, groundY + 12);
    this.sun.setPosition(
      targetX + this.sunDirection[0] * 380,
      height + this.sunDirection[1] * 380,
      targetZ + this.sunDirection[2] * 380,
    );
    this.sun.lookAt(targetX, groundY, targetZ);

    this.fill.setPosition(targetX - this.sunDirection[0] * 300, groundY + 150, targetZ - this.sunDirection[2] * 300);
    this.fill.lookAt(targetX, groundY, targetZ);
  }

  /** Slow ember-like flicker on the ruin lamps. */
  tick(time: number): void {
    for (let i = 0; i < this.accents.length; i++) {
      const light = this.accents[i].light!;
      const base = i === 0 ? 4.2 : 2.2;
      light.intensity = base * (0.9 + Math.sin(time * (i === 0 ? 0.7 : 1.1) + i * 2.3) * 0.1);
    }
  }

  get sunDir(): [number, number, number] {
    return this.sunDirection;
  }
}

export const LIGHTING_TARGET = {
  gate: {
    x: WORLD.gateCenter.x,
    y: 9.6,
    z: WORLD.gateCenter.z,
  },
  plaza: {
    x: WORLD.plazaCenter.x,
    y: 4.1,
    z: WORLD.plazaCenter.z,
  },
};
