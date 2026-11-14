/**
 * Dynamic render-resolution controller.
 *
 * This module is deliberately engine-free: the formulas that decide when to
 * trade pixels for frame rate are the part most worth testing, and they must
 * behave the same on WebGL 2 and WebGPU. The engine applies `scale` to the
 * CameraFrame render target; the HUD reads the snapshot for diagnostics.
 */

export interface AdaptiveOptions {
  enabled?: boolean;
  minScale?: number;
  maxScale?: number;
  /** Length of one measurement window in seconds. */
  windowSeconds?: number;
  /** Below this average frame time (ms) the renderer can afford more pixels. */
  upshiftMs?: number;
  /** Above this average frame time (ms) the renderer needs fewer pixels. */
  downshiftMs?: number;
  downshiftWindows?: number;
  upshiftWindows?: number;
  downStep?: number;
  upStep?: number;
  /** Samples longer than this are treated as tab stalls and ignored. */
  stallMs?: number;
}

export interface AdaptiveSnapshot {
  scale: number;
  enabled: boolean;
  averageFrameMs: number;
  p95FrameMs: number;
  fps: number;
  windows: number;
  phase: 'steady' | 'scaling-down' | 'scaling-up';
}

const DEFAULTS: Required<AdaptiveOptions> = {
  enabled: true,
  minScale: 0.65,
  maxScale: 1,
  windowSeconds: 0.75,
  upshiftMs: 14.5,
  downshiftMs: 19.5,
  downshiftWindows: 2,
  upshiftWindows: 4,
  downStep: 0.08,
  upStep: 0.05,
  stallMs: 250,
};

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export class AdaptiveResolution {
  private options: Required<AdaptiveOptions>;
  private currentScale: number;
  private sum = 0;
  private count = 0;
  private elapsed = 0;
  private windows = 0;
  private downStreak = 0;
  private upStreak = 0;
  private averageFrameMs = 0;
  private p95FrameMs = 0;
  private samples: number[] = [];

  constructor(options: AdaptiveOptions = {}) {
    this.options = {
      ...DEFAULTS,
      ...Object.fromEntries(
        Object.entries(options).filter(([, value]) => value !== undefined),
      ),
    } as Required<AdaptiveOptions>;
    this.normalise();
    this.currentScale = this.options.maxScale;
  }

  get scale(): number {
    return this.currentScale;
  }

  get min(): number {
    return this.options.minScale;
  }

  get max(): number {
    return this.options.maxScale;
  }

  get enabled(): boolean {
    return this.options.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
    if (!enabled) {
      this.currentScale = this.options.maxScale;
      this.resetWindow();
      this.downStreak = 0;
      this.upStreak = 0;
    }
  }

  /** Apply a quality-preset change. Keeping the current scale stable avoids a visible pop. */
  setBounds(minScale: number, maxScale: number): void {
    this.options.minScale = Math.max(0.25, Math.min(1, finite(minScale, 0.65)));
    this.options.maxScale = Math.max(this.options.minScale, Math.min(1, finite(maxScale, 1)));
    this.currentScale = Math.min(this.options.maxScale, Math.max(this.options.minScale, this.currentScale));
    this.resetWindow();
    this.downStreak = 0;
    this.upStreak = 0;
  }

  setScale(scale: number): void {
    this.currentScale = Math.min(this.options.maxScale, Math.max(this.options.minScale, finite(scale, this.currentScale)));
    this.resetWindow();
  }

  reset(scale?: number): void {
    this.currentScale = Math.min(
      this.options.maxScale,
      Math.max(this.options.minScale, finite(scale ?? this.options.maxScale, this.options.maxScale)),
    );
    this.resetWindow();
    this.downStreak = 0;
    this.upStreak = 0;
    this.averageFrameMs = 0;
    this.p95FrameMs = 0;
    this.windows = 0;
  }

  /**
   * Feed one raw frame delta. Returns true when the engine should resize the
   * internal render target. Tab stalls are intentionally ignored; a single
   * 2-second background pause must not make the game permanently blurry.
   */
  sample(frameMs: number): boolean {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > this.options.stallMs) return false;
    this.sum += frameMs;
    this.count += 1;
    this.elapsed += frameMs / 1000;
    this.samples.push(frameMs);
    if (this.samples.length > 240) this.samples.shift();
    if (this.elapsed < this.options.windowSeconds) return false;

    const average = this.sum / Math.max(1, this.count);
    this.averageFrameMs = average;
    this.p95FrameMs = percentile(this.samples, 0.95);
    this.windows += 1;
    this.resetWindow(false);

    if (!this.options.enabled) return false;

    if (average >= this.options.downshiftMs) {
      this.upStreak = 0;
      this.downStreak += 1;
    } else if (average <= this.options.upshiftMs) {
      this.downStreak = 0;
      this.upStreak += 1;
    } else {
      this.downStreak = 0;
      this.upStreak = 0;
    }

    if (this.downStreak >= this.options.downshiftWindows && this.currentScale > this.options.minScale + 1e-4) {
      this.currentScale = Math.max(this.options.minScale, this.currentScale - this.options.downStep);
      this.downStreak = 0;
      return true;
    }
    if (this.upStreak >= this.options.upshiftWindows && this.currentScale < this.options.maxScale - 1e-4) {
      this.currentScale = Math.min(this.options.maxScale, this.currentScale + this.options.upStep);
      this.upStreak = 0;
      return true;
    }
    return false;
  }

  get snapshot(): AdaptiveSnapshot {
    const average = this.averageFrameMs;
    return {
      scale: this.currentScale,
      enabled: this.options.enabled,
      averageFrameMs: average,
      p95FrameMs: this.p95FrameMs,
      fps: average > 0 ? 1000 / average : 0,
      windows: this.windows,
      phase: this.downStreak > 0 ? 'scaling-down' : this.upStreak > 0 ? 'scaling-up' : 'steady',
    };
  }

  private normalise(): void {
    const options = this.options;
    options.minScale = Math.max(0.25, Math.min(1, finite(options.minScale, DEFAULTS.minScale)));
    options.maxScale = Math.max(options.minScale, Math.min(1, finite(options.maxScale, DEFAULTS.maxScale)));
    options.windowSeconds = Math.max(0.1, finite(options.windowSeconds, DEFAULTS.windowSeconds));
    options.upshiftMs = Math.max(4, finite(options.upshiftMs, DEFAULTS.upshiftMs));
    options.downshiftMs = Math.max(options.upshiftMs + 1, finite(options.downshiftMs, DEFAULTS.downshiftMs));
    options.downshiftWindows = Math.max(1, Math.round(finite(options.downshiftWindows, DEFAULTS.downshiftWindows)));
    options.upshiftWindows = Math.max(1, Math.round(finite(options.upshiftWindows, DEFAULTS.upshiftWindows)));
    options.downStep = Math.max(0.01, Math.min(0.5, finite(options.downStep, DEFAULTS.downStep)));
    options.upStep = Math.max(0.01, Math.min(0.5, finite(options.upStep, DEFAULTS.upStep)));
    options.stallMs = Math.max(50, finite(options.stallMs, DEFAULTS.stallMs));
  }

  private resetWindow(resetMetrics = true): void {
    this.sum = 0;
    this.count = 0;
    this.elapsed = 0;
    if (resetMetrics) this.samples = [];
  }
}

export function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}
