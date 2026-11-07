import { describe, expect, it } from 'vitest';

import type { PlayStep } from '../src/shared/assembly';
import { activeStep, explodeAlong, playbackPoses, SPREAD, travel, type Box } from '../src/renderer/src/viewer/explode';

const boxes = new Map<string, Box>([
  ['Housing', { min: [0, 0, 0], max: [80, 50, 30] }],
  ['Board', { min: [10, 10, 2], max: [60, 40, 4] }],
  ['Lid', { min: [0, 0, 30], max: [80, 50, 33] }],
  ['Pin', { min: [100, 0, 0], max: [110, 2, 2] }],
]);
const step = (name: string, bodies: string[], target: string | null, direction: [number, number, number], group: string | null = null): PlayStep => ({ name, bodies, target, direction, group });
const steps = [step('Housing', ['Housing'], null, [0, 0, -1]), step('Board', ['Board'], 'Housing', [0, 0, -1]), step('Lid', ['Lid'], 'Housing', [0, 0, -1]), step('Pin', ['Pin'], 'Housing', [-1, 0, 0])];

describe('exploded view along the joining directions', () => {
  it('leaves everything in place when assembled, and the base always', () => {
    const offsets = explodeAlong(steps, boxes, 0);
    for (const offset of offsets.values()) expect(offset.map(Math.abs)).toEqual([0, 0, 0]);
    expect(explodeAlong(steps, boxes, 1).get('Housing')?.map(Math.abs)).toEqual([0, 0, 0]);
  });

  it('backs each part out against its direction, a later part on the same way further', () => {
    const offsets = explodeAlong(steps, boxes, 1);
    const board = offsets.get('Board') ?? [0, 0, 0];
    const lid = offsets.get('Lid') ?? [0, 0, 0];
    expect(board[2]).toBeGreaterThan(0);
    expect(lid[2]).toBeGreaterThan(board[2]);
    expect(board.slice(0, 2).map(Math.abs)).toEqual([0, 0]);
    // The pin came in from +X, so it backs out to +X.
    expect(offsets.get('Pin')?.[0]).toBeGreaterThan(0);
  });

  it('moves in proportion to the slider', () => {
    const half = explodeAlong(steps, boxes, 0.5).get('Lid')?.[2] ?? 0;
    const full = explodeAlong(steps, boxes, 1).get('Lid')?.[2] ?? 0;
    expect(full).toBeCloseTo(half * 2);
    expect(full).toBeCloseTo((travel(steps, boxes)[2] ?? 0) * SPREAD);
  });

  it('moves a sub-assembly with its parts and each part within it', () => {
    const sub = [step('Pin into leaf', ['Pin'], 'Lid', [1, 0, 0], 'Hinge'), step('Leaf', ['Lid'], null, [0, 0, -1], 'Hinge'), step('Base', ['Housing'], null, [0, 0, -1]), step('Hinge on', ['Pin', 'Lid'], 'Housing', [0, 0, -1])];
    const offsets = explodeAlong(sub, boxes, 1);
    expect(offsets.get('Lid')?.[2]).toBeGreaterThan(0);
    expect(offsets.get('Pin')?.[2]).toBeCloseTo(offsets.get('Lid')?.[2] ?? 0);
    expect(offsets.get('Pin')?.[0]).toBeLessThan(0);
  });
});

describe('assembly playback', () => {
  it('shows nothing before the start and everything in place at the end', () => {
    const start = playbackPoses(steps, boxes, -0.01);
    expect([...start.values()].every((pose) => !pose.visible)).toBe(true);
    const end = playbackPoses(steps, boxes, steps.length);
    for (const pose of end.values()) {
      expect(pose.visible).toBe(true);
      expect(pose.offset.map(Math.abs)).toEqual([0, 0, 0]);
    }
  });

  it('brings a part in during its own step, from where the explosion would put it', () => {
    const before = playbackPoses(steps, boxes, 2).get('Lid');
    const halfway = playbackPoses(steps, boxes, 2.5).get('Lid');
    expect(before?.visible).toBe(true);
    expect(before?.offset[2]).toBeCloseTo(explodeAlong(steps, boxes, 1).get('Lid')?.[2] ?? 0);
    expect(halfway?.offset[2]).toBeCloseTo((before?.offset[2] ?? 0) / 2);
    expect(playbackPoses(steps, boxes, 1.99).get('Lid')?.visible).toBe(false);
  });

  it('names the step playing', () => {
    expect(activeStep(-1, 4)).toBe(-1);
    expect(activeStep(0, 4)).toBe(0);
    expect(activeStep(2.4, 4)).toBe(2);
    // On the end of a step: the step just done.
    expect(activeStep(1, 4)).toBe(0);
    expect(activeStep(4, 4)).toBe(3);
    expect(activeStep(1, 0)).toBe(-1);
  });
});
