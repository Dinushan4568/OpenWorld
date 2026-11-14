import { describe, expect, it } from 'vitest';
import { clamp, damp, distance2D, lerp, wrapAngle } from '../src/game/util/math';

describe('math helpers', () => {
  it('clamps and lerps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it('damp approaches the target without overshooting', () => {
    let value = 0;
    for (let i = 0; i < 60; i++) value = damp(value, 10, 6, 1 / 60);
    expect(value).toBeGreaterThan(9.9);
    expect(value).toBeLessThanOrEqual(10);
  });

  it('wraps angles into [-PI, PI]', () => {
    expect(Math.abs(wrapAngle(Math.PI * 3))).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-Math.PI * 2)).toBeCloseTo(0, 6);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 6);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI * 0.5, 6);
  });

  it('measures planar distance', () => {
    expect(distance2D(0, 0, 3, 4)).toBe(5);
    expect(distance2D(1, 1, 1, 1)).toBe(0);
  });
});
