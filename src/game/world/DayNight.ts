import { Color, type AppBase } from 'playcanvas';
import type { QualityProfile } from '../config';
import { clamp } from '../util/math';
import type { ChunkManager } from './ChunkManager';
import type { Landmarks } from './Landmarks';
import type { Lighting } from './Lighting';
import type { SkySystem } from './Sky';
import type { SkyDome } from './SkyDome';
import type { Water } from './Water';
import {
  keyDirection,
  phaseName,
  sampleSky,
  sunPosition,
  wrapHour,
  type SkySample,
} from './dayNightPalette';

export interface DayNightTargets {
  water?: Water;
  chunks?: ChunkManager;
  landmarks?: Landmarks;
}

/**
 * Drives the full day/night cycle: sun and moon positions, sky colours, fog,
 * exposure, ambient light, water tint and every practical emissive.
 *
 * All transitions are continuous — the palette is interpolated by the hour and
 * the sun's elevation follows a smooth sinusoid, so sunrise, sunset and night
 * never pop. `dayLengthMinutes = 0` freezes the current time for screenshots
 * or players who prefer perpetual golden hour.
 */
export class DayNight {
  hour: number;
  dayLengthMinutes: number;
  readonly startHour: number;
  private readonly app: AppBase;
  private readonly sky: SkySystem;
  private readonly dome: SkyDome;
  private readonly lighting: Lighting;
  private readonly profile: QualityProfile;
  private readonly targets: DayNightTargets;
  private sample: SkySample;
  private lastApplied = -1;

  constructor(
    app: AppBase,
    sky: SkySystem,
    dome: SkyDome,
    lighting: Lighting,
    profile: QualityProfile,
    targets: DayNightTargets = {},
    startHour = 7.4,
    dayLengthMinutes = 12,
  ) {
    this.app = app;
    this.sky = sky;
    this.dome = dome;
    this.lighting = lighting;
    this.profile = profile;
    this.targets = targets;
    this.startHour = wrapHour(startHour);
    this.hour = this.startHour;
    this.dayLengthMinutes = Math.max(0, dayLengthMinutes);
    this.sample = sampleSky(this.hour);
    this.apply(this.sample, true);
  }

  setDayLength(minutes: number): void {
    this.dayLengthMinutes = clamp(minutes, 0, 120);
  }

  setHour(hour: number): void {
    this.hour = wrapHour(hour);
  }

  /** Skip forward in time (used by debug shortcuts and the HUD clock). */
  advance(hours: number): void {
    this.hour = wrapHour(this.hour + hours);
  }

  get phase(): string {
    return phaseName(this.hour);
  }

  get isNight(): boolean {
    return this.sample.night > 0.55;
  }

  /** 24h clock label, e.g. "07:24 · Morning". */
  get clockLabel(): string {
    const totalMinutes = Math.floor(this.hour * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} · ${this.phase}`;
  }

  get current(): SkySample {
    return this.sample;
  }

  update(dt: number, player: { x: number; y: number; z: number }, camera: { x: number; y: number; z: number }): void {
    if (this.dayLengthMinutes > 0) {
      this.hour = wrapHour(this.hour + (dt * 24) / (this.dayLengthMinutes * 60));
    }
    const sample = sampleSky(this.hour);
    this.sample = sample;
    this.apply(sample);
    this.dome.update(dt, camera);
  }

  private apply(sample: SkySample, force = false): void {
    // Palette materials do not need rebuilding every frame; the dome and the
    // lamps are refreshed when the hour has moved meaningfully.
    const changed = force || Math.abs(this.hour - this.lastApplied) > 0.004 || this.lastApplied < 0;
    const sun = sunPosition(this.hour);
    const moonDirection: [number, number, number] = [
      -sun.direction[0],
      -sun.direction[1],
      -sun.direction[2],
    ];

    this.dome.setDirections(sun.direction, moonDirection, sun.aboveHorizon);
    if (changed) {
      this.lastApplied = this.hour;
      this.dome.setPalette(sample.zenith, sample.horizon, sample.stars);
      this.dome.setSunColor(sample.sunColor);
    }

    const key = keyDirection(this.hour);
    this.lighting.setEnvironment(
      key,
      new Color(...sample.sunColor),
      sample.sunIntensity,
      new Color(...sample.fillColor),
      sample.fillIntensity,
      sample.night,
    );

    const scene = this.app.scene;
    scene.ambientLight = new Color(...sample.ambient);
    scene.exposure = sample.exposure;
    scene.skyboxIntensity = 0.2 + (1 - sample.night) * 0.8;

    // The sky system owns the linear fog range; the palette only supplies colour.
    this.sky.applyFog(sample.fog, this.profile.drawDistance * 0.16, this.profile.drawDistance * 1.35);

    if (changed) {
      this.targets.water?.setEnvironment(sample.fog, sample.night);
      this.targets.chunks?.setNight(sample.night);
      this.targets.landmarks?.setNight(sample.night);
    }
  }

  dispose(): void {
    this.dome.dispose();
  }
}
