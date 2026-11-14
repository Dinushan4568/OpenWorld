import { describe, expect, it } from 'vitest';
import { AdaptiveResolution, percentile } from '../src/game/core/adaptive';

function feed(controller: AdaptiveResolution, frameMs: number, frames: number): number {
  let changes = 0;
  for (let i = 0; i < frames; i++) if (controller.sample(frameMs)) changes++;
  return changes;
}

describe('adaptive resolution', () => {
  it('keeps full resolution while frames are inside the budget', () => {
    const controller = new AdaptiveResolution({ windowSeconds: 0.5 });
    feed(controller, 10, 120);
    expect(controller.scale).toBe(1);
    expect(controller.snapshot.fps).toBeCloseTo(100, 5);
    expect(controller.snapshot.phase).toBe('scaling-up');
  });

  it('steps down after sustained slow frames and never exceeds its floor', () => {
    const controller = new AdaptiveResolution({
      windowSeconds: 0.25,
      minScale: 0.7,
      maxScale: 1,
      downshiftWindows: 2,
      downStep: 0.1,
    });
    feed(controller, 30, 30);
    expect(controller.scale).toBeCloseTo(0.9, 5);
    feed(controller, 40, 80);
    expect(controller.scale).toBeCloseTo(0.7, 5);
    feed(controller, 40, 80);
    expect(controller.scale).toBeCloseTo(0.7, 5);
  });

  it('recovers gradually only after a stable run of fast frames', () => {
    const controller = new AdaptiveResolution({
      windowSeconds: 0.25,
      minScale: 0.6,
      maxScale: 1,
      downshiftWindows: 1,
      upshiftWindows: 4,
      upStep: 0.05,
    });
    controller.setScale(0.7);
    feed(controller, 9, 10);
    expect(controller.scale).toBeCloseTo(0.7, 5);
    feed(controller, 9, 220);
    expect(controller.scale).toBeGreaterThan(0.7);
    expect(controller.scale).toBeLessThanOrEqual(1);
  });

  it('ignores tab stalls and invalid samples', () => {
    const controller = new AdaptiveResolution({ windowSeconds: 0.25, downshiftWindows: 1 });
    controller.reset(1);
    controller.sample(9000);
    controller.sample(0);
    controller.sample(Number.NaN);
    expect(controller.scale).toBe(1);
    expect(controller.snapshot.windows).toBe(0);
    expect(controller.snapshot.averageFrameMs).toBe(0);
  });

  it('returns to max scale when disabled and clamps bounds changes', () => {
    const controller = new AdaptiveResolution({ windowSeconds: 0.25, downshiftWindows: 1 });
    controller.setScale(0.7);
    controller.setEnabled(false);
    expect(controller.scale).toBe(1);
    controller.setEnabled(true);
    controller.setBounds(0.72, 0.96);
    expect(controller.scale).toBe(0.96);
    controller.setBounds(0.9, 0.8);
    expect(controller.scale).toBe(0.9);
  });

  it('computes a stable high percentile for diagnostics', () => {
    expect(percentile([1, 2, 3, 4, 100], 0.95)).toBe(100);
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([5], 0.95)).toBe(5);
  });
});
