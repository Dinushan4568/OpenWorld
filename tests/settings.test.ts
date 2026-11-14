import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  EMPTY_PROGRESS,
  ProgressStore,
  SettingsStore,
  sanitizeProgress,
  sanitizeSettings,
} from '../src/game/core/settings';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('settings sanitisation', () => {
  it('falls back to defaults for garbage input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ quality: 'impossible', fov: 'wide', masterVolume: NaN })).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps numeric ranges and rejects unknown enums', () => {
    const parsed = sanitizeSettings({ fov: 500, sensitivity: -3, masterVolume: 42, touchControls: 'sometimes' });
    expect(parsed.fov).toBe(92);
    expect(parsed.sensitivity).toBe(0.25);
    expect(parsed.masterVolume).toBe(1);
    expect(parsed.touchControls).toBe('auto');
  });

  it('persists changes and rejects out-of-range set values', () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    store.set('masterVolume', 5);
    expect(store.get('masterVolume')).toBe(1);
    store.set('quality', 'ultra');
    expect(store.get('quality')).toBe('ultra');
    const reloaded = new SettingsStore(storage);
    expect(reloaded.get('quality')).toBe('ultra');
    expect(reloaded.get('masterVolume')).toBe(1);
  });
});

describe('progress store', () => {
  it('sanitises corrupt progress', () => {
    expect(sanitizeProgress({ collected: ['a', 5, null], x: Infinity, playtime: -20 })).toEqual({
      collected: ['a'],
      x: null,
      z: null,
      playtime: 0,
    });
  });

  it('records shards and positions, and clears cleanly', () => {
    const storage = new MemoryStorage();
    const progress = new ProgressStore(storage);
    expect(progress.hasProgress).toBe(false);
    progress.addShard('shard-1');
    progress.addShard('shard-1');
    progress.setPosition(12, -8);
    progress.setPlaytime(63);
    progress.save();
    expect(progress.value.collected).toEqual(['shard-1']);
    expect(progress.hasProgress).toBe(true);

    const reloaded = new ProgressStore(storage);
    expect(reloaded.value).toMatchObject({ collected: ['shard-1'], x: 12, z: -8, playtime: 63 });

    reloaded.clear();
    expect(reloaded.hasProgress).toBe(false);
    expect(storage.getItem('echoes-of-the-lost-world:progress')).toBeNull();
  });

  it('recovers corrupt progress without mutating the shared empty fixture', () => {
    const storage = new MemoryStorage();
    storage.setItem('echoes-of-the-lost-world:progress', '{ definitely not json');
    const progress = new ProgressStore(storage);
    progress.addShard('recovered');
    expect(progress.value.collected).toEqual(['recovered']);
    expect(EMPTY_PROGRESS.collected).toEqual([]);
    expect(new ProgressStore(storage).value.collected).toEqual(['recovered']);
  });
});
