/** Persisted, validated user settings. Pure DOM/localStorage — no engine imports. */
import { GAME, QUALITY_PROFILES, type QualityPreset } from '../config';
import { clamp } from '../util/math';
import { Emitter } from './emitter';

export type TouchMode = 'auto' | 'always' | 'never';

export interface Settings {
  quality: QualityPreset;
  adaptiveResolution: boolean;
  fov: number;
  sensitivity: number;
  invertY: boolean;
  masterVolume: number;
  bloom: boolean;
  vignette: boolean;
  filmGrain: boolean;
  showFps: boolean;
  showHints: boolean;
  touchControls: TouchMode;
  reduceMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  adaptiveResolution: true,
  fov: 62,
  sensitivity: 1,
  invertY: false,
  masterVolume: 0.65,
  bloom: true,
  vignette: true,
  filmGrain: true,
  showFps: false,
  showHints: true,
  touchControls: 'auto',
  reduceMotion: false,
};

type SettingKey = keyof Settings;

interface SettingsEvents extends Record<string, unknown> {
  change: { settings: Settings; changed: SettingKey[] };
}

const QUALITY_IDS = Object.keys(QUALITY_PROFILES) as QualityPreset[];
const TOUCH_MODES: TouchMode[] = ['auto', 'always', 'never'];

export function sanitizeSettings(input: unknown, fallback: Settings = DEFAULT_SETTINGS): Settings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const num = (value: unknown, def: number, min: number, max: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : def;
  const bool = (value: unknown, def: boolean): boolean => (typeof value === 'boolean' ? value : def);

  return {
    quality: QUALITY_IDS.includes(raw.quality as QualityPreset) ? (raw.quality as QualityPreset) : fallback.quality,
    adaptiveResolution: bool(raw.adaptiveResolution, fallback.adaptiveResolution),
    fov: num(raw.fov, fallback.fov, 50, 92),
    sensitivity: num(raw.sensitivity, fallback.sensitivity, 0.25, 3),
    invertY: bool(raw.invertY, fallback.invertY),
    masterVolume: num(raw.masterVolume, fallback.masterVolume, 0, 1),
    bloom: bool(raw.bloom, fallback.bloom),
    vignette: bool(raw.vignette, fallback.vignette),
    filmGrain: bool(raw.filmGrain, fallback.filmGrain),
    showFps: bool(raw.showFps, fallback.showFps),
    showHints: bool(raw.showHints, fallback.showHints),
    touchControls: TOUCH_MODES.includes(raw.touchControls as TouchMode)
      ? (raw.touchControls as TouchMode)
      : fallback.touchControls,
    reduceMotion: bool(raw.reduceMotion, fallback.reduceMotion),
  };
}

export class SettingsStore extends Emitter<SettingsEvents> {
  private state: Settings;
  private readonly storage: Storage | null;

  constructor(storage?: Storage | null, defaults: Settings = DEFAULT_SETTINGS) {
    super();
    this.storage = storage === undefined ? safeStorage() : storage;
    this.state = this.read(defaults);
  }

  private read(defaults: Settings): Settings {
    if (!this.storage) return { ...defaults };
    try {
      const raw = this.storage.getItem(GAME.storageKey);
      if (!raw) return { ...defaults };
      return sanitizeSettings(JSON.parse(raw), defaults);
    } catch (error) {
      console.warn('[settings] could not read saved settings, using defaults', error);
      return { ...defaults };
    }
  }

  get value(): Readonly<Settings> {
    return this.state;
  }

  get<K extends SettingKey>(key: K): Settings[K] {
    return this.state[key];
  }

  set<K extends SettingKey>(key: K, value: Settings[K]): void {
    if (this.state[key] === value) return;
    const next = sanitizeSettings({ ...this.state, [key]: value }, this.state);
    if (next[key] === this.state[key]) return;
    this.state = next;
    this.persist();
    this.emit('change', { settings: this.state, changed: [key] });
  }

  patch(partial: Partial<Settings>): void {
    const next = sanitizeSettings({ ...this.state, ...partial }, this.state);
    const changed = (Object.keys(partial) as SettingKey[]).filter((key) => next[key] !== this.state[key]);
    if (!changed.length) return;
    this.state = next;
    this.persist();
    this.emit('change', { settings: this.state, changed });
  }

  reset(): void {
    this.state = { ...DEFAULT_SETTINGS };
    this.persist();
    this.emit('change', { settings: this.state, changed: Object.keys(this.state) as SettingKey[] });
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(GAME.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.warn('[settings] could not persist settings', error);
    }
  }
}

export interface Progress {
  collected: string[];
  x: number | null;
  z: number | null;
  playtime: number;
}

export const EMPTY_PROGRESS: Progress = { collected: [], x: null, z: null, playtime: 0 };

/** Fresh progress object — never share the EMPTY_PROGRESS array between stores. */
function blankProgress(): Progress {
  return { collected: [], x: null, z: null, playtime: 0 };
}

export function sanitizeProgress(input: unknown): Progress {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const collected = Array.isArray(raw.collected)
    ? raw.collected.filter((id): id is string => typeof id === 'string').slice(0, 32)
    : [];
  const coord = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 10000 ? value : null;
  const playtime = typeof raw.playtime === 'number' && Number.isFinite(raw.playtime)
    ? clamp(raw.playtime, 0, 1e7)
    : 0;
  return { collected, x: coord(raw.x), z: coord(raw.z), playtime };
}

export class ProgressStore {
  private data: Progress;
  private readonly storage: Storage | null;

  constructor(storage?: Storage | null) {
    this.storage = storage === undefined ? safeStorage() : storage;
    this.data = this.read();
  }

  private read(): Progress {
    if (!this.storage) return blankProgress();
    try {
      const raw = this.storage.getItem(GAME.progressKey);
      return raw ? sanitizeProgress(JSON.parse(raw)) : blankProgress();
    } catch {
      return blankProgress();
    }
  }

  get value(): Readonly<Progress> {
    return this.data;
  }

  get hasProgress(): boolean {
    return this.data.collected.length > 0 || this.data.x !== null;
  }

  addShard(id: string): void {
    if (this.data.collected.includes(id)) return;
    this.data.collected.push(id);
    this.save();
  }

  setPosition(x: number, z: number): void {
    this.data.x = x;
    this.data.z = z;
  }

  setPlaytime(seconds: number): void {
    this.data.playtime = seconds;
  }

  save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(GAME.progressKey, JSON.stringify(this.data));
    } catch {
      /* storage may be blocked — progress simply won't survive a reload */
    }
  }

  clear(): void {
    this.data = blankProgress();
    if (!this.storage) return;
    try {
      this.storage.removeItem(GAME.progressKey);
    } catch {
      /* ignore */
    }
  }
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__eotlw_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}
