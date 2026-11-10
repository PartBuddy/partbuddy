import { withMotion, type PrintCheck } from '@partbuddy/geometry';
import { describe, expect, it } from 'vitest';

import { printCheckNote } from '../src/main/print/printCheckNote';
import { jointMove, jointPoses, playStep, rotate } from '../src/renderer/src/viewer/jointPose';
import { sweepStopOf } from '../src/main/solidcraft/actions';

import { componentsWithBodies, jointsOf, libraryBodies, structureOf, withColours } from '../src/main/solidcraft/mirror';
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
    expect(libraryBodies(parts, metadata)).toEqual(['Screw FR', 'Bearing']);
    expect(componentsWithBodies(undefined)).toEqual([]);
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

  it('plays a joint through its range: back and forth, or starting over', () => {
    expect(playStep(-10, 1, [-180, 0], 4, 'bounce')).toEqual({ value: -6, direction: 1, turned: false });
    // Past the end it turns round by what was left over.
    expect(playStep(-2, 1, [-180, 0], 5, 'bounce')).toEqual({ value: -3, direction: -1, turned: true });
    expect(playStep(-178, -1, [-180, 0], 5, 'bounce')).toEqual({ value: -177, direction: 1, turned: true });
    expect(playStep(-2, 1, [-180, 0], 5, 'loop')).toEqual({ value: -177, direction: 1, turned: true });
    // A frame after a long pause never leaves the range, and a range of nothing stays put.
    const far = playStep(-90, 1, [-180, 0], 10_000, 'bounce').value;
    expect(far).toBeGreaterThanOrEqual(-180);
    expect(far).toBeLessThanOrEqual(0);
    expect(playStep(3, 1, [3, 3], 5, 'loop')).toEqual({ value: 3, direction: 1, turned: true });
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
