import { withMotion, type PrintCheck } from '@partbuddy/geometry';
import { describe, expect, it } from 'vitest';

import { printCheckNote } from '../src/main/print/printCheckNote';
import { jointMove, jointPoses, playRange, playStep, rotate, withFollowers } from '../src/renderer/src/viewer/jointPose';
import { snapSpan, sweepStopOf } from '../src/main/solidcraft/actions';

import { boughtAmong, componentsWithBodies, hardwareOf, jointsOf, partCandidates, structureOf, withColours } from '../src/main/solidcraft/mirror';
import type { ReferenceState } from '../src/main/solidcraft/partReference';
import { describeCommands, describeUserAction } from '../src/shared/stepPhrases';
import { structureSchema } from '../src/shared/contract';

describe('structure tree and timeline from document.inspect (M1c)', () => {
  it('reads features, the rollback marker, bodies and sketches as SolidCraft 0.30.1 reports them', () => {
    const structure = structureOf({
      bodies: [{ name: 'Body1', visible: true, feature: 2 } as { name: string; visible: boolean }],
      sketches: [{ id: 1, name: 'Base', visible: false }],
      timeline: [
        { id: 1, name: 'Base', type: 'Sketch', error: null, warning: null, suppressed: false, rolled_back: false, ms: 0.2 },
        { id: 2, name: 'Extrude1', type: 'ExtrudeFeature', error: null, warning: null, suppressed: false, rolled_back: false, ms: 2.4 },
        { id: 3, name: 'Fillet1', type: 'FilletFeature', error: 'radius too large', warning: null, suppressed: false, rolled_back: true, ms: 0 },
        { id: 'broken' },
      ],
      marker: 2,
    });
    expect(structure.features.map((feature) => [feature.name, feature.rolledBack, feature.error])).toEqual([
      ['Base', false, null],
      ['Extrude1', false, null],
      ['Fillet1', true, 'radius too large'],
    ]);
    expect(structure.marker).toBe(2);
    expect(structure.bodies).toEqual([{ name: 'Body1', visible: true, feature: 2 }]);
    expect(structure.sketches).toEqual([{ id: 1, name: 'Base', visible: false }]);
    expect(structureSchema.safeParse(structure).success).toBe(true);
  });

  it('reports the marker only while it is before the end', () => {
    const timeline = [{ id: 1, name: 'Box1', type: 'BoxFeature', suppressed: false, rolled_back: false, ms: 1 }];
    expect(structureOf({ timeline, marker: 1 }).marker).toBeNull();
    expect(structureOf({ timeline, marker: 0 }).marker).toBe(0);
    expect(structureOf({}).features).toEqual([]);
  });
});

describe('standard parts the assistant inserted itself', () => {
  it('takes the bodies of parts.insert components as standard parts, by their description, also when renamed', () => {
    // component.list as SolidCraft 0.40.0-rc.2 answers: the design itself, three components holding a body, an empty one.
    const parts = componentsWithBodies({
      components: [
        { id: 0, name: 'Sensor housing', parent: null, bodies: ['Base', 'Lid'] },
        { id: 25, name: 'Screw FR', parent: 0, bodies: ['Screw FR'] },
        { id: 31, name: 'Bearing 608', parent: 0, bodies: ['Bearing'] },
        { id: 40, name: 'Bracket', parent: 0, bodies: ['Bracket'] },
        { id: 41, name: 'Group', parent: 0, bodies: [] },
      ],
    });
    expect(parts.map((part) => part.id)).toEqual([25, 31, 40]);
    // Their component.metadata: two from parts.insert, one of the user's own.
    const metadata = [{ description: 'Button head cap screw M3x8' }, { description: 'Deep groove ball bearing (envelope) 608' }, { description: 'Bracket for the shelf' }];
    const library = {
      families: [
        { family: 'button_head_cap_screw', name: 'Button head cap screw', sizes: [{ size: 'M3' }] },
        { family: 'bearing', name: 'Deep groove ball bearing (envelope)', sizes: [{ size: '608' }] },
      ],
    };
    const logs: string[] = [];
    const log = (message: string) => void logs.push(message);
    expect(partCandidates(parts, metadata, library, log)).toEqual([
      { component: 25, body: 'Screw FR', description: 'Button head cap screw M3x8', part: { family: 'button_head_cap_screw', size: 'M3', length: 8 } },
      { component: 31, body: 'Bearing', description: 'Deep groove ball bearing (envelope) 608', part: { family: 'bearing', size: '608', length: null } },
    ]);
    // Without the library nothing is taken for a part: the bodies stay in print check and export.
    expect(partCandidates(parts, metadata, undefined, log)).toEqual([]);
    expect(logs).toEqual([]);
    expect(componentsWithBodies(undefined)).toEqual([]);
  });

  it('counts every body of a library component as printed once it holds more than the part (review 2, stage 1)', () => {
    // Measured with SolidCraft 0.40.1: component.move_bodies {bodies: ["Deckel"], component: "Nut"}, component.copy_bodies
    // and component.activate with solid.box each leave the nut's component with two bodies; all 13 families build one.
    const library = { families: [{ family: 'hex_nut', name: 'Hex nut', sizes: [{ size: 'M3' }] }] };
    const logs: string[] = [];
    const moved = partCandidates([{ id: 3, bodies: ['Deckel', 'Body1'] }, { id: 9, bodies: ['Body2'] }], [{ description: 'Hex nut M3' }, { description: 'Hex nut M3' }], library, (message) => void logs.push(message));
    // The lid stays printed, the nut beside it in the same component too; the untouched nut is still a candidate.
    expect(moved.map((candidate) => candidate.body)).toEqual(['Body2']);
    expect(logs).toEqual(['the component described as "Hex nut M3" holds 2 bodies (Deckel, Body1), a standard part has one: they count as printed']);
  });

  it('takes a body for the part only when it has the shape SolidCraft builds for the description (review 2, stage 2)', () => {
    // inspect.measure as SolidCraft 0.40.1 answers: an M3 nut, turned (volume and area off by 6e-11), the same nut with a
    // 0.3 mm plate joined on (solid.combine), and a 0.3 mm lid described as "Hex nut M3".
    const areas = [2.4, 2.4, 6.6, 6.6, 6.6, 6.6, 6.6, 6.6, 18.1];
    // Each face as inspect.measure {items: [{type: "face", …}]} answers; the last is the bore.
    const facesOf = (list: number[]) => list.map((area, i) => ({ items: [{ type: 'face', area_mm2: area, perimeter_mm: area * 2, ...(i === 8 ? { radius: 1.5 } : {}) }] }));
    const nutFaces = facesOf(areas);
    const nut = { volume: 45.9088439852507, area: 106.60297841336842, faces: 9, edges: 21, vertices: 14, faceAreas: areas, perimeters: areas.map((area) => area * 2), radii: [1.5] };
    const references = new Map<string, ReferenceState>([
      ['Hex nut M3', { shape: nut, partNumber: 'ISO 4032 M3' }],
      ['Hex nut M4', { building: true }],
      ['Hex nut M5x5000', { refused: '`length` must be 0…2000 mm' }],
      ['Hex nut M8', { failed: 'solidcraft-cli ended with code 3221225477' }],
    ]);
    const candidate = (component: number, body: string, description = 'Hex nut M3') => ({ component, body, description, part: { family: 'hex_nut', size: 'M3', length: null } });
    const measured = {
      bodies: [
        { name: 'Body1', volume_mm3: 45.90884398802, area_mm2: 106.602978419, faces: 9, edges: 21, vertices: 14 },
        { name: 'Body2', volume_mm3: 310.17023848330126, area_mm2: 1890.2, faces: 24, edges: 60, vertices: 40 },
        { name: 'Deckel', volume_mm3: 360.00000000000506, area_mm2: 2442, faces: 6, edges: 12, vertices: 8 },
        // The same counts as the nut and a volume a thousandth off: not the part either.
        { name: 'Near', volume_mm3: 45.95, area_mm2: 106.60297841336842, faces: 9, edges: 21, vertices: 14 },
        { name: 'Open', area_mm2: 106.6, faces: 9, edges: 21, vertices: 14 },
        // Volume, area and counts of the nut to the last digit, but other faces (second review, point 3).
        { name: 'Twin', volume_mm3: 45.9088439852507, area_mm2: 106.60297841336842, faces: 9, edges: 21, vertices: 14 },
      ],
    };
    const twinFaces = facesOf([1.4, 3.4, 6.6, 6.6, 6.6, 6.6, 6.6, 6.6, 18.1]);
    const logs: string[] = [];
    const candidates = [
      candidate(3, 'Body1'),
      candidate(9, 'Body2'),
      candidate(16, 'Deckel'),
      candidate(20, 'Near'),
      candidate(22, 'Open'),
      candidate(24, 'Gone'),
      candidate(26, 'Twin'),
      candidate(30, 'Body1', 'Hex nut M4'),
      candidate(32, 'Body1', 'Hex nut M5x5000'),
      candidate(34, 'Body1', 'Hex nut M6'),
      candidate(36, 'Body9', 'Hex nut M8'),
    ];
    const faces = [nutFaces, nutFaces, nutFaces, nutFaces, nutFaces, nutFaces, twinFaces, nutFaces, nutFaces, nutFaces, nutFaces];
    const told = boughtAmong(candidates, measured, faces, references, (message) => void logs.push(message));
    expect(told.bought).toEqual([{ component: 3, body: 'Body1', description: 'Hex nut M3', partNumber: 'ISO 4032 M3' }]);
    // A part still being built is neither printed nor bought; one that could not be built for now is named for the export, which must not go out unchecked.
    expect(told.pending).toEqual(['Body1']);
    expect(told.unchecked).toEqual(['"Body1": no answer', '"Body9": solidcraft-cli ended with code 3221225477']);
    // Every body left printed is named with the reason.
    expect(logs).toHaveLength(10);
    expect(logs[1]).toBe('body "Deckel" is described as "Hex nut M3" but is not that part (360.00000000000506 mm³, 6 faces; the part has 45.9088439852507 mm³, 9 faces): it counts as printed');
    expect(logs[5]).toContain('body "Twin" is described as "Hex nut M3" but is not that part');
    expect(logs[6]).toBe('body "Body1" is described as "Hex nut M4", which SolidCraft is building to hold it against: it is neither printed nor bought until then');
    expect(logs[7]).toBe('body "Body1" is described as "Hex nut M5x5000", which SolidCraft does not build (`length` must be 0…2000 mm): it counts as printed');
    expect(logs[8]).toBe('body "Body1" is described as "Hex nut M6", which could not be built to hold it against (no answer): it counts as printed');
    expect(logs[9]).toBe('body "Body9" is described as "Hex nut M8", which could not be built to hold it against (solidcraft-cli ended with code 3221225477): it counts as printed');
    expect(boughtAmong(candidates, undefined, faces, references, () => undefined).bought).toEqual([]);
    // Without its faces, or with one of them missing, a body is not measured.
    expect(boughtAmong(candidates.slice(0, 1), measured, [], references, () => undefined).bought).toEqual([]);
    expect(boughtAmong(candidates.slice(0, 1), measured, [nutFaces.slice(1)], references, () => undefined).bought).toEqual([]);
  });

  it('lists the parts to buy from the standard parts themselves, each as often as it is placed (review 4)', () => {
    // component.list as SolidCraft 0.40.1 answers: a nut, a printed lid, and a washer in a subassembly placed twice.
    const listing = {
      components: [
        { id: 0, parent: null, bodies: [], occurrences: [] },
        { id: 2, parent: 0, bodies: ['Deckel'], occurrences: [{ id: 3, parent: 0 }] },
        { id: 5, parent: 0, bodies: ['Body1'], occurrences: [{ id: 6, parent: 0 }] },
        { id: 11, parent: 0, bodies: [], occurrences: [{ id: 12, parent: 0 }, { id: 20, parent: 0 }] },
        { id: 13, parent: 11, bodies: ['Body2'], occurrences: [{ id: 14, parent: 11 }] },
        { id: 30, parent: 0, bodies: ['Body3'], occurrences: [{ id: 31, parent: 0 }] },
      ],
    };
    const bought = [
      { component: 13, body: 'Body2', description: 'Plain washer M3', partNumber: 'ISO 7089 M3' },
      { component: 5, body: 'Body1', description: 'Hex nut M3', partNumber: 'ISO 4032 M3' },
      { component: 30, body: 'Body3', description: 'Hex nut M3', partNumber: 'ISO 4032 M3' },
    ];
    // assembly.bom put the nut and the lid given part_number "ISO 4032 M3" into one row (components [2, 5], count 2),
    // dropped the nut with bom_type "reference", and listed the lid alone; this list follows none of that.
    expect(hardwareOf(bought, listing)).toEqual([
      { count: 2, name: 'Hex nut M3', standard: 'ISO 4032 M3' },
      { count: 2, name: 'Plain washer M3', standard: 'ISO 7089 M3' },
    ]);
    expect(hardwareOf([], listing)).toEqual([]);
    // A listing that reads oddly still names the part once.
    expect(hardwareOf(bought.slice(1, 2), undefined)).toEqual([{ count: 1, name: 'Hex nut M3', standard: 'ISO 4032 M3' }]);
  });

  it('gives bodies the colour SolidCraft lists for them, as 0.40 answers appearance.list', () => {
    const structure = structureOf({ bodies: [{ name: 'Body1', visible: true }, { name: 'Badge ffd500', visible: true }] });
    // eslint-disable-next-line no-restricted-syntax -- SolidCraft's answer holds the body's colour
    const coloured = withColours(structure, { bodies: { 'Badge ffd500': { color: '#FFD500', name: 'Custom', opacity: 1 } } });
    // eslint-disable-next-line no-restricted-syntax -- the colour SolidCraft lists
    expect(coloured.bodies.map((body) => body.colour)).toEqual([undefined, '#ffd500']);
    expect(structureSchema.safeParse(coloured).success).toBe(true);
    expect(withColours(structure, undefined)).toEqual(structure);
  });
});

describe('joints of parts that move (ADR 0027)', () => {
  it('reads joint.list as SolidCraft 0.40.0-rc.3 answers it, and leaves out what it cannot show', () => {
    const joints = jointsOf({
      joints: [
        { a: 4, b: 6, id: 9, name: 'Hinge', type: 'revolute', suppressed: false, values: [{ limits: [-180, 0], name: 'angle', unit: 'deg', value: -90 }] },
        { id: 11, name: 'Slide', type: 'slider', values: [{ limits: null, name: 'distance', unit: 'mm', value: 12.5 }] },
        { id: 12, name: 'Fixed', type: 'rigid', values: [] },
        { id: 13, name: 'Off', type: 'revolute', suppressed: true, values: [{ limits: null, name: 'angle', unit: 'deg', value: 0 }] },
        { id: 'broken' },
      ],
    });
    expect(joints).toEqual([
      { id: 9, name: 'Hinge', type: 'revolute', values: [{ unit: 'deg', value: -90, limits: [-180, 0] }] },
      { id: 11, name: 'Slide', type: 'slider', values: [{ unit: 'mm', value: 12.5, limits: null }] },
    ]);
    expect(structureSchema.safeParse({ ...structureOf({}), joints }).success).toBe(true);
    expect(jointsOf(undefined)).toEqual([]);
  });

  it('names the steps in the work log', () => {
    expect(describeUserAction({ kind: 'jointMove', name: 'Hinge', value: -90.004, unit: 'deg' })).toEqual({ key: 'jointMove', values: { name: 'Hinge', value: '-90°' } });
    expect(
      describeCommands([
        { command: 'component.from_bodies', params: { bodies: ['Base', 'Flap'] } },
        { command: 'joint.as_built', params: { type: 'revolute', name: 'Hinge' } },
      ]).map((phrase) => phrase.key),
    ).toEqual(['movableParts', 'joint']);
  });
});

describe('the motion of joints in the ready-to-print check (ADR 0027)', () => {
  const ready: PrintCheck = { status: 'ready', findings: [] };
  const stop = (to: number, stoppedAt: number) => ({ joint: 'Hinge', unit: 'deg' as const, to, stoppedAt, a: 'Flap:1', b: 'Base:1', at: [40, 30, 0] as [number, number, number] });

  it('names a joint that parts stop before its limit, by the bodies, and not one that reaches it', () => {
    const check = withMotion(ready, { joints: [{ name: 'Hinge', values: [{ unit: 'deg', value: 0 }] }], stops: [stop(90, 28.0703125), stop(-180, -179.9921875)] });
    expect(check.status).toBe('warn');
    expect(check.findings).toEqual([
      { kind: 'blocked', severity: 'warn', joint: 'Hinge', bodies: ['Flap', 'Base'], at: 28.1, limit: 90, unit: 'deg', places: [], box: { min: [38, 28, -2], max: [42, 32, 2] } },
    ]);
  });

  it('says that a joint without a limit that way stopped, not that it missed a limit (audit H-04)', () => {
    const check = withMotion(ready, { joints: [], stops: [{ ...stop(190, 120), free: true }, { ...stop(-190, -189.8), free: true }] });
    expect(check.findings).toEqual([
      { kind: 'blocked', severity: 'warn', joint: 'Hinge', bodies: ['Flap', 'Base'], at: 120, limit: 190, unit: 'deg', free: true, places: [], box: { min: [38, 28, -2], max: [42, 32, 2] } },
    ]);
  });

  it('names a joint left away from the position as designed', () => {
    const check = withMotion(ready, { joints: [{ name: 'Hinge', values: [{ unit: 'deg', value: -90 }] }, { name: 'Slide', values: [{ unit: 'mm', value: 0 }] }], stops: [] });
    expect(check.findings).toEqual([{ kind: 'posed', severity: 'warn', joint: 'Hinge', value: -90, unit: 'deg' }]);
    expect(withMotion(ready, { joints: [], stops: [] })).toEqual(ready);
  });

  it('reads the stop of joint.sweep as SolidCraft 0.40.0-rc.3 answers it', () => {
    expect(sweepStopOf({ stopped_at: 28.0703125, stopped_by: { a: 'Flap:1', at: [40, 30, 0], b: 'Base:1' }, to: 200 })).toEqual({ stoppedAt: 28.0703125, a: 'Flap:1', b: 'Base:1', at: [40, 30, 0] });
    // It ran through, or a limit or a closed loop ended it: no parts to name.
    expect(sweepStopOf({ stopped_at: null, stopped_by: null })).toBeNull();
    expect(sweepStopOf({ stopped_at: 12, stopped_by: 'limit' })).toBeNull();
    expect(sweepStopOf(undefined)).toBeNull();
    // A lid's bead meets the rim 4.4° before closed: near enough to be a snap fit; a flap stopped at 28° of 90° is not.
    expect(snapSpan(175.6, 180, 'deg')).toBe(true);
    expect(snapSpan(28.07, 90, 'deg')).toBe(false);
    expect(snapSpan(-3, 0, 'mm')).toBe(true);
    expect(snapSpan(10, 20, 'mm')).toBe(false);
    // A flap folded flat onto its base reached the limit: nothing to try.
    expect(snapSpan(-179.98, -180, 'deg')).toBe(false);
  });

  it('words both for the assistant', () => {
    const note = printCheckNote({
      status: 'warn',
      nozzle: 0.4,
      revision: 3,
      findings: [
        { kind: 'blocked', severity: 'warn', joint: 'Hinge', bodies: ['Flap', 'Base'], at: 28.1, limit: 90, unit: 'deg', places: [] },
        { kind: 'posed', severity: 'warn', joint: 'Hinge', value: -90, unit: 'deg' },
      ],
    });
    expect(note).toContain('joint "Hinge" stops at 28.1 deg, before its limit of 90 deg: bodies "Flap" and "Base" touch there');
    expect(note).toContain('joint "Hinge" stands at -90 deg, not at 0 as designed');
  });
});

describe('a joint followed in the view while its slider is dragged (ADR 0027, G4)', () => {
  // joint.list and component.list as SolidCraft 0.40.0-rc.3 answer for two plates hinged along Y at x 41, z 4.
  const listing = {
    joints: [
      { a: 4, b: 6, id: 9, name: 'Hinge', type: 'revolute', frame_a: { origin: [41, 15, 4], z: [0, 1, 0] }, frame_b: { origin: [41, 15, 4], z: [0, 1, 0] }, values: [{ limits: null, name: 'angle', unit: 'deg', value: 0 }] },
      { a: 6, b: 8, id: 10, name: 'Slide', type: 'slider', frame_a: { origin: [60, 15, 4], z: [1, 0, 0] }, values: [{ limits: null, name: 'distance', unit: 'mm', value: 5 }] },
    ],
  };
  const components = {
    components: [
      { id: 0, parent: null, bodies: [], occurrences: [] },
      { id: 3, parent: 0, bodies: ['Base'], occurrences: [{ id: 4, name: 'Base:1' }] },
      { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ id: 6, name: 'Flap:1' }] },
      { id: 7, parent: 0, bodies: ['Latch'], occurrences: [{ id: 8, name: 'Latch:1' }] },
    ],
  };

  it('gives each joint its axis and the bodies it moves, those joined on beyond it too', () => {
    const [hinge, slide] = jointsOf(listing, components);
    expect(hinge).toMatchObject({ origin: [41, 15, 4], axis: [0, 1, 0], bodies: ['Flap', 'Latch'] });
    expect(slide).toMatchObject({ origin: [60, 15, 4], axis: [1, 0, 0], bodies: ['Latch'] });
    expect(structureSchema.safeParse({ ...structureOf({}), joints: [hinge, slide] }).success).toBe(true);
    // Without the components nothing says which bodies move: the joint has a slider but no preview.
    expect(jointsOf(listing)[0]).not.toHaveProperty('bodies');
  });

  it('turns the bodies about the axis as SolidCraft drives the joint, and shifts them along a slide', () => {
    const [hinge, slide] = jointsOf(listing, components);
    if (!hinge || !slide) throw new Error('no joints');
    // Driven to -90°, SolidCraft puts the middle of the flap (62, 15, 2) at (43, 15, 25).
    const move = jointMove(hinge, 0, -90);
    if (!move) throw new Error('no move');
    const turned = rotate(move.quaternion, [62, 15, 2]).map((value, i) => value + (move.position[i] ?? 0));
    expect(turned[0]).toBeCloseTo(43);
    expect(turned[1]).toBeCloseTo(15);
    expect(turned[2]).toBeCloseTo(25);
    // The slide stands at 5 mm: dragged to 12 mm, its bodies move 7 mm along the axis.
    expect(jointMove(slide, 0, 12)).toEqual({ position: [7, 0, 0], quaternion: [0, 0, 0, 1] });
    // Where the mirror already has them, nothing moves.
    expect(jointMove(slide, 0, 5)).toBeNull();
  });

  it('moves a body beyond two joints by both: along its slide first, then about the hinge that carries the slide', () => {
    const [hinge, slide] = jointsOf(listing, components);
    if (!hinge || !slide) throw new Error('no joints');
    const poses = jointPoses([hinge, slide], [
      { joint: hinge.id, index: 0, value: -90 },
      { joint: slide.id, index: 0, value: 12 },
    ]);
    // The flap only turns: as with the hinge alone.
    expect(poses.get('Flap')).toEqual(jointMove(hinge, 0, -90));
    // The latch slides 7 mm along x, then turns with the flap: a point of it at (62, 15, 2) goes to (69, 15, 2) and on to (43, 15, 32).
    const latch = poses.get('Latch');
    if (!latch) throw new Error('no pose');
    const point = rotate(latch.quaternion, [62, 15, 2]).map((value, i) => value + (latch.position[i] ?? 0));
    expect(point[0]).toBeCloseTo(43);
    expect(point[1]).toBeCloseTo(15);
    expect(point[2]).toBeCloseTo(32);
    expect(poses.has('Base')).toBe(false);
    // One joint alone, and nothing moved: as before.
    expect(jointPoses([hinge, slide], [{ joint: slide.id, index: 0, value: 12 }]).get('Latch')).toEqual({ position: [7, 0, 0], quaternion: [0, 0, 0, 1] });
    expect(jointPoses([hinge, slide], [{ joint: slide.id, index: 0, value: 5 }]).size).toBe(0);
  });

  it('ends the range a joint plays in where the check found parts in its way', () => {
    const stop = { at: -28.1, limit: -180 };
    expect(playRange([-180, 0], 0, [stop])).toEqual({ range: [-28.1, 0], low: stop });
    expect(playRange([-90, 90], 0, [{ at: 40, limit: 90 }, stop])).toEqual({ range: [-28.1, 40], low: stop, high: { at: 40, limit: 90 } });
    // Nothing in the way: the whole range.
    expect(playRange([-180, 0], 0, [])).toEqual({ range: [-180, 0] });
  });

  it('reads the motion links of joint.list and moves a gear\'s mate with its driver', () => {
    // joint.list as SolidCraft 0.40.0-rc.4 answers after joint.gear {ra: 10, rb: 20} with the axles at 30° and 10°.
    const geared = {
      joints: [
        { a: 5, b: 7, id: 13, name: 'Small axle', type: 'revolute', frame_a: { origin: [0, 0, 5], z: [0, 0, 1] }, values: [{ limits: null, name: 'angle', unit: 'deg', value: 90 }] },
        { a: 5, b: 9, id: 14, name: 'Large axle', type: 'revolute', frame_a: { origin: [30.5, 0, 5], z: [0, 0, 1] }, values: [{ limits: null, name: 'angle', unit: 'deg', value: -20 }] },
      ],
      links: [{ a: 13, b: 14, coupling: { ra: 10, rb: 20, type: 'gear' }, ia: 0, ib: 0, offset: 24.999999999999996, ratio: -0.5, unit: 'deg' }],
    };
    const parts = { components: [{ id: 6, parent: 0, bodies: ['Small'], occurrences: [{ id: 7 }] }, { id: 8, parent: 0, bodies: ['Large'], occurrences: [{ id: 9 }] }] };
    const [small, large] = jointsOf(geared, parts);
    if (!small || !large) throw new Error('no joints');
    expect(small.values[0]).not.toHaveProperty('follows');
    expect(large.values[0]?.follows).toEqual({ joint: 13, index: 0, ratio: -0.5, offset: 24.999999999999996 });
    expect(structureSchema.safeParse({ ...structureOf({}), joints: [small, large] }).success).toBe(true);
    // The driver shown at 30°: the mate stands at 25 − 15 = 10°, where SolidCraft had it when the link was made.
    const shown = withFollowers([small, large], [{ joint: 13, index: 0, value: 30 }]);
    expect(shown.map((entry) => [entry.joint, entry.index])).toEqual([
      [13, 0],
      [14, 0],
    ]);
    expect(shown[1]?.value).toBeCloseTo(10);
    // Both bodies turn in the view; nothing follows a preview of the mate itself, and a link that reads oddly is left out.
    expect([...jointPoses([small, large], [{ joint: 13, index: 0, value: 30 }]).keys()].sort()).toEqual(['Large', 'Small']);
    expect(withFollowers([small, large], [])).toEqual([]);
    expect(jointsOf({ ...geared, links: [{ a: 13, b: 14, ratio: 'half' }] }, parts)[1]?.values[0]).not.toHaveProperty('follows');
  });

  it('plays a joint through its range: back and forth, or starting over', () => {
    expect(playStep(-10, 1, [-180, 0], 4, 'bounce')).toEqual({ value: -6, direction: 1, turned: false });
    // Reaching an end it stands exactly there for a frame.
    expect(playStep(-2, 1, [-180, 0], 5, 'bounce')).toEqual({ value: 0, direction: 1, turned: true });
    expect(playStep(-178, -1, [-180, 0], 5, 'loop')).toEqual({ value: -180, direction: -1, turned: true });
    // From the end it turns round, or starts over at the other end.
    expect(playStep(0, 1, [-180, 0], 5, 'bounce')).toEqual({ value: -5, direction: -1, turned: false });
    expect(playStep(0, 1, [-180, 0], 5, 'loop')).toEqual({ value: -175, direction: 1, turned: false });
    // A value outside the range (the stops came while it played) is taken into it, never further out.
    expect(playStep(-100, 1, [-28, 0], 4, 'bounce')).toEqual({ value: -24, direction: 1, turned: false });
    expect(playStep(-100, -1, [-28, 0], 4, 'bounce')).toEqual({ value: -24, direction: 1, turned: false });
    // A frame after a long pause ends at the end, and a range of nothing stays put.
    expect(playStep(-90, 1, [-180, 0], 10_000, 'bounce')).toEqual({ value: 0, direction: 1, turned: true });
    expect(playStep(3, 1, [3, 3], 5, 'loop')).toEqual({ value: 3, direction: 1, turned: true });
  });

  it('keeps one order for joints that move the same bodies, whichever was taken last', () => {
    const [hinge, slide] = jointsOf(listing, components);
    if (!hinge || !slide) throw new Error('no joints');
    const same = { ...slide, bodies: hinge.bodies ?? [] };
    const a = jointPoses([hinge, same], [{ joint: hinge.id, index: 0, value: -90 }, { joint: same.id, index: 0, value: 12 }]);
    const b = jointPoses([hinge, same], [{ joint: same.id, index: 0, value: 12 }, { joint: hinge.id, index: 0, value: -90 }]);
    expect(a.get('Latch')).toEqual(b.get('Latch'));
  });
});

describe('a piece that stays behind when its body moves (practice run 2026-11-10)', () => {
  it('is told to the assistant as real, with the way to build it so it moves along', () => {
    const note = printCheckNote({
      status: 'warn',
      nozzle: 0.4,
      revision: 14,
      findings: [{ kind: 'feature', severity: 'warn', feature: 'Rastlippe vorn', message: "the joined piece doesn't touch `Deckel`, so `Deckel` is now in 2 separate pieces (New Body makes it a body of its own)" }],
    });
    expect(note).toContain('This is real: if the body moves with a joint, the piece was built from the design level and stays behind when the joint moves.');
    expect(note).toContain('component.activate');
  });
});
