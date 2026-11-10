import { describe, expect, it } from 'vitest';

import { BLOCK_KINDS, blockBodies, defaultBlock, hasSize, hookVector, logoFrom, needsNormal, planeAt, sizesOf, snapStrain, stepsOf, type FeatureBlock } from '../src/shared/blocks';
import { featureBlockSchema } from '../src/shared/contract';
import { blockPhrase, describeCommands } from '../src/shared/stepPhrases';

const stepOf = (block: FeatureBlock) => stepsOf(block)[0] ?? { command: '', params: {} };

const at: [number, number, number] = [10, 10, 10];

describe('function blocks (F1)', () => {
  it('builds a tapped hole with SolidCraft\'s thread, through or to a depth', () => {
    expect(stepOf(defaultBlock('tappedHole', 'Body1', at, 'M4'))).toEqual({ command: 'solid.hole', params: { position: at, thread: 'M4', modeled: true } });
    expect(stepOf({ block: 'tappedHole', body: 'Body1', point: at, size: 'M3', depth: 8, modeled: false }).params).toMatchObject({ depth: '8 mm', modeled: false });
  });

  it('builds a row of the same hole at each of its points, and checks the row at the boundary', () => {
    const row: FeatureBlock = { block: 'screwHole', body: 'Body1', point: at, size: 'M3', head: 'cap', fit: 'normal', more: [[20, 10, 10], [30, 10, 10]] };
    const steps = stepsOf(row);
    expect(steps.map((step) => step.params.position)).toEqual([at, [20, 10, 10], [30, 10, 10]]);
    expect(new Set(steps.map((step) => step.params.cb_diameter))).toEqual(new Set(['6.7 mm']));
    expect(featureBlockSchema.safeParse(row).success).toBe(true);
    expect(featureBlockSchema.safeParse({ ...row, more: Array.from({ length: 100 }, () => at) }).success).toBe(false);
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

  it('sets text in a chosen installed font, bold or not; without one the built-in font, Arial for bold', () => {
    const text = { ...defaultBlock('text', 'Body1', at, 'M3', [0, 0, 1]), bold: false } as FeatureBlock;
    expect(stepsOf(text)[1]?.params).not.toHaveProperty('font');
    expect(stepsOf({ ...text, font: 'Georgia' } as FeatureBlock)[1]?.params).toMatchObject({ font: 'Georgia' });
    expect(stepsOf({ ...text, font: 'Georgia' } as FeatureBlock)[1]?.params).not.toHaveProperty('bold');
    expect(stepsOf({ ...text, font: 'Georgia', bold: true } as FeatureBlock)[1]?.params).toMatchObject({ font: 'Georgia', bold: true });
    expect(featureBlockSchema.safeParse({ ...text, font: 'x'.repeat(101) }).success).toBe(false);
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

  it('engraves a logo with an extrusion, so a ring keeps its hole, and builds it up the other way', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
    const block = { ...defaultBlock('logo', 'Body1', at, 'M3', [0, 0, 1]), svg, name: 'ring' } as FeatureBlock;
    const steps = stepsOf(block);
    expect(steps.map((step) => step.command)).toEqual(['sketch.create', 'sketch.insert_svg', 'solid.extrude']);
    expect(steps[1]?.params).toEqual({ text: svg, at: [0, 0], width: 20, align: 'center' });
    expect(steps[2]?.params).toEqual({ distance: '-0.6 mm', operation: 'cut' });
    expect(stepsOf({ ...block, mode: 'emboss', depth: 0.4 } as FeatureBlock)[2]?.params).toEqual({ distance: '0.4 mm', operation: 'join' });
    expect(blockPhrase(block)).toEqual({ key: 'logo', values: { name: 'ring', mode: 'deboss' } });
    // A logo without a file is not built.
    expect(featureBlockSchema.safeParse(defaultBlock('logo', 'Body1', at, 'M3', [0, 0, 1])).success).toBe(false);
  });

  it('takes the clean drawing of an SVG file as a logo and turns away files that are none', () => {
    expect(logoFrom('<svg width="30mm" height="15mm" viewBox="0 0 2 1"><script>x</script><rect width="2" height="1"/></svg>')).toEqual({ problem: 'unsafe' });
    expect(logoFrom('<svg width="30mm" height="15mm" viewBox="0 0 2 1"><rect width="2" height="1"/></svg>')).toEqual({
      // eslint-disable-next-line no-restricted-syntax -- the drawing's own fill
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="15mm" viewBox="0 0 30 15"><path fill="#000000" fill-rule="evenodd" d="M0 0L30 0L30 15L0 15Z"/></svg>',
      width: 30,
      backgrounds: 0,
    });
    expect(logoFrom('<html><body>no</body></html>')).toEqual({ problem: 'notSvg' });
    expect(logoFrom(`<svg>${'x'.repeat(512 * 1024)}</svg>`)).toEqual({ problem: 'tooBig' });
    // Only a drawing PartBuddy reads itself passes the bridge, and SolidCraft gets its clean form.
    const block = { ...defaultBlock('logo', 'Body1', at, 'M3', [0, 0, 1]), name: 'x' };
    expect(featureBlockSchema.safeParse({ ...block, svg: '<svg><rect width="1" height="1"/><foreignObject/></svg>' }).success).toBe(false);
    expect(featureBlockSchema.parse({ ...block, svg: '<svg><rect width="1" height="1"/><text>hi</text></svg>' })).toMatchObject({ svg: expect.not.stringContaining('text') as string });
  });

  it('builds a logo in colours: a coloured body per piece, later pieces cut from earlier ones, inlaid in a pocket', () => {
    // eslint-disable-next-line no-restricted-syntax -- the drawing's own fills
    const svg = '<svg viewBox="0 0 40 20"><rect width="40" height="20" fill="#1d71b8"/><path fill="#ffd500" d="M5 5h4v4h-4zM31 5h4v4h-4z"/><circle cx="20" cy="10" r="5" fill="#ffd500"/></svg>';
    const block = { ...defaultBlock('logo', 'Body1', at, 'M3', [0, 0, 1]), svg, name: 'Badge!', width: 40, colours: true } as FeatureBlock;
    const steps = stepsOf(block);
    const piece = ['sketch.create', 'sketch.insert_svg', 'solid.extrude', 'appearance.assign'];
    // The plate, the two squares of one path and the dot: four pieces, each its own body.
    expect(steps.map((step) => step.command)).toEqual([...piece, ...piece, ...piece, ...piece, 'solid.combine', 'solid.combine', 'solid.combine', 'solid.combine']);
    expect(blockBodies({ ...block, mode: 'emboss' } as FeatureBlock)).toEqual(['Body1', 'Badge 1d71b8 1', 'Badge ffd500 1', 'Badge ffd500 2', 'Badge ffd500 3']);
    // Inlaid, a fill is one body.
    expect(blockBodies(block)).toEqual(['Body1', 'Badge 1d71b8 1', 'Badge ffd500 1']);
    // Every piece keeps the drawing's frame: its top left corner at (−w/2, h/2).
    expect(steps[1]?.params).toMatchObject({ at: [-20, 10], align: 'origin', text: expect.stringContaining('viewBox="0 0 40 20"') as string });
    expect(steps[5]?.params).toMatchObject({ at: [-20, 10], text: expect.stringContaining('d="M5 5L9 5L9 9L5 9Z"') as string });
    expect(steps[2]?.params).toEqual({ distance: '-0.6 mm', operation: 'new', body_name: 'Badge 1d71b8 1' });
    // eslint-disable-next-line no-restricted-syntax -- the drawing's own fill
    expect(steps[7]?.params).toEqual({ bodies: ['Badge ffd500 1'], color: '#ffd500' });
    // The yellow pieces become one body, the pocket is cut a fill at a time, then the yellow out of the plate
    // (pieces of one fill that touch made SolidCraft's boolean fail, colour fox 2026-11-10).
    expect(steps[16]?.params).toEqual({ target: 'Badge ffd500 1', tools: ['Badge ffd500 2', 'Badge ffd500 3'], operation: 'join', touching: 'one_body' });
    expect(steps[17]?.params).toEqual({ target: 'Body1', tools: ['Badge 1d71b8 1'], operation: 'cut', keep_tools: true });
    expect(steps[18]?.params).toEqual({ target: 'Body1', tools: ['Badge ffd500 1'], operation: 'cut', keep_tools: true });
    expect(steps[19]?.params).toEqual({ target: 'Badge 1d71b8 1', tools: ['Badge ffd500 1'], operation: 'cut', keep_tools: true });
    // Built up, the bodies stand on the face and the part keeps its face.
    const raised = stepsOf({ ...block, mode: 'emboss', depth: 0.4 } as FeatureBlock);
    expect(raised[2]?.params).toMatchObject({ distance: '0.4 mm', operation: 'new' });
    expect(raised.filter((step) => step.command === 'solid.combine')).toHaveLength(1);
    // No colours: the plain logo.
    expect(stepsOf({ ...block, colours: false } as FeatureBlock).map((step) => step.command)).toEqual(['sketch.create', 'sketch.insert_svg', 'solid.extrude']);
  });

  it('keeps every default block valid for the contract and named in the work log', () => {
    for (const kind of BLOCK_KINDS) {
      const plain = defaultBlock(kind, 'Body1', at, 'M3', [0, 0, 1]);
      // A logo needs its file before it counts as a block.
      const block = plain.block === 'logo' ? { ...plain, svg: '<svg><rect width="1" height="1"/></svg>', name: 'logo' } : plain;
      expect(featureBlockSchema.safeParse(block).success).toBe(true);
      expect('normal' in block).toBe(needsNormal(kind));
      expect(blockPhrase(block).key).not.toBe('command');
    }
  });
});
