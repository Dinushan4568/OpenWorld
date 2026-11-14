// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/game/core/AudioManager';

class FakeParam {
  value = 0;
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
  cancelScheduledValues(): void {}
}

class FakeNode {
  connect(): this {
    return this;
  }
  disconnect(): void {}
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = '';
  frequency = new FakeParam();
  Q = new FakeParam();
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  detune = new FakeParam();
  start(): void {}
  stop(): void {}
}

class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  start(): void {}
  stop(): void {}
}

class FakeDelay extends FakeNode {
  delayTime = new FakeParam();
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  readonly sampleRate = 48000;
  currentTime = 0;
  state = 'running';
  destination = new FakeNode();
  closed = false;

  constructor() {
    FakeAudioContext.last = this;
  }

  async resume(): Promise<void> {}
  async close(): Promise<void> {
    this.closed = true;
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
  createDelay(): FakeDelay {
    return new FakeDelay();
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createOscillator(): FakeOscillator {
    return new FakeOscillator();
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource();
  }
  createBuffer(_channels: number, length: number): { getChannelData: () => Float32Array } {
    return { getChannelData: () => new Float32Array(length) };
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeAudioContext.last = null;
});

describe('audio manager', () => {
  it('fails silently without Web Audio and disposes safely', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const audio = new AudioManager(0.5);
    await expect(audio.start()).resolves.toBeUndefined();
    expect(() => audio.footstep('grass')).not.toThrow();
    expect(() => audio.dispose()).not.toThrow();
    expect(() => audio.dispose()).not.toThrow();
  });

  it('builds the synthesised graph, respects mute/volume and closes its context', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new AudioManager(0.4);
    await audio.start();
    const context = FakeAudioContext.last;
    expect(context).not.toBeNull();
    expect(audio.toggleMute()).toBe(true);
    audio.setVolume(0.7);
    expect(() => {
      audio.footstep('rock');
      audio.jump();
      audio.pulse();
      audio.ui();
    }).not.toThrow();
    audio.dispose();
    expect(context?.closed).toBe(true);
  });
});
