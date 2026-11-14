import { describe, expect, it } from 'vitest';
import {
  GAIT_JOINTS,
  advanceGaitPhase,
  computeGaitPose,
  createPose,
  decayLanding,
  type GaitInput,
} from '../src/game/player/gait';

const base: GaitInput = {
  speed: 3.5,
  maxSpeed: 6.6,
  phase: 0.9,
  time: 4.2,
  grounded: true,
  verticalVelocity: 0,
  landing: 0,
  turnRate: 0,
  wading: false,
  sprinting: false,
};

describe('gait synthesis', () => {
  it('produces a complete, finite pose for every joint', () => {
    for (const input of [
      base,
      { ...base, speed: 0, phase: 0, time: 0 },
      { ...base, speed: 6.6, sprinting: true },
      { ...base, grounded: false, verticalVelocity: 6 },
      { ...base, grounded: false, verticalVelocity: -9 },
      { ...base, wading: true, speed: 1.2 },
      { ...base, landing: 1 },
      { ...base, turnRate: 3.5 },
    ]) {
      const pose = computeGaitPose(input);
      for (const joint of GAIT_JOINTS) {
        const p = pose[joint];
        for (const value of [p.rx, p.ry, p.rz, p.px, p.py, p.pz]) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });

  it('keeps every angle inside a humanly plausible range', () => {
    const pose = computeGaitPose({ ...base, speed: 6.6, sprinting: true });
    for (const joint of GAIT_JOINTS) {
      const p = pose[joint];
      expect(Math.abs(p.rx)).toBeLessThan(1.6);
      expect(Math.abs(p.ry)).toBeLessThan(1.0);
      expect(Math.abs(p.rz)).toBeLessThan(1.0);
      expect(Math.abs(p.px)).toBeLessThan(0.1);
      expect(Math.abs(p.py)).toBeLessThan(0.2);
    }
  });

  it('swings the legs in opposition and arms against the legs', () => {
    const pose = computeGaitPose({ ...base, phase: Math.PI / 2 });
    expect(pose.thigh_l.rx).toBeLessThan(0);
    expect(pose.thigh_r.rx).toBeGreaterThan(0);
    expect(pose.upper_arm_l.rx).toBeGreaterThan(0);
    expect(pose.upper_arm_r.rx).toBeLessThan(0);
  });

  it('increases stride amplitude with speed', () => {
    const walk = computeGaitPose({ ...base, speed: 2.2, phase: Math.PI / 2 });
    const run = computeGaitPose({ ...base, speed: 6.6, sprinting: true, phase: Math.PI / 2 });
    expect(Math.abs(run.thigh_l.rx)).toBeGreaterThan(Math.abs(walk.thigh_l.rx));
    expect(Math.abs(run.upper_arm_l.rx)).toBeGreaterThan(Math.abs(walk.upper_arm_l.rx));
  });

  it('tucks the legs and spreads the arms while airborne', () => {
    const ground = computeGaitPose({ ...base, grounded: true });
    const air = computeGaitPose({ ...base, grounded: false, verticalVelocity: 4 });
    expect(air.thigh_l.rx).toBeLessThan(ground.thigh_l.rx);
    expect(air.shin_l.rx).toBeGreaterThan(ground.shin_l.rx);
    expect(Math.abs(air.upper_arm_l.rz)).toBeGreaterThan(Math.abs(ground.upper_arm_l.rz));
  });

  it('breathes and sways at rest without drifting', () => {
    const a = computeGaitPose({ ...base, speed: 0, time: 0.4, phase: 0 });
    const b = computeGaitPose({ ...base, speed: 0, time: 2.4, phase: 0 });
    expect(a.head.ry).not.toBe(b.head.ry);
    expect(Math.abs(a.hips.py)).toBeLessThan(0.02);
    expect(Math.abs(b.hips.px)).toBeLessThan(0.02);
  });

  it('trails the cloak further back at higher speed', () => {
    const idle = computeGaitPose({ ...base, speed: 0 });
    const running = computeGaitPose({ ...base, speed: 6.6, sprinting: true });
    expect(running.cape.rx).toBeGreaterThan(idle.cape.rx + 0.3);
  });

  it('leans into turns consistently', () => {
    const right = computeGaitPose({ ...base, turnRate: 3 });
    const left = computeGaitPose({ ...base, turnRate: -3 });
    // Positive turn rate = turning right; the body rolls towards -Z (negative rz).
    expect(right.chest.rz).toBeLessThan(left.chest.rz);
  });

  it('advances the phase only while moving and wraps it', () => {
    const still = advanceGaitPhase(1, 0, false, 0.016);
    expect(still).toBeCloseTo(1, 6);
    let phase = 0;
    for (let i = 0; i < 200; i++) phase = advanceGaitPhase(phase, 4, false, 0.016);
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(Math.PI * 2);
  });

  it('decays a landing impulse to zero', () => {
    let landing = 1;
    for (let i = 0; i < 60; i++) landing = decayLanding(landing, 1 / 60);
    expect(landing).toBe(0);
  });

  it('returns a zeroed pose skeleton', () => {
    const pose = createPose();
    expect(Object.keys(pose)).toHaveLength(GAIT_JOINTS.length);
    expect(pose.hips).toEqual({ rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 });
  });
});
