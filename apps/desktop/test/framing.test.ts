import { Sphere, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { needsReframe } from '../src/renderer/src/viewer/framing';

const sphere = (x: number, y: number, z: number, radius: number) => new Sphere(new Vector3(x, y, z), radius);

describe('needsReframe', () => {
  it('frames a design that has not been framed yet', () => {
    expect(needsReframe(null, sphere(0, 0, 0, 10))).toBe(true);
  });

  it('frames again when the design grows out of the framed view', () => {
    // A 20 mm sketch first, then the 60 mm body built from it.
    expect(needsReframe(sphere(0, 0, 0, 10), sphere(0, 0, 20, 30))).toBe(true);
  });

  it('frames again when the design moves away from the framed view', () => {
    expect(needsReframe(sphere(0, 0, 0, 30), sphere(50, 0, 0, 10))).toBe(true);
  });

  it('keeps the view while the design stays inside it', () => {
    expect(needsReframe(sphere(0, 0, 0, 30), sphere(2, 0, 0, 29))).toBe(false);
    // A fillet that adds a hair stays within the allowance.
    expect(needsReframe(sphere(0, 0, 0, 30), sphere(0, 0, 0, 31))).toBe(false);
  });

  it('frames again when the design shrinks to a small part of the view', () => {
    expect(needsReframe(sphere(0, 0, 0, 30), sphere(0, 0, 0, 10))).toBe(true);
  });

  it('ignores an empty design', () => {
    expect(needsReframe(sphere(0, 0, 0, 30), new Sphere())).toBe(false);
  });
});
