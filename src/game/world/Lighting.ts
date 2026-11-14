import { Color, Entity, type AppBase } from 'playcanvas';
import { WORLD, type QualityProfile } from '../config';
import { clamp } from '../util/math';

export interface LightingAnchors {
  gate: { x: number; y: number; z: number };
  plaza: { x: number; y: number; z: number };
}

interface Accent {
  entity: Entity;
  base: number;
  phase: number;
  rate: number;
}

/**
 * The key light (sun by day, moon by night), a cool sky fill and practical
 * emissive accents at the ruins and settlement. The key light follows the
 * player so shadow texels stay concentrated where they matter, and its colour,
 * intensity and direction are driven by the day/night cycle.
 */
export class Lighting {
  readonly root: Entity;
  readonly sun: Entity;
  readonly fill: Entity;
  private readonly accents: Accent[] = [];
  private readonly profile: QualityProfile;
  private direction: [number, number, number];
  private lastAnchorX = Number.NaN;
  private lastAnchorZ = Number.NaN;
  private lastKeyX = Number.NaN;
  private lastKeyZ = Number.NaN;
  private night = 0;
  private accentScale = 1;

  constructor(app: AppBase, sunDirection: [number, number, number], profile: QualityProfile, anchors: LightingAnchors) {
    this.root = new Entity('lighting');
    this.direction = [...sunDirection];
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

    this.addAccent('gate-glow', anchors.gate.x, anchors.gate.y + 6, anchors.gate.z, new Color(0.32, 0.95, 0.82), 4.2, 46, 0.7);
    this.addAccent('plaza-glow', anchors.plaza.x, anchors.plaza.y + 3, anchors.plaza.z, new Color(0.38, 0.9, 0.8), 2.2, 26, 1.1);

    app.root.addChild(this.root);
    this.placeKey(this.direction);
  }

  addAccent(
    name: string,
    x: number,
    y: number,
    z: number,
    color: Color,
    intensity: number,
    range: number,
    rate = 1,
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
    this.accents.push({ entity: accent, base: intensity, phase: this.accents.length * 2.3, rate });
  }

  applyQuality(profile: QualityProfile): void {
    this.sun.light!.castShadows = profile.shadows;
    this.sun.light!.shadowResolution = profile.shadowResolution;
    this.sun.light!.shadowDistance = profile.shadowDistance;
  }

  /** Applied once per frame by the day/night driver. */
  setEnvironment(keyDirection: [number, number, number], sunColor: Color, sunIntensity: number, fillColor: Color, fillIntensity: number, night: number): void {
    this.direction = [keyDirection[0], keyDirection[1], keyDirection[2]];
    this.night = clamp(night, 0, 1);
    this.sun.light!.color = sunColor;
    this.sun.light!.intensity = sunIntensity;
    this.fill.light!.color = fillColor;
    this.fill.light!.intensity = fillIntensity;
    this.accentScale = 0.35 + this.night * 1.15;
  }

  /** Keep shadow cascades centred on the expedition. */
  update(targetX: number, targetZ: number, groundY: number): void {
    const moved = Math.abs(targetX - this.lastAnchorX) >= 1.5 || Math.abs(targetZ - this.lastAnchorZ) >= 1.5;
    const turned =
      Math.abs(this.direction[0] - this.lastKeyX) >= 0.002 ||
      Math.abs(this.direction[2] - this.lastKeyZ) >= 0.002;
    if (!moved && !turned) return;
    this.placeKey(this.direction, targetX, targetZ, groundY);
    this.fill.setPosition(
      targetX - this.direction[0] * 300,
      groundY + 150,
      targetZ - this.direction[2] * 300,
    );
    this.fill.lookAt(targetX, groundY, targetZ);
  }

  private placeKey(direction: [number, number, number], targetX = 0, targetZ = 0, groundY = 0): void {
    this.lastAnchorX = targetX;
    this.lastAnchorZ = targetZ;
    this.lastKeyX = direction[0];
    this.lastKeyZ = direction[2];
    const height = Math.max(30, groundY + 12);
    this.sun.setPosition(
      targetX + direction[0] * 380,
      height + direction[1] * 380,
      targetZ + direction[2] * 380,
    );
    this.sun.lookAt(targetX, groundY, targetZ);
  }

  /** Slow ember-like flicker on the practical lights; brighter at night. */
  tick(time: number): void {
    for (const accent of this.accents) {
      const light = accent.entity.light;
      if (!light) continue;
      const flicker = 0.9 + Math.sin(time * accent.rate + accent.phase) * 0.1;
      light.intensity = accent.base * this.accentScale * flicker;
    }
  }

  get sunDir(): [number, number, number] {
    return [this.direction[0], this.direction[1], this.direction[2]];
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
