import { describe, expect, it } from 'vitest';

import { BLOCK_KINDS, defaultBlock, hasSize, hookVector, needsNormal, planeAt, sizesOf, snapStrain, stepsOf, type FeatureBlock } from '../src/shared/blocks';
import { featureBlockSchema } from '../src/shared/contract';
import { blockPhrase, describeCommands } from '../src/shared/stepPhrases';

const stepOf = (block: FeatureBlock) => stepsOf(block)[0] ?? { command: '', params: {} };

const at: [number, number, number] = [10, 10, 10];

describe('function blocks (F1)', () => {
  it('builds a tapped hole with SolidCraft\'s thread, through or to a depth', () => {
    expect(stepOf(defaultBlock('tappedHole', 'Body1', at, 'M4'))).toEqual({ command: 'solid.hole', params: { position: at, thread: 'M4', modeled: true } });
    expect(stepOf({ block: 'tappedHole', body: 'Body1', point: at, size: 'M3', depth: 8, modeled: false }).params).toMatchObject({ depth: '8 mm', modeled: false });
  });

  it('gives a screw hole room for the head after ISO 4762 and ISO 10642 plus the print allowance', () => {
    expect(stepOf(defaultBlock('screwHole', 'Body1', at, 'M3')).params).toEqual({ position: at, clearance: 'M3', fit: 'normal', type: 'counterbore', cb_diameter: '6.7 mm', cb_depth: '3.4 mm' });
    expect(stepOf({ block: 'screwHole', body: 'Body1', point: at, size: 'M4', head: 'countersunk', fit: 'close' }).params).toMatchObject({ type: 'countersink', cs_diameter: '9.56 mm', cs_angle: '90 deg', fit: 'close' });
    expect(stepOf({ block: 'screwHole', body: 'Body1', point: at, size: 'M2', head: 'none', fit: 'loose' }).params).toEqual({ position: at, clearance: 'M2', fit: 'loose' });
    expect(sizesOf('screwHole', 'countersunk')[0]).toBe('M3');
  });

  it('seats an insert one millimetre deeper than it is long, and bosses it with 2 mm of wall', () => {
    expect(defaultBlock('insertSeat', 'Body1', at, 'M3')).toMatchObject({ diameter: 4, depth: 6.7 });
    expect(stepOf(defaultBlock('boss', 'Body1', at, 'M3')).params).toEqual({ position: at, diameter: '8 mm', height: '8.7 mm', hole_diameter: '4 mm', hole_depth: '6.7 mm' });
    expect(sizesOf('insertSeat')).toEqual(['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6']);
  });

  it('names each block in the work log', () => {
    const phrases = describeCommands(['tappedHole', 'screwHole', 'insertSeat', 'boss'].map((kind) => stepOf(defaultBlock(kind as 'boss', 'Body1', at, 'M3'))));
    expect(phrases.map((phrase) => phrase.key)).toEqual(['tappedHole', 'screwHole', 'hole', 'boss']);
    expect(phrases[0]?.values).toEqual({ thread: 'M3' });
  });

  it('lays the sketch plane flat on the face with x level where it can', () => {
    expect(planeAt(at, [0, 0, 1])).toEqual({ origin: at, x_dir: [1, 0, 0], y_dir: [0, 1, 0] });
    expect(planeAt(at, [0, -1, 0])).toEqual({ origin: at, x_dir: [1, 0, 0], y_dir: [0, 0, 1] });
    expect(planeAt(at, [1, 0, 0])).toEqual({ origin: at, x_dir: [0, 1, 0], y_dir: [0, 0, 1] });
    // A face pointing down still gets a right-handed plane whose normal is the face's.
    const down = planeAt(at, [0, 0, -2]);
    expect(down.x_dir).toEqual([1, 0, 0]);
    expect(down.y_dir).toEqual([0, -1, 0]);
  });

  it('engraves or embosses text centred on the point', () => {
    const steps = stepsOf(defaultBlock('text', 'Body1', at, 'M3', [0, 0, 1]));
    expect(steps.map((step) => step.command)).toEqual(['sketch.create', 'sketch.text', 'solid.emboss']);
    expect(steps[1]?.params).toEqual({ text: 'PartBuddy', at: [0, -2.5], height: 5, align: 'center', font: 'Arial', bold: true });
    expect(steps[2]?.params).toEqual({ depth: '0.6 mm', mode: 'deboss', face: at });
  });

  it('cuts a nut trap to its depth and drills the clearance hole from its bottom', () => {
    const block = defaultBlock('nutTrap', 'Body1', at, 'M3', [0, 0, 1]);
    expect(block).toMatchObject({ flats: 5.8, depth: 2.8 });
    const steps = stepsOf(block);
    expect(steps.map((step) => step.command)).toEqual(['sketch.create', 'sketch.polygon.circumscribed', 'solid.extrude', 'solid.hole']);
    expect(steps[1]?.params).toEqual({ center: [0, 0], radius: 2.9, sides: 6 });
    expect(steps[2]?.params).toEqual({ distance: '-2.8 mm', operation: 'cut' });
    expect(steps[3]?.params).toEqual({ position: [10, 10, 7.2], clearance: 'M3', fit: 'normal' });
  });

  it('cuts a slot as wide as the clearance hole, along the chosen direction', () => {
    const block = defaultBlock('slot', 'Body1', at, 'M4', [0, 0, 1]);
    expect(stepsOf(block)[1]?.params).toEqual({ p0: [-5, 0], p1: [5, 0], width: 4.5 });
    expect(stepsOf(block)[2]?.params).toEqual({ distance: '-1000 mm', operation: 'cut' });
    const upright = stepsOf({ ...block, along: 'y', depth: 3 } as FeatureBlock);
    expect(upright[1]?.params).toMatchObject({ p0: [0, -5], p1: [0, 5] });
    expect(upright[2]?.params).toEqual({ distance: '-3 mm', operation: 'cut' });
  });

  it('builds a lip, and a groove with its gap, with SolidCraft\'s plastic.lip', () => {
    const lip = defaultBlock('lip', 'Body1', at, 'M3');
    expect(stepsOf(lip)).toEqual([{ command: 'plastic.lip', params: { face: at, type: 'lip', width: '1.2 mm', height: '2 mm' } }]);
    expect(stepsOf({ ...lip, type: 'groove' } as FeatureBlock)[0]?.params).toMatchObject({ type: 'groove', gap: '0.2 mm' });
  });

  it('stands a snap fit out of the face with its catch across the arm', () => {
    const block = defaultBlock('snapFit', 'Body1', at, 'M3', [0, 0, 1]);
    expect(stepsOf(block)).toEqual([
      {
        command: 'plastic.snap_fit',
        params: { position: at, hook: [0, 1, 0], length: '12 mm', thickness: '1.5 mm', width: '5 mm', catch_depth: '0.8 mm', catch_length: '1.5 mm' },
      },
    ]);
    // On a side face the catch can point up or down, or level along the face.
    expect(hookVector(at, [1, 0, 0], 'y+')).toEqual([0, 0, 1]);
    expect(hookVector(at, [1, 0, 0], 'y-')).toEqual([0, 0, -1]);
    expect(hookVector(at, [1, 0, 0], 'x-')).toEqual([0, -1, 0]);
    for (const normal of [[0, 0, 1], [0, -1, 0], [1, 0, 0], [0, 0, -1]] as [number, number, number][]) {
      for (const hook of ['x+', 'x-', 'y+', 'y-'] as const) {
        const vector = hookVector(at, normal, hook);
        expect(vector[0] * normal[0] + vector[1] * normal[1] + vector[2] * normal[2]).toBe(0);
      }
    }
  });

  it('works out the snap fit\'s strain at the root of the arm', () => {
    expect(snapStrain(defaultBlock('snapFit', 'Body1', at, 'M3', [0, 0, 1]) as { length: number; thickness: number; catchDepth: number; catchLength: number })).toBeCloseTo(1.42);
    // The lever runs to the middle of the catch: half the lever, four times the strain.
    expect(snapStrain({ length: 10.75, thickness: 1.5, catchDepth: 0.8, catchLength: 1.5 })).toBeCloseTo(1.8);
    expect(snapStrain({ length: 5.75, thickness: 1.5, catchDepth: 0.8, catchLength: 1.5 })).toBeCloseTo(7.2);
    expect(hasSize('snapFit')).toBe(false);
  });

  it('keeps every default block valid for the contract and named in the work log', () => {
    for (const kind of BLOCK_KINDS) {
      const block = defaultBlock(kind, 'Body1', at, 'M3', [0, 0, 1]);
      expect(featureBlockSchema.safeParse(block).success).toBe(true);
      expect('normal' in block).toBe(needsNormal(kind));
      expect(blockPhrase(block).key).not.toBe('command');
    }
  });
});
