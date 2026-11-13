import { describe, expect, it } from 'vitest';

import { BLOCK_KINDS, blockBodies, blockLimit, cutsThrough, defaultBlock, DEFAULT_PRINTER, hasSize, hookVector, limitSaid, logoFrom, needsNormal, planeAt, raisedBlock, sizesOf, snapStrain, stepsOf, textDepth, textStroke, throughReach, throughTrial, throughWall, type FeatureBlock } from '../src/shared/blocks';
import { CLEARANCE, CLEARANCE_NORMAL, headRoom, pilotHole, printedThread } from '../src/shared/screwSizes';
import { MATERIAL_CATALOG } from '../src/shared/materialCatalog';
import { DEFAULT_MATERIAL, drawnHole, fitClearance, type ToolMaterial } from '../src/shared/toolFit';

/** A catalogue material as the tools take it. */
const material = (name: string): ToolMaterial => {
  const entry = MATERIAL_CATALOG.find((item) => item.name === name);
  if (!entry) throw new Error(name);
  return { holeShrink: entry.holeShrink, clearance: entry.clearance };
};
import { featureBlockSchema } from '../src/shared/contract';
import { blockPhrase, describeCommands } from '../src/shared/stepPhrases';

const stepOf = (block: FeatureBlock) => stepsOf(block)[0] ?? { command: '', params: {} };

const at: [number, number, number] = [10, 10, 10];

describe('function blocks (F1)', () => {
  it('builds a tapped hole with room for printing, through or to a depth, its mouth chamfered (audit S-09, N-bloecke-9, R36)', () => {
    // M5: the ISO profile 0.3 mm larger on every diameter, drilled at major minus pitch as SolidCraft drills a custom size.
    expect(printedThread('M5')).toEqual({ designation: 'M5.3x0.8', major: 5.3, drill: 4.5 });
    expect(printedThread('M10')).toEqual({ designation: 'M10.3x1.5', major: 10.3, drill: 8.8 });
    expect(stepOf(defaultBlock('tappedHole', 'Body1', at, 'M5'))).toEqual({ command: 'solid.hole', params: { position: at, thread: 'M5.3x0.8', modeled: true, type: 'countersink', cs_diameter: '5.5 mm', cs_angle: '90 deg', targets: ['Body1'] } });
    // Listed only, it is drilled to ISO's tap drill to be tapped after printing.
    expect(stepOf({ block: 'tappedHole', body: 'Body1', point: at, size: 'M5', depth: 8, modeled: false }).params).toMatchObject({ thread: 'M5', depth: '8 mm', modeled: false, cs_diameter: '5.2 mm' });
  });

  it('builds a row of the same hole at each of its points, and checks the row at the boundary', () => {
    const row: FeatureBlock = { block: 'screwHole', body: 'Body1', point: at, size: 'M3', head: 'cap', fit: 'normal', more: [[20, 10, 10], [30, 10, 10]] };
    const steps = stepsOf(row);
    expect(steps.map((step) => step.params.position)).toEqual([at, [20, 10, 10], [30, 10, 10]]);
    expect(new Set(steps.map((step) => step.params.cb_diameter))).toEqual(new Set(['6.7 mm']));
    expect(featureBlockSchema.safeParse(row).success).toBe(true);
    expect(featureBlockSchema.safeParse({ ...row, more: Array.from({ length: 100 }, () => at) }).success).toBe(false);
  });

  it('gives a screw hole its clearance from PartBuddy\'s table and room for the head after ISO 4762 and ISO 10642 plus the print allowance (audit R7, W21, S-11)', () => {
    // The hole as a diameter of our own ISO 273 table, the counterbore with two bridge layers of the printer's layer under its floor.
    // Drawn with PLA's hole allowance (0.15 mm), the default profile's material (audit S-10).
    expect(stepOf(defaultBlock('screwHole', 'Body1', at, 'M3')).params).toEqual({ position: at, diameter: '3.55 mm', type: 'counterbore', cb_diameter: '6.7 mm', cb_depth: '3.4 mm', bridge: '0.2 mm', targets: ['Body1'] });
    expect(stepsOf(defaultBlock('screwHole', 'Body1', at, 'M3'), undefined, undefined, { nozzle: 0.6, layer: 0.3 })[0]?.params).toMatchObject({ bridge: '0.3 mm' });
    expect(stepOf({ block: 'screwHole', body: 'Body1', point: at, size: 'M8', head: 'countersunk', fit: 'close' }).params).toMatchObject({ diameter: '8.55 mm', type: 'countersink', cs_diameter: '18.52 mm', cs_angle: '90 deg' });
    // Without a head the mouth gets the details' 0.5 mm chamfer.
    expect(stepOf({ block: 'screwHole', body: 'Body1', point: at, size: 'M2', head: 'none', fit: 'loose' }).params).toEqual({ position: at, diameter: '2.75 mm', type: 'countersink', cs_diameter: '3.75 mm', cs_angle: '90 deg', targets: ['Body1'] });
    expect(sizesOf('screwHole', 'countersunk')[0]).toBe('M3');
    // ISO 273 fine, medium and coarse (Wikipedia, Ifanger); the screw joint takes the same normal row.
    expect(CLEARANCE).toEqual({
      close: { M2: 2.2, 'M2.5': 2.7, M3: 3.2, M4: 4.3, M5: 5.3, M6: 6.4, M8: 8.4, M10: 10.5 },
      normal: { M2: 2.4, 'M2.5': 2.9, M3: 3.4, M4: 4.5, M5: 5.5, M6: 6.6, M8: 9, M10: 11 },
      loose: { M2: 2.6, 'M2.5': 3.1, M3: 3.6, M4: 4.8, M5: 5.8, M6: 7, M8: 10, M10: 12 },
    });
    expect(CLEARANCE_NORMAL).toBe(CLEARANCE.normal);
    // Head room, one formula: dk + 2 × 0.6 for a counterbore, dk + 0.6 for a countersink down to its hole (audit T39, MV-20).
    expect(headRoom('M5', 'cap')).toEqual({ diameter: 9.7, depth: 5.4 });
    expect(headRoom('M3', 'countersunk')).toEqual({ diameter: 7.32, depth: 1.96 });
  });

  it('draws every hole, slot and pocket wider by the hole allowance of the part\'s material, so that it comes out at its size (audit S-10, W16, T10)', () => {
    const hole: FeatureBlock = { block: 'screwHole', body: 'Body1', point: at, size: 'M3', head: 'none', fit: 'normal' };
    // ISO 273 medium M3 is 3.4 mm: PLA (0.15) 3.55, PP (0.3) 3.7, a measured 0 stays 3.4; without a material, PLA's.
    expect([material('PLA'), material('PP'), { ...DEFAULT_MATERIAL, holeShrink: 0 }].map((stuff) => stepsOf(hole, undefined, undefined, { nozzle: 0.4, layer: 0.2, material: stuff })[0]?.params.diameter)).toEqual(['3.55 mm', '3.7 mm', '3.4 mm']);
    expect(DEFAULT_MATERIAL).toMatchObject(material('PLA'));
    // An insert's seat is drawn at its maker's size in every material: the insert melts into it (review S1).
    expect(stepsOf(defaultBlock('insertSeat', 'Body1', at, 'M3'), undefined, undefined, { nozzle: 0.4, layer: 0.2, material: material('PP') })[0]?.params.diameter).toBe('4 mm');
    // Above the hole plate's 10 mm the allowance grows with the diameter (holeAllowance): ABS 0.25 on 10 mm, 0.265 on 11.
    expect([drawnHole(10, material('ABS')), drawnHole(11, material('ABS'))]).toEqual([10.25, 11.265]);
    // A close hole is no longer refused: drawn wider, it comes out at ISO 273 fine (audit T31 came from undrawn holes).
    expect(blockLimit({ ...hole, size: 'M4', fit: 'close' }, DEFAULT_PRINTER)).toBeNull();
    expect(stepsOf({ ...hole, size: 'M4', fit: 'close' }, undefined, undefined, { nozzle: 0.4, layer: 0.2, material: material('PP') })[0]?.params.diameter).toBe('4.6 mm');
  });

  it('takes the room of nut pockets and lips from the fits of the part\'s material, scaled to the nozzle (audit W16, T10, T42, W36)', () => {
    // Push fit on both sides of the nut: PLA 0.15 → 5.8 (as the fixed 0.3 before), PETG 0.2 → 5.9; on 0.8 mm PLA's doubles.
    const flats = (stuff: ToolMaterial, nozzle = 0.4) => (defaultBlock('nutTrap', 'Body1', at, 'M3', [0, 0, 1], { nozzle, layer: 0.2, material: stuff }) as { flats: number }).flats;
    expect([flats(material('PLA')), flats(material('PETG')), flats(material('PLA'), 0.8), flats(material('PLA'), 0.2)]).toEqual([5.8, 5.9, 6.1, 5.8]);
    // A measured fit is kept within the nut's flats and under its corners (6.35 for M3), so the standard is never refused.
    const fit = (push: number) => ({ ...material('PLA'), clearance: { ...material('PLA').clearance, push } });
    expect([flats(fit(-0.1)), flats(fit(0)), flats(fit(0.4)), flats(fit(0.5))]).toEqual([5.5, 5.5, 6.3, 6.34]);
    expect(blockLimit(defaultBlock('nutTrap', 'Body1', at, 'M3', [0, 0, 1], { nozzle: 0.4, layer: 0.2, material: fit(0.5) }), DEFAULT_PRINTER)).toBeNull();
    expect(fitClearance('push', { nozzle: 0.6, layer: 0.2 })).toBe(0.225);
    // A profile read on a 0.6 mm nozzle is used as read there.
    expect(fitClearance('push', { nozzle: 0.6, layer: 0.2, material: { ...material('PLA'), measuredNozzle: 0.6 } })).toBe(0.15);
    // The lip of a lid: the closure's least lip (LIP.thick, raised to two lines where needed) and the material's slide fit, the
    // closure's 0.25 in PLA (T42, W36).
    const lip = (stuff: ToolMaterial, nozzle: number) => raisedBlock(defaultBlock('lip', 'Body1', at, 'M3', [0, 0, 1], { nozzle, layer: 0.2, material: stuff }), { nozzle, layer: 0.2 }).block;
    expect(lip(material('PLA'), 0.4)).toMatchObject({ width: 1.2, gap: 0.25 });
    expect(lip(material('PETG'), 0.4)).toMatchObject({ width: 1.2, gap: 0.3 });
    expect(lip(material('PLA'), 0.8)).toMatchObject({ width: 1.8, gap: 0.5 });
    // A measured slide fit below zero leaves no gap under zero.
    expect(lip({ ...material('PLA'), clearance: { ...material('PLA').clearance, slide: -0.1 } }, 0.4)).toMatchObject({ gap: 0 });
  });

  it('takes the depth of text from the printer\'s layers, the pilot hole from the rule (audit T49, S-19, MV-26)', () => {
    // 0.5 mm (Xometry) in whole layers: 0.6 on 0.2 and 0.3 mm layers, 0.5 on 0.25, 0.56 on 0.28, 0.64 on 0.16.
    expect([0.2, 0.3, 0.25, 0.28, 0.16].map((layer) => textDepth({ nozzle: 0.4, layer }))).toEqual([0.6, 0.6, 0.5, 0.56, 0.64]);
    expect(defaultBlock('text', 'Body1', at, 'M3', [0, 0, 1], { nozzle: 0.4, layer: 0.16 })).toMatchObject({ depth: 0.64 });
    expect(defaultBlock('logo', 'Body1', at, 'M3', [0, 0, 1], { nozzle: 0.4, layer: 0.16 })).toMatchObject({ depth: 0.64 });
    // A stroke reads well from 1 mm, and never under two lines (1.35 mm on a 0.6 mm nozzle).
    expect([0.4, 0.6].map((nozzle) => textStroke({ nozzle, layer: 0.2 }))).toEqual([1, 1.35]);
    expect(pilotHole(3)).toBe(2.55);
  });

  it('seats an insert one millimetre deeper than it is long, and bosses it with 2 mm of wall in whole lines and a fillet at its foot (audit S-14)', () => {
    expect(defaultBlock('insertSeat', 'Body1', at, 'M3')).toMatchObject({ diameter: 4, depth: 6.7 });
    // No chamfer on a seat: the insert's tip starts it, and the seat's measure needs its plain cylinder.
    expect(stepOf(defaultBlock('insertSeat', 'Body1', at, 'M3')).params).toEqual({ position: at, diameter: '4 mm', depth: '6.7 mm', targets: ['Body1'] });
    // 2 mm of wall is five lines of 0.45 mm, 2.25 mm; the fillet half of that, at least 1 mm and two nozzles.
    expect(stepOf(defaultBlock('boss', 'Body1', at, 'M3')).params).toEqual({ position: at, diameter: '8.5 mm', height: '8.7 mm', hole_diameter: '4 mm', hole_depth: '6.7 mm', draft: '0 deg', fillet: '1.13 mm', body: 'Body1' });
    expect(defaultBlock('boss', 'Body1', at, 'M3', [0, 0, 1], { nozzle: 0.6, layer: 0.3 })).toMatchObject({ diameter: 8.05 });
    expect(stepsOf(defaultBlock('boss', 'Body1', at, 'M3', [0, 0, 1], { nozzle: 0.6, layer: 0.3 }), undefined, undefined, { nozzle: 0.6, layer: 0.3 })[0]?.params).toMatchObject({ fillet: '1.2 mm' });
    expect(sizesOf('insertSeat')).toEqual(['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6']);
    // ruthex RX: the M2.5 insert has the body of the M3 one, and the larger ones ask for more wall than 2 mm.
    expect(defaultBlock('insertSeat', 'Body1', at, 'M2.5')).toMatchObject({ diameter: 4, depth: 6.7 });
    expect((['M2', 'M4', 'M5', 'M6'] as const).map((size) => defaultBlock('boss', 'Body1', at, size)).map((boss) => 'diameter' in boss && boss.diameter)).toEqual([7.7, 10.1, 11.8, 15.2]);
  });

  it('names each block in the work log by its screw, not by the diameter or print size it drills', () => {
    const phrases = (['tappedHole', 'screwHole', 'insertSeat', 'boss'] as const).map((kind) => blockPhrase(defaultBlock(kind, 'Body1', at, 'M5')));
    expect(phrases.map((phrase) => phrase.key)).toEqual(['tappedHole', 'screwHole', 'hole', 'boss']);
    // The modelled M5 is drilled as M5.3x0.8; the log says M5 (review of BC-12).
    expect(stepOf(defaultBlock('tappedHole', 'Body1', at, 'M5')).params).toMatchObject({ thread: 'M5.3x0.8' });
    expect(phrases[0]?.values).toEqual({ thread: 'M5' });
    expect(phrases[1]?.values).toEqual({ size: 'M5' });
    // A raw step still reads as what it is.
    expect(describeCommands([stepOf(defaultBlock('screwHole', 'Body1', at, 'M3'))])[0]?.key).toBe('hole');
  });

  it('models a thread from M5 and lists a smaller one, in the form as with the assistant (review of BC-12)', () => {
    expect((['M3', 'M4', 'M5', 'M10'] as const).map((size) => (defaultBlock('tappedHole', 'Body1', at, size) as { modeled: boolean }).modeled)).toEqual([false, false, true, true]);
    const tapped = (size: 'M4' | 'M5', modeled: boolean): FeatureBlock => ({ block: 'tappedHole', body: 'Body1', point: at, size, depth: null, modeled });
    const limit = blockLimit(tapped('M4', true), DEFAULT_PRINTER);
    expect(limit).toEqual({ key: 'modeled', value: 4, nozzle: 0.4, reason: 'printedThread', size: 'M4', from: 5 });
    expect(limit && limitSaid(limit)).toBe('modeled: a printed M4 thread strips; give modeled false to drill it for tapping after printing, use insertSeat (a heat-set insert), or a thread from M5');
    expect(blockLimit(tapped('M4', false), DEFAULT_PRINTER)).toBeNull();
    expect(blockLimit(tapped('M5', true), DEFAULT_PRINTER)).toBeNull();
    // A listed M8 is drilled with ISO's 6.8 mm tap drill, chamfered from there.
    expect(stepOf({ block: 'tappedHole', body: 'Body1', point: at, size: 'M8', depth: null, modeled: false }).params).toMatchObject({ thread: 'M8', cs_diameter: '7.8 mm' });
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
    expect(steps[1]?.params).toEqual({ text: 'PartBuddy', at: [0, -3.5], height: 7, align: 'center', font: 'Arial', bold: true });
    expect(steps[2]?.params).toEqual({ depth: '0.6 mm', mode: 'deboss', face: at, targets: ['Body1'] });
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
    // Drawn with PLA's hole allowance on the flats: 5.95 mm.
    expect(steps[1]?.params).toEqual({ center: [0, 0], radius: 2.975, sides: 6 });
    expect(steps[2]?.params).toEqual({ distance: '-2.8 mm', operation: 'cut', targets: ['Body1'] });
    expect(steps[3]?.params).toEqual({ position: [10, 10, 7.2], diameter: '3.55 mm', targets: ['Body1'] });
  });

  it('cuts a slot as wide as the clearance hole, along the chosen direction', () => {
    const block = defaultBlock('slot', 'Body1', at, 'M4', [0, 0, 1]);
    expect(stepsOf(block)[1]?.params).toEqual({ p0: [-5, 0], p1: [5, 0], width: 4.65 });
    expect(stepsOf(block)[2]?.params).toEqual({ distance: '-1000 mm', operation: 'cut', targets: ['Body1'] });
    const upright = stepsOf({ ...block, along: 'y', depth: 3 } as FeatureBlock);
    expect(upright[1]?.params).toMatchObject({ p0: [0, -5], p1: [0, 5] });
    expect(upright[2]?.params).toEqual({ distance: '-3 mm', operation: 'cut', targets: ['Body1'] });
  });

  describe('a cut "through" goes through the wall it enters, not the far wall of a hollow part (audit W2, T4, N-bloecke-1)', () => {
    // SolidCraft 0.40.1, 2026-11-13: box 60 × 40 × 30 with walls of 2 mm, open at the top; the trial of a slot at
    // [0, 20, 15] into the wall x = 0 left these two pieces.
    const measured = {
      bodies: [
        { name: 'Dose', bbox: { min: [0, 0, 0], max: [60, 40, 30] }, center_of_mass: [30, 20, 11.33] },
        { name: 'PartBuddy through', bbox: { min: [57.99999999999999, 13.299999999999997, 13.3], max: [60.00000000000001, 26.7, 16.700000000000006] }, center_of_mass: [59.000000000000014, 20, 15] },
        { name: 'PartBuddy through (1)', bbox: { min: [0, 13.299999999999997, 13.3], max: [2, 26.7, 16.700000000000006] }, center_of_mass: [1.0000000000000149, 20, 15] },
      ],
    };
    const wall: [number, number, number] = [0, 20, 15];

    it('knows the blocks that cut through', () => {
      expect(['screwHole', 'nutTrap', 'slot', 'tappedHole'].map((kind) => cutsThrough(defaultBlock(kind as 'slot', 'Dose', wall, 'M5', [-1, 0, 0])))).toEqual([true, true, true, true]);
      expect(cutsThrough({ ...defaultBlock('slot', 'Dose', wall, 'M3', [-1, 0, 0]), depth: 2 } as FeatureBlock)).toBe(false);
      expect(cutsThrough(defaultBlock('insertSeat', 'Dose', wall, 'M3'))).toBe(false);
      // Asked to go through all of the body (both cheeks of a fork): no reach to find, the cut goes through all.
      const fork = { ...defaultBlock('screwHole', 'Fork', wall, 'M3'), through: 'body' } as FeatureBlock;
      expect(cutsThrough(fork)).toBe(false);
      expect(stepsOf(fork)[0]?.params).not.toHaveProperty('depth');
      expect(featureBlockSchema.safeParse(fork).success).toBe(true);
      expect(featureBlockSchema.safeParse({ ...fork, through: 'all' }).success).toBe(false);
    });

    it('tries the cut through all on a copy of the body, plain where it is a modelled thread, and measures what it takes', () => {
      const trial = throughTrial(defaultBlock('tappedHole', 'Dose', wall, 'M5'));
      expect(trial.map((step) => step.command)).toEqual(['solid.box', 'solid.combine', 'solid.move', 'solid.hole', 'solid.move', 'solid.combine', 'inspect.measure']);
      expect(trial[1]?.params).toEqual({ target: 'PartBuddy through', tools: ['Dose'], operation: 'intersect', keep_tools: true });
      // The copy stands aside while the hole is drilled: on the body, SolidCraft 0.40.1 failed every solid.hole.
      expect(trial[2]?.params).toEqual({ bodies: ['PartBuddy through'], translate: [0, 0, 30000] });
      expect(trial[3]?.params).toMatchObject({ thread: 'M5', modeled: false });
      expect(trial[4]?.params).toEqual({ bodies: ['PartBuddy through'], translate: [0, 0, -30000] });
      expect(trial[5]?.params).toEqual({ target: 'PartBuddy through', tools: ['Dose'], operation: 'cut', keep_tools: true });
    });

    it('cuts through the near wall and a millimetre on, never half way to the next wall or further', () => {
      const slot = defaultBlock('slot', 'Dose', wall, 'M3', [-1, 0, 0]);
      expect(throughReach(slot, measured)).toEqual([3]);
      // The wall itself, which a nut trap's pocket and engraved text must stop short of (audit N-bloecke-6).
      expect(throughWall(slot, measured)).toEqual([2]);
      expect(throughWall({ ...slot, point: [-0.1, 20, 15] }, measured)).toEqual([null]);
      // A nut trap is tried by its hole alone: its pocket, deeper than a thin wall, would leave the hole on no face.
      expect(throughTrial(defaultBlock('nutTrap', 'Dose', wall, 'M3', [-1, 0, 0])).filter((step) => step.command !== 'solid.box' && step.command !== 'solid.combine' && step.command !== 'solid.move' && step.command !== 'inspect.measure')).toEqual([
        { command: 'solid.hole', params: { position: wall, diameter: '3.55 mm', type: 'countersink', cs_diameter: '4.55 mm', cs_angle: '90 deg', targets: ['Dose'] } },
      ]);
      // A point a little off its face (rounded) still finds its wall; one further off finds none.
      expect(throughReach({ ...slot, point: [-0.04, 20, 15] }, measured)).toEqual([3.04]);
      expect(throughReach({ ...slot, point: [-0.1, 20, 15] }, measured)).toEqual([null]);
      expect(stepsOf(slot, undefined, [3])[2]?.params).toEqual({ distance: '-3 mm', operation: 'cut', targets: ['Dose'] });
      // A wall 1 mm before the next: half way.
      const near = { bodies: [measured.bodies[2], { ...measured.bodies[1], bbox: { min: [3, 13.3, 13.3], max: [5, 26.7, 16.7] } }] };
      expect(throughReach(slot, near)).toEqual([2.5]);
      // A solid part: one piece, through it and on.
      expect(throughReach(slot, { bodies: [{ ...measured.bodies[2], bbox: { min: [0, 13.3, 13.3], max: [60, 26.7, 16.7] }, center_of_mass: [30, 20, 15] }] })).toEqual([61]);
    });

    it('gives each hole of a row its own reach, the nut trap its hole from the pocket on, and none where no piece holds the point', () => {
      const row: FeatureBlock = { block: 'screwHole', body: 'Dose', point: wall, size: 'M3', head: 'none', fit: 'normal', more: [[30, 20, 0]] };
      const floor = { name: 'PartBuddy through (2)', bbox: { min: [28.3, 18.3, 0], max: [31.7, 21.7, 2] }, center_of_mass: [30, 20, 1] };
      expect(throughReach(row, { bodies: [...measured.bodies, floor] })).toEqual([3, 3]);
      expect(stepsOf(row, undefined, [3, null]).map((step) => step.params.depth)).toEqual(['3 mm', undefined]);
      expect(throughReach(row, { bodies: [] })).toEqual([null, null]);
      const trap = { ...defaultBlock('nutTrap', 'Dose', wall, 'M3', [-1, 0, 0]), depth: 1.5 } as FeatureBlock;
      expect(stepsOf(trap, undefined, [3])[3]?.params).toMatchObject({ position: [1.5, 20, 15], depth: '1.5 mm' });
      expect(stepsOf(defaultBlock('tappedHole', 'Dose', wall, 'M5'), undefined, [3])[0]?.params).toMatchObject({ depth: '3 mm', modeled: true });
      // SolidCraft refuses a counterbore as deep as its hole: in a 2 mm wall the 3.4 mm counterbore takes the wall, the hole ends past it.
      expect(stepsOf(defaultBlock('screwHole', 'Dose', wall, 'M3'), undefined, [3])[0]?.params).toMatchObject({ depth: '3.41 mm', cb_depth: '3.4 mm' });
      expect(stepsOf(defaultBlock('screwHole', 'Dose', wall, 'M3'), undefined, [6])[0]?.params).toMatchObject({ depth: '6 mm' });
    });
  });

  it('builds a lip, and a groove with its gap, with SolidCraft\'s plastic.lip', () => {
    const lip = defaultBlock('lip', 'Body1', at, 'M3');
    expect(stepsOf(lip)).toEqual([{ command: 'plastic.lip', params: { face: at, type: 'lip', width: '1.2 mm', height: '2 mm', body: 'Body1' } }]);
    expect(stepsOf({ ...lip, type: 'groove' } as FeatureBlock)[0]?.params).toMatchObject({ type: 'groove', gap: '0.25 mm' });
  });

  it('stands a snap fit out of the face with its catch across the arm', () => {
    const block = defaultBlock('snapFit', 'Body1', at, 'M3', [0, 0, 1]);
    expect(stepsOf(block)).toEqual([
      {
        command: 'plastic.snap_fit',
        params: { position: at, hook: [0, 1, 0], length: '12 mm', thickness: '1.5 mm', width: '5 mm', catch_depth: '0.8 mm', catch_length: '1.5 mm', body: 'Body1' },
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
