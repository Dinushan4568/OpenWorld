/**
 * Fully synthesised audio: wind bed, low resonance, footsteps, echo chimes and
 * UI ticks. No audio files, no external assets. Fails silently where Web Audio
 * is unavailable so gameplay is never blocked.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private echoDelay: DelayNode | null = null;
  private started = false;
  private muted = false;
  private volume = 0.65;
  private footstepFlip = false;

  constructor(volume = 0.65) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  async start(): Promise<void> {
    if (this.started) {
      if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      await ctx.resume().catch(() => undefined);

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(ctx.destination);

      this.echoDelay = ctx.createDelay(1.0);
      this.echoDelay.delayTime.value = 0.32;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.32;
      const wet = ctx.createGain();
      wet.gain.value = 0.24;
      this.echoDelay.connect(feedback);
      feedback.connect(this.echoDelay);
      this.echoDelay.connect(wet);
      wet.connect(this.master);

      this.noiseBuffer = this.createNoise(ctx, 3);
      this.ambient = ctx.createGain();
      this.ambient.gain.value = 0.0;
      this.ambient.connect(this.master);

      this.buildWind(ctx);
      this.buildDrone(ctx);
      this.started = true;
      this.ambient.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 4);
    } catch (error) {
      console.warn('[audio] synthesis unavailable', error);
      this.started = false;
    }
  }

  private createNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Pink-ish noise: gentler and more natural than pure white.
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  private buildWind(ctx: AudioContext): void {
    if (!this.noiseBuffer || !this.ambient) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 460;
    band.Q.value = 0.6;

    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 1400;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.16;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain);
    lfoGain.connect(windGain.gain);

    source.connect(band);
    band.connect(low);
    low.connect(windGain);
    windGain.connect(this.ambient);
    source.start();
    lfo.start();
  }

  private buildDrone(ctx: AudioContext): void {
    if (!this.ambient) return;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.055;
    droneGain.connect(this.ambient);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.connect(droneGain);

    const frequencies = [55, 82.5, 110.3];
    frequencies.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 2 ? 'triangle' : 'sine';
      osc.frequency.value = frequency;
      osc.detune.value = (index - 1) * 7;
      const gain = ctx.createGain();
      gain.gain.value = index === 0 ? 0.5 : index === 1 ? 0.22 : 0.08;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();

      // Slow amplitude breathing so the pad never feels static.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + index * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.08;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
    });
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime + 0.15);
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.setVolume(this.volume);
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private burst(options: {
    duration: number;
    frequency: number;
    endFrequency?: number;
    gain?: number;
    type?: OscillatorType;
    echo?: number;
    filter?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.started) return;
    const { duration, frequency, endFrequency, gain = 0.2, type = 'sine', echo = 0 } = options;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.03, duration * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env);
    env.connect(this.master);
    if (echo > 0 && this.echoDelay) {
      const send = ctx.createGain();
      send.gain.value = echo;
      env.connect(send);
      send.connect(this.echoDelay);
    }
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  private noiseBurst(duration: number, frequency: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer || !this.started) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  footstep(surface: 'grass' | 'rock' | 'water'): void {
    this.footstepFlip = !this.footstepFlip;
    const base = surface === 'rock' ? 1500 : surface === 'water' ? 900 : 620;
    this.noiseBurst(0.11, base + (this.footstepFlip ? 120 : -60), surface === 'water' ? 0.12 : 0.075);
  }

  jump(): void {
    this.burst({ duration: 0.18, frequency: 240, endFrequency: 150, gain: 0.05, type: 'triangle' });
    this.noiseBurst(0.12, 800, 0.04);
  }

  land(): void {
    this.noiseBurst(0.18, 380, 0.1);
    this.burst({ duration: 0.22, frequency: 90, endFrequency: 60, gain: 0.12, type: 'sine' });
  }

  pulse(): void {
    this.burst({ duration: 0.9, frequency: 420, endFrequency: 60, gain: 0.16, type: 'sine', echo: 0.5 });
    this.burst({ duration: 1.4, frequency: 880, endFrequency: 660, gain: 0.05, type: 'triangle', echo: 0.8 });
    this.noiseBurst(0.5, 2200, 0.03);
  }

  pickup(): void {
    this.burst({ duration: 0.5, frequency: 740, endFrequency: 760, gain: 0.12, echo: 0.4 });
    window.setTimeout(() => this.burst({ duration: 0.8, frequency: 1110, gain: 0.08, echo: 0.7 }), 140);
    window.setTimeout(() => this.burst({ duration: 1.2, frequency: 1480, gain: 0.05, echo: 0.8 }), 290);
  }

  gateEnergised(): void {
    [220, 330, 440, 660].forEach((frequency, index) => {
      window.setTimeout(
        () => this.burst({ duration: 2.2 - index * 0.2, frequency, gain: 0.06, echo: 0.9, type: 'sine' }),
        index * 120,
      );
    });
  }

  /** Soft two-tone chirp when the survey scanner resolves a specimen. */
  scan(): void {
    this.burst({ duration: 0.16, frequency: 980, endFrequency: 1480, gain: 0.055, type: 'triangle' });
    window.setTimeout(
      () => this.burst({ duration: 0.5, frequency: 1560, gain: 0.04, echo: 0.55, type: 'sine' }),
      90,
    );
  }

  /** Synthesised mechanical call; each species has its own register. */
  creatureCall(kind: 'scuttler' | 'grazer' | 'drifter' | 'warden', alarmed: boolean): void {
    const voices: Record<string, [number, number, OscillatorType, number]> = {
      scuttler: [540, 760, 'square', 0.03],
      grazer: [64, 108, 'sawtooth', 0.09],
      drifter: [980, 1420, 'triangle', 0.035],
      warden: [150, 92, 'sawtooth', 0.055],
    };
    const [start, end, type, gain] = voices[kind];
    const duration = alarmed ? 0.7 : 0.45;
    this.burst({ duration, frequency: start, endFrequency: end, gain, type, echo: 0.5 });
    if (alarmed) {
      window.setTimeout(
        () => this.burst({ duration: 0.4, frequency: end, endFrequency: start, gain: gain * 0.7, type, echo: 0.7 }),
        180,
      );
    }
  }

  ui(): void {
    this.burst({ duration: 0.08, frequency: 1320, gain: 0.045, type: 'triangle' });
  }
}
