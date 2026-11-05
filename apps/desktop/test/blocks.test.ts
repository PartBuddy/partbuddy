import { describe, expect, it } from 'vitest';

import { defaultBlock, sizesOf, stepsOf, type FeatureBlock } from '../src/shared/blocks';

const stepOf = (block: FeatureBlock) => stepsOf(block)[0] ?? { command: '', params: {} };
import { describeCommands } from '../src/shared/stepPhrases';

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
});
