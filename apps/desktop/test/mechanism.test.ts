import { describe, expect, it } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { activated, closureTrial, MECHANISM_GUIDANCE, pegStock, screwStock, hingeOf, lineProblem, reach, skinProblem, latchOf, lidOf, lipOf, occurrenceOf, pegOf, railTravel, screwOf, slideOf, snapOf, withMechanismTool } from '../src/main/agents/mechanismTool';
import { decide } from '../src/main/agents/policy';
import { METADATA_PREFIX } from '../src/main/notes/noteRecord';
import { describeToolCall } from '../src/shared/stepPhrases';
import { barrelLeast, barrelWalls, hingeDiameter, hingeLies, hingeProblem, hingeSteps, pinBridge, webFoot, lidProblem, lidSkirt, lidSteps, lidThread, lipProblem, lipSteps, lipThick, TOGETHER_KEY, screwFit, screwLengths, screwSink, screwWindow, sinkMost, underHead, pegFloor, pegProblem, screwProblem, screwSteps, slideProblem, slideRoof, slideSteps, snapProblem, snapSteps, latchReach, latchSteps, LATCH, pegLength, pegSteps, PEG, SNAP, type HingeSpec, type LidSpec, type LipSpec, type ScrewSpec, type SlideSpec } from '../src/shared/mechanisms';

const spec: HingeSpec = { fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], diameter: 6, gap: 0.4, knuckles: 3, name: 'Hinge' };

/**
 * SolidCraft's answers to a hinge's trials, as 0.40.1 gives them, for a line at x `x` between two plates `distance` mm off
 * on either side (the fixed one towards -x): the rod on the line is near both, and the rods behind the knuckles' rooms lie
 * in their bodies, or, with `skin`, stand that far off the wall that ends before them. Undefined for any other step.
 */
function trial(step: { command: string; params: Record<string, unknown> }, { x = 42, distance = 2, skin }: { x?: number; distance?: number; skin?: { fixed?: number; moving?: number } } = {}): unknown {
  if (step.command !== 'inspect.clearance') return undefined;
  const [fixed, moving] = (step.params.against as string[] | undefined) ?? ['Base', 'Flap'];
  const bodies = step.params.bodies as string[];
  if (bodies[0] === 'PartBuddy probe') return { overlaps: [], near: [{ a: 'PartBuddy probe', b: fixed, distance_mm: distance - 0.05, from: [x - 0.05, 15, 3], to: [x - distance, 15, 3] }, { a: 'PartBuddy probe', b: moving, distance_mm: distance - 0.05, from: [x + 0.05, 15, 3], to: [x + distance, 15, 3] }] };
  if (!('clearance' in step.params)) return undefined;
  const of = (rod: string) => (rod.endsWith('fixed') ? 'fixed' : 'moving');
  return {
    overlaps: bodies.filter((rod) => skin?.[of(rod)] === undefined).map((rod) => ({ a: rod, b: of(rod) === 'fixed' ? fixed : moving, volume_mm3: 0.2 })),
    near: bodies.flatMap((rod) => (skin?.[of(rod)] === undefined ? [] : [{ a: rod, b: of(rod) === 'fixed' ? fixed : moving, distance_mm: skin[of(rod)] }])),
  };
}

describe('the print-in-place hinge (ADR 0027, G3)', () => {
  it('builds knuckles in turn, each clearing its room in the other body first, then bore and pin', () => {
    const all = hingeSteps(spec);
    const steps = all.filter((step) => step.command === 'solid.cylinder');
    // Lying, the bore gets a roof: flanks at 45° from the bore (radius 1.9 mm) and a flat 1.05 radii up, cut through the flap along the whole line.
    const roof = all.filter((step) => step.command !== 'solid.cylinder');
    expect(roof.map((step) => step.command)).toEqual(['sketch.create', 'sketch.line', 'solid.extrude', 'sketch.create', 'sketch.line', 'solid.extrude']);
    expect(roof[0]?.params.plane).toEqual({ origin: [42, -0.4, 3], x_dir: [-1, 0, 0], y_dir: [0, 0, 1] });
    expect(roof[1]?.params.points).toEqual([[-1.344, 1.344], [1.344, 1.344], [0.692, 1.995], [-0.692, 1.995]]);
    expect(roof[2]?.params).toMatchObject({ distance: '30.8 mm', operation: 'cut', targets: ['Flap'], name: 'Hinge △' });
    // Lying, the pin is flat underneath inside the flap's knuckle, where it has only the gap below it: cut off where it leans 45°
    // (1.061 mm under the axis of a 3 mm pin), from one of the base's knuckles to the other, 10.533 mm.
    expect(roof[3]?.params.plane).toEqual({ origin: [42, 9.733, 3], x_dir: [-1, 0, 0], y_dir: [0, 0, 1] });
    expect(roof[4]?.params.points).toEqual([[-1.5, -1.061], [1.5, -1.061], [1.5, -1.7], [-1.5, -1.7]]);
    expect(roof[5]?.params).toMatchObject({ distance: '10.533 mm', operation: 'cut', targets: ['Base'], name: 'Hinge 2 ▬' });
    expect(pinBridge(spec)).toBe(10.533);
    // Upright, a round bore prints as it is, and so does the pin.
    expect(hingeSteps({ ...spec, from: [0, 0, 0], to: [0, 0, 30] }).every((step) => step.command === 'solid.cylinder')).toBe(true);
    expect(steps.map((step) => [step.params.operation, (step.params.targets as string[])[0], step.params.diameter, step.params.height])).toEqual([
      // Room for the knuckles: a gap wider all round and a gap longer at both ends, past the ends of the hinge line too.
      ['cut', 'Flap', '6.8 mm', '10.533 mm'],
      ['cut', 'Base', '6.8 mm', '10.533 mm'],
      ['cut', 'Flap', '6.8 mm', '10.533 mm'],
      ['join', 'Base', '6 mm', '9.733 mm'],
      ['join', 'Flap', '6 mm', '9.733 mm'],
      ['join', 'Base', '6 mm', '9.733 mm'],
      ['cut', 'Flap', '3.8 mm', '30.8 mm'],
      ['join', 'Base', '3 mm', '30 mm'],
    ]);
    expect(steps.every((step) => JSON.stringify(step.params.axis) === '[0,1,0]')).toBe(true);
    // The middle knuckle starts a gap after the first one ends.
    expect(steps[4]?.params.base).toEqual([42, 10.133, 3]);
    // A body wider than the hinge must not lie against the outer knuckles: their room and the bore start a gap before the line.
    expect(steps[0]?.params.base).toEqual([42, -0.4, 3]);
    expect(steps[6]?.params.base).toEqual([42, -0.4, 3]);
  });

  it('says what is wrong before anything is built', () => {
    const five = { ...spec, knuckles: 5 };
    expect(hingeProblem(five)).toBeNull();
    expect(hingeProblem({ ...spec, moving: 'Base' })).toBe('fixed and moving must be two bodies');
    expect(hingeProblem({ ...spec, knuckles: 4 })).toBe('knuckles must be 3, 5, 7 or 9');
    expect(hingeProblem({ ...five, to: [42, 6, 3] })).toContain('use fewer knuckles or a longer hinge line');
    // Audit H-07, T41: level or straight up, one test for roof, flat and webs alike; a slant is refused, however slight.
    expect(hingeLies(five)).toBe('lying');
    expect(hingeLies({ from: [0, 0, 0], to: [0, 0, 30] })).toBe('standing');
    expect(hingeLies({ from: [0, 0, 3], to: [0, 30, 3.0000005] })).toBe('lying');
    expect(hingeLies({ from: [0, 0, 3], to: [0, 30, 3.00001] })).toBeNull();
    expect(hingeLies({ from: [0, 0, 0], to: [0.00001, 0, 30] })).toBeNull();
    expect(hingeProblem({ ...five, to: [42, 30, 3.01] })).toContain('the hinge line must be level (from and to at one height: the hinge prints lying) or straight up');
    expect(hingeProblem({ ...five, to: [52, 0, 33] })).toContain('A line at a slant gets no roof over its bore and no webs');
    expect(hingeSteps({ ...five, to: [42, 30, 3.00001] }).some((step) => step.command === 'sketch.create')).toBe(false);
    // Audit MV-03, W10: parts printed in place keep a nozzle and at least 0.3 mm apart (designFit.ts), and more than a layer.
    expect(hingeProblem({ ...five, gap: 0.39 })).toBe('gap must be 0.4–1 mm with a 0.4 mm nozzle: closer, parts printed in place fuse');
    expect(hingeProblem({ ...five, gap: 0.2 })).toContain('gap must be 0.4–1 mm');
    expect(hingeProblem({ ...five, diameter: 9, gap: 0.6 }, { nozzle: 0.6, layer: 0.2 })).toBeNull();
    expect(hingeProblem({ ...five, diameter: 9, gap: 0.59 }, { nozzle: 0.6, layer: 0.2 })).toBe('gap must be 0.6–1 mm with a 0.6 mm nozzle: closer, parts printed in place fuse');
    expect(hingeProblem({ ...five, diameter: 12, gap: 0.79 }, { nozzle: 0.8, layer: 0.2 })).toContain('gap must be 0.8–1 mm');
    expect(hingeProblem({ ...five, gap: 0.3 }, { nozzle: 0.25, layer: 0.12 })).toBeNull();
    expect(hingeProblem({ ...five, gap: 0.29 }, { nozzle: 0.25, layer: 0.12 })).toContain('gap must be 0.3–1 mm');
    expect(hingeProblem({ ...five, gap: 1.01 })).toContain('gap must be 0.4–1 mm');
    const standing: HingeSpec = { ...five, from: [42, 0, 0], to: [42, 0, 30] };
    expect(hingeProblem({ ...standing, gap: 0.4 }, { nozzle: 0.4, layer: 0.4 })).toBe('gap must be more than a layer (0.4 mm): the slicer closes a gap of one layer');
    expect(hingeProblem({ ...standing, gap: 0.4 }, { nozzle: 0.4, layer: 0.39 })).toBeNull();
    // Audit MV-04, T12, W6: two lines of the nozzle in use round the bore, lying also four layers; exactly at it passes (N-mechanik-16).
    expect(barrelLeast({ nozzle: 0.4, layer: 0.2 }, true)).toBe(0.9);
    expect(barrelLeast({ nozzle: 0.6, layer: 0.2 }, true)).toBe(1.35);
    expect(barrelLeast({ nozzle: 0.4, layer: 0.28 }, true)).toBe(1.12);
    expect(barrelLeast({ nozzle: 0.4, layer: 0.28 }, false)).toBe(0.9);
    expect(barrelWalls(6, 0.6, false)).toEqual({ wall: 0.9, roof: null });
    expect(hingeProblem({ ...standing, gap: 0.6 })).toBeNull();
    expect(hingeProblem({ ...standing, gap: 0.601 })).toBe('the barrel wall around the pin would be 0.899 mm, under the 0.9 mm that print solid (two lines of the 0.4 mm nozzle); use a diameter of at least 6.5 mm');
    expect(hingeProblem({ ...standing, diameter: 6.5, gap: 0.601 })).toBeNull();
    // The roof is thinnest at the edges of its flat: 0.924 mm on the standard barrel, not the 1.005 over its middle.
    expect(barrelWalls(6, 0.4, true)).toEqual({ wall: 1.1, roof: 0.924 });
    expect(hingeProblem({ ...five, gap: 0.6 }, { nozzle: 0.6, layer: 0.2 })).toBe('the barrel wall around the pin would be 0.9 mm, under the 1.35 mm that print solid (two lines of the 0.6 mm nozzle); use a diameter of at least 9 mm');
    expect(hingeProblem({ ...five, diameter: 8.5, gap: 0.6 }, { nozzle: 0.6, layer: 0.2 })).toBe("the barrel would be 1.271 mm thin over the bore's roof, under the 1.35 mm that print solid (two lines of the 0.6 mm nozzle); use a diameter of at least 9 mm");
    expect(hingeProblem({ ...five, diameter: 6.5, gap: 0.4 }, { nozzle: 0.4, layer: 0.28 })).toBe("the barrel would be 1.039 mm thin over the bore's roof, under the 1.12 mm that print solid (four layers of 0.28 mm); use a diameter of at least 7 mm");
    // Audit W5, R20: the advice is the smallest barrel that passes every check, never a gap under the nozzle (W4).
    expect(hingeProblem({ ...five, diameter: 4, gap: 0.4 })).toBe('the barrel wall around the pin would be 0.6 mm, under the 0.9 mm that print solid (two lines of the 0.4 mm nozzle); use a diameter of at least 6 mm');
    expect(hingeProblem({ ...five, diameter: 5.5, gap: 0.4 })).toContain('use a diameter of at least 6 mm');
    for (const [nozzle, gap] of [[0.2, 0.3], [0.25, 0.3], [0.4, 0.4], [0.5, 0.5], [0.6, 0.6], [0.8, 0.8], [0.8, 1]] as const) {
      for (const lies of [true, false]) {
        const printer = { nozzle, layer: 0.2 };
        const least = hingeDiameter(gap, lies, printer);
        const at = lies ? five : standing;
        expect(least).not.toBeNull();
        expect(hingeProblem({ ...at, diameter: least ?? 0, gap }, printer)).toBeNull();
        if ((least ?? 0) > 4) expect(hingeProblem({ ...at, diameter: (least ?? 0) - 0.5, gap }, printer)).toContain(`use a diameter of at least ${String(least)} mm`);
      }
    }
    expect([hingeDiameter(0.4, true), hingeDiameter(0.6, true, { nozzle: 0.6, layer: 0.2 }), hingeDiameter(0.8, true, { nozzle: 0.8, layer: 0.2 }), hingeDiameter(0.4, false)]).toEqual([6, 9, 12, 5.5]);
    // Audit W11, N-passung-texte-3: lying, the pin bridges each knuckle of the moving body, at most 10 mm; past nine knuckles, two hinges.
    expect(hingeProblem(spec)).toBe('with 3 knuckles the pin would bridge 10.533 mm inside each knuckle of Flap, more than prints clean (10 mm); use 5 knuckles');
    expect(hingeProblem({ ...spec, to: [42, 86, 3], knuckles: 9 })).toBeNull();
    expect(hingeProblem({ ...spec, to: [42, 86.1, 3], knuckles: 9 })).toBe('with 9 knuckles the pin would bridge 10.011 mm inside each knuckle of Flap, more than prints clean (10 mm); the line is longer than one hinge prints clean: build two or more hinges on the same line, each at most 86 mm long, which turn about one joint');
    expect(hingeProblem({ ...standing, to: [42, 0, 200], knuckles: 9 })).toBeNull();
  });

  it('fills in the gap from the nozzle, the barrel from both, and the knuckles from the length', () => {
    const args = { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [0, 0, 3], to: [0, 60, 3] };
    // 60 mm of line: seven knuckles, so none is longer than 10 mm.
    expect(hingeOf(args, 0.4)).toMatchObject({ diameter: 6, gap: 0.4, knuckles: 7, name: 'Hinge' });
    // 30 mm of line: three knuckles would have the pin bridge 10.5 mm inside the middle one (9.7 mm and a gap on each side), so five.
    expect(hingeOf({ ...args, to: [0, 30, 3] }, 0.4)).toMatchObject({ knuckles: 5 });
    expect(hingeOf({ ...args, to: [0, 28, 3] }, 0.4)).toMatchObject({ knuckles: 3 });
    // Upright, the pin stands and bridges nothing: three knuckles of 9.7 mm, nine on a long line.
    expect(hingeOf({ ...args, to: [0, 0, 33] }, 0.4)).toMatchObject({ knuckles: 3 });
    expect(hingeOf({ ...args, to: [0, 0, 200] }, 0.4)).toMatchObject({ knuckles: 9 });
    expect(hingeOf({ ...args, to: [0, 200, 3] }, 0.4)).toContain('build two or more hinges on the same line, each at most 86 mm long');
    expect(hingeOf(args, 0.2)).toMatchObject({ gap: 0.3, diameter: 6 });
    // Audit N-passung-texte-2, W4, T12: with nothing but the line given, the hinge builds on every nozzle.
    expect([0.2, 0.25, 0.4, 0.5, 0.6, 0.8].map((nozzle) => { const made = hingeOf(args, nozzle); return typeof made === 'string' ? made : [made.gap, made.diameter]; })).toEqual([[0.3, 6], [0.3, 6], [0.4, 6], [0.5, 7.5], [0.6, 9], [0.8, 12]]);
    expect(hingeOf({ ...args, to: [0, 0, 33] }, 0.8)).toMatchObject({ gap: 0.8, diameter: 10.5 });
    expect(hingeOf(args, 0.4, 0.28)).toMatchObject({ diameter: 7 });
    // A gap given to the micrometre and more is laid out in whole micrometres, up.
    expect(hingeOf({ ...args, gap: 0.4444 }, 0.4)).toMatchObject({ gap: 0.445 });
    expect(hingeOf({ ...args, to: [0, 0, 3] }, 0.4)).toBe('from and to must be two points');
    expect(hingeOf({ ...args, fixed: '' }, 0.4)).toBe('fixed, moving, from and to are needed');
  });

  // Audit N-mechanik-15, T40: rounded each on its own, a gap of 0.2 came out 0.199 mm; a slanted direction rounded to
  // 0.001 put the last knuckles of a 200 mm hinge 0.1 mm off.
  it('lays knuckles and gaps out exactly, also along a line askew to the axes', () => {
    const along = (steps: ReturnType<typeof hingeSteps>, axis: number[], from: number[]) =>
      steps.filter((step) => step.command === 'solid.cylinder' && step.params.operation === 'join' && String(step.params.name).match(/ \d$/)).map((step) => {
        const start = (step.params.base as number[]).reduce((sum, value, i) => sum + (value - (from[i] ?? 0)) * (axis[i] ?? 0), 0);
        return [start, start + Number.parseFloat(String(step.params.height))];
      });
    const gaps = (spans: number[][]) => spans.slice(1).map(([start], i) => (start ?? 0) - (spans[i]?.[1] ?? 0));
    const straight = along(hingeSteps({ ...spec, from: [0.123, 0, 3], to: [0.123, 31.7, 3], knuckles: 7, gap: 0.3 }), [0, 1, 0], [0.123, 0, 3]);
    expect(gaps(straight).every((gap) => gap >= 0.3 - 1e-9 && gap <= 0.3 + 1e-9)).toBe(true);
    const length = 86;
    const unit = [1, 0.3337, 0].map((value) => value / Math.hypot(1, 0.3337));
    const askew = { ...spec, from: [10, 20, 3] as [number, number, number], to: [10 + (unit[0] ?? 0) * length, 20 + (unit[1] ?? 0) * length, 3] as [number, number, number], knuckles: 9, gap: 0.3 };
    const spans = along(hingeSteps(askew), unit, askew.from);
    expect(gaps(spans).every((gap) => gap > 0.3 - 2e-6)).toBe(true);
    // The last knuckle ends on the line, at most 9 µm before `to`.
    expect(length - (spans.at(-1)?.[1] ?? 0)).toBeGreaterThanOrEqual(-1e-6);
    expect(length - (spans.at(-1)?.[1] ?? 0)).toBeLessThan(0.01);
    const last = hingeSteps(askew).filter((step) => step.command === 'solid.cylinder' && step.params.operation === 'join').at(-2)?.params.base as number[];
    const back = last.map((value, i) => value - (askew.from[i] ?? 0));
    const off = Math.hypot(...back.map((value, i) => value - (unit[i] ?? 0) * back.reduce((sum, v, k) => sum + v * (unit[k] ?? 0), 0)));
    expect(off).toBeLessThan(2e-6);
  });

  // Audit W12: `Math.trunc(stopped / 0.1) * 0.1` made 0.2 of 0.3 and 12.200000000000001 of 12.2.
  it('cuts a sweep\'s stop to whole steps towards zero, without float noise', () => {
    expect([0.3, 5.1, 33.3, 12.2, 12.25, -5.15, -0.05].map((stopped) => reach({ stopped_at: stopped }, 99, 0.1))).toEqual([0.3, 5.1, 33.3, 12.2, 12.2, -5.1, 0]);
    expect(Object.is(reach({ stopped_at: -0.05 }, 99, 0.1), 0)).toBe(true);
    expect([67.375, -145.789, 180].map((stopped) => reach({ stopped_at: stopped }, 0, 1))).toEqual([67, -145, 180]);
    expect(reach({}, 42, 0.1)).toBe(42);
  });

  // Audit W8, W9: the reach of the line was a sentence of the description, and a line inside a wall read as out of reach.
  it('measures where the line lies before it builds: each knuckle overlaps its body by half a millimetre', () => {
    const where = 'Put the hinge line within 2.5 mm of both bodies.';
    const near = (distance: number) => ({ inside: false, distance, toward: [-1, 0, 0] as [number, number, number] });
    expect(lineProblem({ fixed: near(2.5), moving: near(2) }, spec, where)).toBeNull();
    expect(lineProblem({ fixed: near(2.501), moving: near(2) }, spec, where)).toBe('the hinge line lies 2.501 mm from Base, so the barrel overlaps it by 0.499 mm, under 0.5 mm: its knuckles would hang on a sliver. Put the hinge line within 2.5 mm of both bodies.');
    expect(lineProblem({ fixed: near(2), moving: near(2.9) }, spec, where)).toContain('lies 2.9 mm from Flap, so the barrel overlaps it by 0.1 mm');
    expect(lineProblem({ fixed: near(3), moving: near(2) }, spec, where)).toBe("the hinge line lies 3 mm from Base, outside the barrel's radius of 3 mm, so its knuckles would not touch it. Put the hinge line within 2.5 mm of both bodies.");
    expect(lineProblem({ fixed: near(2), moving: null }, spec, where)).toBe('Flap is further from the hinge line than the barrel is wide (6 mm), so its knuckles would not touch it. Put the hinge line within 2.5 mm of both bodies.');
    expect(lineProblem({ fixed: { inside: true, distance: 0, toward: null }, moving: near(2) }, spec, where)).toBeNull();
    expect(lineProblem({ fixed: { inside: true, distance: 0, toward: null }, moving: { inside: true, distance: 0, toward: null } }, spec, where)).toContain('the hinge line runs inside both Base and Flap');
  });

  it('says what skin a room would leave, measured, and how to change it', () => {
    expect(skinProblem({ fixed: null, moving: null }, { fixed: 'Box', moving: 'Lid' }, 0.4)).toBeNull();
    expect(skinProblem({ fixed: null, moving: { mm: 0.8, least: 0.9, floor: false } }, { fixed: 'Box', moving: 'Lid' }, 0.4)).toBe(
      "the rooms of the knuckles would leave a skin of 0.8 mm of Lid's wall behind them, under two lines of the 0.4 mm nozzle (0.9 mm). Move the line 0.1 mm back from that wall, or 0.8 mm towards it so the rooms open through it, or make the wall 0.1 mm thicker. Nothing was built.",
    );
    expect(skinProblem({ fixed: { mm: 0.5, least: 0.8, floor: true }, moving: null }, { fixed: 'Box', moving: 'Lid' }, 0.4)).toContain('a skin of 0.5 mm of Box\'s wall behind them, under the 0.8 mm a floor needs to print closed. Move the line 0.3 mm back');
  });

  it('finds the occurrence of a body once it is a component', () => {
    const listing = {
      components: [
        { id: 0, parent: null, bodies: ['Flap'], occurrences: [] },
        { id: 3, parent: 0, bodies: ['Base'], occurrences: [{ id: 4, name: 'Base:1' }] },
      ],
    };
    expect(occurrenceOf(listing, 'Base')).toBe('Base:1');
    expect(occurrenceOf(listing, 'Flap')).toBeNull();
  });

  it('builds, makes components, joins, sweeps and sets the limits clear of the contact', async () => {
    const batches: { command: string; params: Record<string, unknown> }[][] = [];
    let components = false;
    const answer = (step: { command: string; params: Record<string, unknown> }): unknown => {
      switch (step.command) {
        case 'document.inspect':
          return { bodies: [{ name: 'Base' }, { name: 'Flap' }] };
        case 'inspect.interference':
          return { count: 0, interferences: [] };
        case 'component.from_bodies':
          components = true;
          return {};
        case 'component.list':
          return { components: components ? [{ id: 3, parent: 0, bodies: ['Base'], occurrences: [{ name: 'Base:1' }] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ name: 'Flap:1' }] }] : [{ id: 0, parent: null, bodies: ['Base', 'Flap'] }] };
        case 'joint.sweep':
          return step.params.to === 180 ? { stopped_at: 67.375, stopped_by: { a: 'Flap:1', b: 'Base:1', at: [40, 0, 0] } } : { stopped_at: -145.789, stopped_by: { a: 'Flap:1', b: 'Base:1', at: [38, 0, 4] } };
        default:
          return trial(step) ?? {};
      }
    };
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }] }) }] });
        const commands = args.commands as { command: string; params: Record<string, unknown> }[];
        batches.push(commands);
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map(answer) }) }] });
      },
    };
    const tools = withMechanismTool(upstream, () => 0.4);
    expect((await tools.listTools()).map((tool) => tool.name)).toEqual(['partbuddy_mechanism']);
    const built = await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], name: 'Lid hinge' });
    expect(built.isError).toBeUndefined();
    expect(built.content[0]).toMatchObject({
      text: expect.stringContaining('Built the hinge "Lid hinge" between Base (stays) and Flap (turns): 5 knuckles, barrel 6 mm, pin 3 mm, gap 0.4 mm everywhere. It turns from -145° to 67° before the bodies meet') as string,
    });
    expect(batches.map((batch) => batch.map((step) => step.command).join(' '))).toEqual([
      'component.list joint.list',
      // Where the line lies, measured on trial with a rod that is taken back.
      'solid.cylinder inspect.clearance inspect.measure sketch.inspect',
      // Audit W7, R11: the walls behind the knuckles' rooms, measured on trial with a rod behind each.
      'solid.cylinder solid.cylinder inspect.clearance sketch.inspect',
      // The design as it is, to come back to should a later step fail.
      'document.inspect joint.list',
      [...Array.from({ length: 11 }, () => 'solid.cylinder'), 'sketch.create', 'sketch.line', 'solid.extrude', 'solid.cylinder', ...Array.from({ length: 2 }, () => ['sketch.create', 'sketch.line', 'solid.extrude']).flat()].join(' '),
      'inspect.interference',
      'component.list',
      'component.from_bodies component.list',
      'joint.as_built component.metadata.set component.metadata.set',
      'joint.sweep joint.sweep',
      'joint.limits',
    ]);
    // The rods behind the rooms lie two lines (0.9 mm) past the room of 3.4 mm about the line, each the way to its body.
    expect(batches[2]?.slice(0, 2).map((step) => step.params.base)).toEqual([[37.65, 0, 3], [46.35, 0, 3]]);
    expect(String(built.content[0]?.text)).toContain(" The knuckles' rooms go 1.4 mm into Base and 1.4 mm into Flap, measured from the face nearest the line, and PartBuddy measured the walls behind them: each room opens through its wall or leaves at least 0.9 mm of Base and 0.9 mm of Flap.");
    expect(batches[8]?.[0]?.params).toMatchObject({ type: 'revolute', a: 'Base:1', b: 'Flap:1', at: { occurrence: 'Base:1', point: [42, 15, 3], z: [0, 30, 0] }, name: 'Lid hinge' });
    // Audit 2026-11-12, G1: the hinge prints in place, so both components carry one mark (a label of their own) that the
    // print check and the plate view stand them on one bed by.
    const [base, flap] = [batches[8]?.[1]?.params, batches[8]?.[2]?.params] as { component: number; values: Record<string, unknown> }[];
    expect([base?.component, flap?.component]).toEqual([3, 5]);
    expect(Object.keys(base?.values ?? {})).toEqual(Object.keys(flap?.values ?? {}));
    expect(Object.entries(base?.values ?? {})).toEqual([[expect.stringMatching(/^io.github.manuelstaggl.partbuddy.together.[0-9a-f]{8}$/), { joint: 'Lid hinge' }]]);
    expect(TOGETHER_KEY.startsWith(METADATA_PREFIX)).toBe(true);
    expect(batches[10]?.[0]?.params).toEqual({ joint: 'Lid hinge', min: -145, max: 67 });

    // Webs: with the line 16 mm above the bed and 2.5 mm from either wall, every knuckle gets a profile from where the barrel leans
    // 45° on the far side (2.121 mm from the axis) at 45° down to its own wall, 0.5 mm into it; on the bed (the line a radius above it) none is needed.
    const sides = { fixed: { toward: [-1, 0, 0] as [number, number, number], distance: 2.5 }, moving: { toward: [1, 0, 0] as [number, number, number], distance: 2.5 } };
    const hung = hingeSteps({ ...spec, from: [42, 0, 16], to: [42, 30, 16], support: { bed: 0, ...sides } });
    const webs = hung.filter((step) => String(step.params.name).endsWith('◣'));
    expect(webs.map((step) => step.command)).toEqual(Array.from({ length: 3 }, () => ['sketch.create', 'solid.extrude']).flat());
    const profiles = hung.filter((step) => step.command === 'sketch.line' && (step.params.points as number[][]).length === 5);
    expect(profiles).toHaveLength(3);
    expect(profiles[0]?.params.points).toEqual([[-2.121, 0], [-2.121, -2.121], [2.5, -6.743], [3, -6.743], [3, 0]]);
    expect(webFoot(6, 2.5)).toBe(6.743);
    // Audit 2026-11-12, N-mechanik-4: a web that ended a gap before the other body left the far half of each barrel hanging
    // (90 mm² of overhang at 6 mm, 619 mm² at 40 mm). It now passes under the whole barrel, and the other body is cut back
    // for it by the same profile a gap further out, up to a gap before the knuckle's own wall and as long as the knuckle's room.
    const rooms = hung.filter((step) => String(step.params.name).endsWith('◤'));
    expect(rooms.filter((step) => step.command === 'solid.extrude').map((step) => [step.params.operation, (step.params.targets as string[])[0], step.params.distance])).toEqual([['cut', 'Flap', '10.533 mm'], ['cut', 'Base', '10.533 mm'], ['cut', 'Flap', '10.533 mm']]);
    expect(hung[hung.findIndex((step) => step.params.name === 'Hinge 1 ◤') + 1]?.params.points).toEqual([[-2.404, 0], [-2.404, -2.404], [2.1, -6.908], [2.1, 0]]);
    expect(hung.findIndex((step) => step.params.name === 'Hinge 1 ◤')).toBeLessThan(hung.findIndex((step) => step.params.name === 'Hinge 1 ◣'));
    // N-mechanik-5: a body whose wall does not reach down to the web's foot is left out of `support`, and gets neither web nor room for one.
    const half = hingeSteps({ ...spec, from: [42, 0, 16], to: [42, 30, 16], support: { bed: 0, fixed: sides.fixed } });
    expect(half.filter((step) => step.command === 'solid.extrude' && /[◣◤]$/.test(String(step.params.name))).map((step) => step.params.name)).toEqual(['Hinge 1 ◤', 'Hinge 1 ◣', 'Hinge 3 ◤', 'Hinge 3 ◣']);
    expect(webs.filter((step) => step.command === 'solid.extrude').map((step) => (step.params.targets as string[])[0])).toEqual(['Base', 'Flap', 'Base']);
    // The fixed body lies towards -x: its profile is drawn from the far end of the knuckle, so it is extruded back along the line.
    expect(webs[0]?.params.plane).toMatchObject({ x_dir: [-1, 0, 0], y_dir: [0, 0, 1] });
    // The webs come before the bore, which goes through those of the flap.
    expect(hung.findIndex((step) => step.params.name === 'Hinge ○')).toBeGreaterThan(hung.findIndex((step) => step.params.name === 'Hinge 2 ◣'));
    // Near the bed the web ends on it instead of going below.
    expect(hingeSteps({ ...spec, from: [42, 0, 6], to: [42, 30, 6], support: { bed: 0, ...sides } }).find((step) => step.command === 'sketch.line' && (step.params.points as number[][]).length === 5)?.params.points).toEqual([[-2.121, 0], [-2.121, -2.121], [1.757, -6], [3, -6], [3, 0]]);
    expect(hingeSteps({ ...spec, support: { bed: 0, ...sides } }).some((step) => String(step.params.name).endsWith('◣'))).toBe(false);
    // A body that does not exist is named with the ones that do; nothing is built.
    const before = batches.length;
    const missing = await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Lid', from: [42, 0, 3], to: [42, 30, 3] });
    expect(missing).toMatchObject({ isError: true, content: [{ text: 'Not built: no body "Lid"; the bodies are "Base", "Flap"' }] });
    expect(batches).toHaveLength(before);
  });

  it('takes everything back when a knuckle does not touch its body, and says where the line goes', async () => {
    const calls: string[] = [];
    let depth = 3;
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        calls.push(name);
        // Before: three steps to undo. Of the cylinders the seven knuckles (48 mm of hinge line) do not touch their body, as SolidCraft 0.40.0-rc.3 warns.
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Box' }, { name: 'Lid' }], undo: 3 }) }] });
        const commands = args.commands as { command: string; params: { operation?: string; diameter?: string } }[];
        calls.push(...commands.filter((step) => step.command === 'edit.undo' || step.command === 'component.activate').map((step) => step.command));
        if (commands.some((step) => step.params.operation === 'join')) depth = 11;
        depth -= commands.filter((step) => step.command === 'edit.undo').length;
        const results = commands.map((step) =>
          step.command === 'document.inspect'
            ? { bodies: ['Box', 'Lid'], timeline: Array.from({ length: depth }, (_, i) => ({ id: i + 1 })), undo: depth }
            : step.command === 'inspect.clearance'
              ? trial(step, { x: 0 })
            : step.params.operation === 'join' && step.params.diameter === '6 mm'
              ? { warning: "the joined piece doesn't touch `Box`, so `Box` is now in 2 separate pieces (New Body makes it a body of its own)" }
              : { count: 0, warning: null },
        );
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Box', moving: 'Lid', from: [0, 43.4, 3], to: [48, 43.4, 3] });
    expect(built.isError).toBe(true);
    expect(built.content[0]).toMatchObject({
      text: 'Not built: 7 piece(s) did not touch their body and stand apart from it. Put the hinge line within 2.5 mm of both bodies (the barrel is 6 mm, so it must overlap each by at least 0.5 mm). ' +
        "PartBuddy cuts each knuckle's room in the other body itself. Everything was taken back.",
    });
    // Every step SolidCraft counted since (11 − 3) is undone in one batch, the design level is made active again, and no joint was made.
    expect(calls.filter((call) => call !== 'batch')).toEqual(['inspect_design', ...Array.from({ length: 8 }, () => 'edit.undo'), 'component.activate']);
    expect(depth).toBe(3);
  });

  // Audit 2026-11-12, H-02: the joint was refused after the knuckles were built, the answer said "Not built" with
  // SolidCraft's JSON, and the knuckles stayed (2 → 11 features; the next call built them again).
  it('takes the knuckles back when the joint cannot be made, and passes on SolidCraft\'s reason in one sentence', async () => {
    const refused = { applied: [], completed: 0, failed: { command: 'joint.as_built', error: 'invalid parameters for `joint.create`: a joint needs two different occurrences', index: 0 }, results: [] };
    const tools = (readable: boolean) => {
      const sent: string[] = [];
      let depth = 2;
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (name, args) => {
          if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }] }) }] });
          const commands = args.commands as { command: string; params: { operation?: string } }[];
          sent.push(commands.map((step) => step.command).join(' '));
          // As SolidCraft 0.40.1 answers a batch whose step fails: marked as an error, the reason inside its JSON.
          if (commands[0]?.command === 'joint.as_built') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(refused, null, 2) }], isError: true });
          // The probe's batch fails on purpose and SolidCraft rolls it back.
          if (!commands.some((step) => step.command === 'sketch.inspect')) depth += commands.filter((step) => step.params.operation !== undefined).length - commands.filter((step) => step.command === 'edit.undo').length;
          const results = commands.map((step) => (step.command === 'document.inspect' ? (readable ? { timeline: Array.from({ length: depth }, (_, i) => ({ id: i + 1 })), undo: depth } : {}) : step.command === 'component.list' ? { components: [{ id: 3, parent: 0, bodies: ['Base', 'Flap'], occurrences: [{ id: 4, name: 'Both:1' }] }] } : (trial(step) ?? {})));
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
        },
      };
      return { sent, depth: () => depth, call: () => withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 28, 3], knuckles: 3 }) };
    };
    const taken = tools(true);
    expect(await taken.call()).toEqual({ isError: true, content: [{ type: 'text', text: 'Not built: SolidCraft refused joint.as_built: invalid parameters for `joint.create`: a joint needs two different occurrences. Everything was taken back.' }] });
    expect(taken.sent.slice(-2)).toEqual([`${Array.from({ length: 10 }, () => 'edit.undo').join(' ')} document.inspect joint.list`, 'component.activate']);
    expect(taken.depth()).toBe(2);
    // A second call starts from the same design: it does not build on top of the first.
    await taken.call();
    expect(taken.depth()).toBe(2);
    // Where SolidCraft does not say what the design consists of nothing is taken back, and the answer says so instead of "as it was".
    const stuck = tools(false);
    expect((await stuck.call()).content[0]).toMatchObject({ text: expect.stringMatching(/^Not built: SolidCraft refused joint\.as_built: .* What was built could NOT be taken back and is all still there: undo it before you call again\.$/) as string });
    expect(stuck.sent.join(' ')).not.toContain('edit.undo');
  });

  // Audit 2026-11-12, N-mechanik-3: a second hinge with the default name answered with the first joint's limits and
  // had none itself; the same call again built a third joint between the same two parts.
  it('names a second hinge apart from the first, and refuses a second one between the same two bodies before it builds', async () => {
    const batches: { command: string; params: Record<string, unknown> }[][] = [];
    let stuck = false;
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }, { name: 'Flap2' }], undo: 12 }) }] });
        const commands = args.commands as { command: string; params: Record<string, unknown> }[];
        batches.push(commands);
        if (stuck && commands.some((step) => step.command === 'joint.sweep')) return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: [], failed: { command: 'joint.sweep', error: 'motion exceeds contact sweep collision budget' } }) }] });
        const results = commands.map((step) => {
          // As SolidCraft 0.40.1 lists them: a joint's sides by the ids of their occurrences.
          if (step.command === 'joint.list') return { joints: [{ name: 'Hinge', type: 'revolute', a: 15, b: 17, frame_a: { origin: [42, 15, 3], z: [0, 1, 0] }, values: [{ value: 0, limits: [-145, 67] }] }] };
          if (step.command === 'component.list') return { components: [{ id: 14, parent: 0, bodies: ['Base'], occurrences: [{ id: 15, name: 'Base:1' }] }, { id: 16, parent: 0, bodies: ['Flap'], occurrences: [{ id: 17, name: 'Flap:1' }] }, { id: 31, parent: 0, bodies: ['Flap2'], occurrences: [{ id: 32, name: 'Flap2:1' }] }] };
          // As SolidCraft 0.40.1 answers: the first hinge's pin from y 0 to 30, and that of a second one, which has no joint, from 40 to 70.
          if (step.command === 'document.inspect') return { timeline: [{ id: 9, name: 'Hinge ●', type: 'CylinderFeature' }, { id: 30, name: 'Hinge (2) ●', type: 'CylinderFeature' }], undo: 12 };
          if (step.command === 'timeline.inspect') return { definition: { axis: [0, 1, 0], base: [42, step.params.feature === 9 ? 0 : 40, 3], height: '30 mm', operation: 'join', participants: ['Base'], radius: '(3 mm) / 2' }, suppressed: false };
          return step.command === 'joint.sweep' ? { stopped_at: Number(step.params.to) > 0 ? 67.4 : -145.8 } : (trial(step) ?? {});
        });
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
      },
    };
    const tools = withMechanismTool(upstream, () => 0.4);
    const again = await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Flap', moving: 'Base', from: [42, 40, 3.5], to: [42, 70, 3.5], name: 'Another' });
    // Half a millimetre off the first hinge's line it is a second axis, which would bind the first.
    expect(again).toEqual({ isError: true, content: [{ type: 'text', text: 'Not built: the joint "Hinge" already joins Flap and Base as a hinge on another line, and a second axis between the same two bodies would bind it. Put this hinge on the line of the first, or change the first: take it back with undo, or delete its features and its joint, then call again.' }] });
    expect(batches.map((batch) => batch.map((step) => step.command).join(' '))).toEqual(['component.list joint.list']);
    // Review 2 of PR #358: on the first hinge's own stretch (the joint lies in its middle, y 15) it is the first hinge called again,
    // with seven knuckles for five: they would be cut into the old ones (H-02). Refused before anything is built.
    const over = await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], knuckles: 7 });
    expect(over).toEqual({ isError: true, content: [{ type: 'text', text: 'Not built: the hinge "Hinge" already joins Base and Flap on this stretch of the line, and new knuckles would be cut into its own. Change that one instead: take it back with undo, or delete its features and its joint, then call again. A second hinge goes on the same line beside the first.' }] });
    expect(batches).toHaveLength(2);
    // Review 3 of PR #358: half over the first (y 16 to 46 holds no joint's point), and over the second, which has no joint:
    // both are known by their pins, and nothing is built. Beside both (y 90 to 120, below) it is built.
    const refusal = async (from: number, to: number) => String((await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, from, 3], to: [42, to, 3] })).content[0]?.text);
    expect(await refusal(16, 46)).toContain('Not built: the hinge "Hinge" already joins Base and Flap on this stretch of the line');
    expect(await refusal(60, 90)).toContain('Not built: the hinge "Hinge (2)" already joins Base and Flap on this stretch of the line');
    expect(batches.slice(2).map((batch) => batch.map((step) => step.command).join(' '))).toEqual(['component.list joint.list', 'document.inspect', 'timeline.inspect timeline.inspect', 'component.list joint.list', 'document.inspect', 'timeline.inspect timeline.inspect']);
    // Review of PR #358: on the line of the first it is the usual second hinge of a long flap. It gets its knuckles and no joint of
    // its own: the first joint is run through its limits again, since more knuckles can only narrow them.
    const before = batches.length;
    const coaxial = await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 90, 3], to: [42, 120, 3] });
    expect(coaxial.isError).toBeUndefined();
    expect(String(coaxial.content[0]?.text)).toContain('Built the hinge "Hinge (2)" between Base (stays) and Flap (turns): 5 knuckles, barrel 6 mm, pin 3 mm, gap 0.4 mm everywhere. It turns from -145° to 67°');
    expect(String(coaxial.content[0]?.text)).toContain(' It lies on the line of the hinge "Hinge" and turns about that hinge\'s joint, which carries both now.');
    const shared = batches.slice(before).flat();
    expect(shared.some((step) => step.command === 'joint.as_built')).toBe(false);
    expect(shared.filter((step) => step.command === 'joint.sweep').map((step) => [step.params.joint, step.params.to])).toEqual([['Hinge', -145], ['Hinge', 67]]);
    expect(shared.find((step) => step.command === 'joint.limits')?.params).toEqual({ joint: 'Hinge', min: -145, max: 67 });
    // When that sweep cannot be run, the first hinge's limits are still set: the answer does not say there are none.
    stuck = true;
    const unrun = String((await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 130, 3], to: [42, 160, 3] })).content[0]?.text);
    expect(unrun).toContain('so the limits of "Hinge" stay as they were, untried with this hinge.');
    expect(unrun).not.toContain('no limits are set');
    stuck = false;
    // Another pair of bodies: built, under a name of its own, which the joint, its sweeps and its limits all carry.
    const second = await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap2', from: [-2, 0, 3], to: [-2, 30, 3] });
    expect(second.isError).toBeUndefined();
    expect(second.content[0]).toMatchObject({ text: expect.stringContaining('Built the hinge "Hinge (2)" between Base (stays) and Flap2 (turns)') as string });
    const sent = batches.flat();
    expect(sent.filter((step) => step.command === 'joint.as_built').map((step) => step.params)).toMatchObject([{ a: 'Base:1', b: 'Flap2:1', name: 'Hinge (2)' }]);
    expect(sent.filter((step) => step.command === 'joint.sweep' || step.command === 'joint.limits').map((step) => step.params.joint).slice(-3)).toEqual(['Hinge (2)', 'Hinge (2)', 'Hinge (2)']);
    // A guide between the two bodies of the hinge is another kind of joint: it is not refused for the hinge.
    const guide = await tools.callTool('partbuddy_mechanism', { kind: 'slide', fixed: 'Base', moving: 'Flap', from: [0, 15, 4], to: [40, 15, 4] });
    expect(guide.content[0]).toMatchObject({ text: expect.not.stringContaining('already joins') as string });
  });

  // Audit 2026-11-12, N-mechanik-4 and -5: "stand on webs …, so they print without support" stood over 90 to 619 mm² of
  // overhang the print check still found, and over a web that hung 4.6 mm under a lid plate with no wall below it.
  it('gives a web only to a body whose wall reaches the web\'s foot, and says what prints without support only where it holds', async () => {
    // Two blocks 16 mm high, 5 mm apart, the line on their rims: the rod on the line is 2.45 mm from either wall.
    const answer = async (walls: string[] | null, args: Record<string, unknown> = {}, overhang = 45) => {
      const sent: { command: string; params: Record<string, unknown> }[] = [];
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (name, call) => {
          if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: 2 }) }] });
          const commands = call.commands as { command: string; params: Record<string, unknown> }[];
          sent.push(...commands);
          const rods = commands.filter((step) => step.command === 'solid.cylinder' && String(step.params.body_name).startsWith('PartBuddy probe '));
          const results = commands.map((step) => {
            if (step.command === 'inspect.measure') return { bodies: [{ bbox: { min: [0, 0, 0] } }, { bbox: { min: [45, 0, 0] } }] };
            if (step.command === 'component.list') return { components: [{ id: 3, parent: 0, bodies: ['Base'], occurrences: [{ id: 4, name: 'Base:1' }] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ id: 6, name: 'Flap:1' }] }] };
            if (step.command !== 'inspect.clearance') return {};
            // The second trial: each rod lies in its body where that body has a wall under the web's foot (a rod 0.2 mm thick and 30 mm long is 0.942 mm³).
            // Without walls (null) SolidCraft gives no answer to it. The rods behind the knuckles' rooms lie in their blocks.
            if (rods.length > 0 && 'clearance' in step.params) return trial(step);
            if (rods.length > 0 && walls === null) return {};
            if (rods.length > 0 && walls) return { overlaps: rods.flatMap((rod) => (walls.some((body) => String(rod.params.body_name).endsWith(body === 'Base' ? 'fixed' : 'moving')) ? [{ a: rod.params.body_name, b: String(rod.params.body_name).endsWith('fixed') ? 'Base' : 'Flap', volume_mm3: 0.94 }] : [])), near: [] };
            return { overlaps: [], near: [{ a: 'PartBuddy probe', b: 'Base', distance_mm: 2.45, from: [42.5, 15, 16], to: [40, 15, 16] }, { a: 'PartBuddy probe', b: 'Flap', distance_mm: 2.45, from: [42.5, 15, 16], to: [45, 15, 16] }] };
          });
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
        },
      };
      const built = await withMechanismTool(upstream, () => 0.4, undefined, () => overhang).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42.5, 0, 16], to: [42.5, 30, 16], ...args });
      return { text: String(built.content[0]?.text), sent, webs: sent.filter((step) => step.command === 'solid.extrude' && String(step.params.name).endsWith('◣')).map((step) => (step.params.targets as string[])[0]) };
    };
    const both = await answer(['Base', 'Flap']);
    expect(both.webs).toEqual(['Base', 'Flap', 'Base', 'Flap', 'Base']);
    expect(both.text).toContain(' All 5 knuckles start above the bed and stand on webs at 45° that run from under the barrel down to their own wall, and the pin is flat underneath where it bridges from knuckle to knuckle, so the hinge prints as it stands, without support. ');
    // Each rod lies 0.25 mm inside its wall and 0.2 mm under the web's foot, 6.743 mm below the line: at z = 9.057.
    const rods = both.sent.filter((step) => String(step.params.body_name).startsWith('PartBuddy probe ') && (step.params.base as number[])[2] !== 16);
    expect(rods.map((step) => (step.params.base as number[]).map((value) => Math.round(value * 1000) / 1000))).toEqual([[39.75, 0, 9.057], [45.25, 0, 9.057]]);
    // The flap's wall ends above that: no web is drawn into the air under it, and the answer names what is left.
    const one = await answer(['Base']);
    expect(one.webs).toEqual(['Base', 'Base', 'Base']);
    expect(one.text).not.toContain('without support');
    expect(one.text).toContain(' The knuckles start above the bed, and the 2 of Flap got no web: a web meets its wall 6.743 mm below the line at the most, and PartBuddy found no wall beside the line that reaches down there. They need support, or a wall that reaches down that far before the hinge is built. The 3 knuckles of Base stand on webs at 45° that run from under the barrel down to their own wall. ');
    const none = await answer([]);
    expect(none.webs).toEqual([]);
    expect(none.text).toContain('the 3 of Base and the 2 of Flap got no web');
    // Audit W11: three knuckles asked for on 30 mm would have the pin bridge 10.5 mm inside the middle one: refused before anything is built.
    const wide = await answer(['Base', 'Flap'], { knuckles: 3 });
    expect(wide.text).toBe('Not built: with 3 knuckles the pin would bridge 10.533 mm inside each knuckle of Flap, more than prints clean (10 mm); use 5 knuckles');
    expect(wide.sent).toHaveLength(0);
    // Nine knuckles is the most: from there the way on is a second hinge on the same line.
    const long = await answer(['Base', 'Flap'], { to: [42.5, 100, 16] });
    expect(long.text).toBe('Not built: with 9 knuckles the pin would bridge 11.556 mm inside each knuckle of Flap, more than prints clean (10 mm); the line is longer than one hinge prints clean: build two or more hinges on the same line, each at most 86 mm long, which turn about one joint');
    // Audit H-08: the walls under the line could not be tried; no web, and the answer says why, not that there is no wall.
    const untried = await answer(null);
    expect(untried.webs).toEqual([]);
    expect(untried.text).toContain(' The knuckles start above the bed, and PartBuddy could not try the walls under the line this time, so no knuckle got a web: they need support, or build the hinge again.');
    expect(untried.text).not.toContain('found no wall');
    // Lying, the answer says which way the roof and the webs are laid.
    expect(both.text).toContain(' The roof over the bore and the flat under the pin are laid for printing as designed, -z down: a print face that lays the parts otherwise turns them away from the bed.');
    // A material that prints 40° (PETG): the webs are there, but they lean 45°, and the answer does not promise them to it.
    const petg = await answer(['Base', 'Flap'], {}, 40);
    expect(petg.webs).toHaveLength(5);
    expect(petg.text).not.toContain('without support.');
    expect(petg.text).toContain('where it bridges from knuckle to knuckle. Webs, barrels and the bore lean 45°, more than the 40° the material in use prints without support: they need support there, or a material that prints 45°.');
  });

  // Audit W7, W8, W9, R11, H-08: the skin behind the rooms was checked only with the model's `wall`, a knuckle hanging on a
  // sliver was built, a line inside a wall read as out of reach, and a failed trial built everything unchecked and unsaid.
  it('refuses before building what it could not measure, a knuckle on a sliver, and a thin skin, with or without wall', async () => {
    const call = async (answers: (step: { command: string; params: Record<string, unknown> }) => unknown, args: Record<string, unknown> = {}) => {
      const sent: { command: string; params: Record<string, unknown> }[] = [];
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (name, call) => {
          if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: 2 }) }] });
          const commands = call.commands as { command: string; params: Record<string, unknown> }[];
          sent.push(...commands);
          const results = commands.map((step) => (step.command === 'component.list' ? { components: [{ id: 3, parent: 0, bodies: ['Base'], occurrences: [{ id: 4, name: 'Base:1' }] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ id: 6, name: 'Flap:1' }] }] } : (answers(step) ?? {})));
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
        },
      };
      const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], ...args });
      return { text: String(built.content[0]?.text), error: built.isError === true, built: sent.some((step) => step.params.operation === 'join') };
    };
    // The trial gave no answer.
    const blind = await call(() => undefined);
    expect(blind).toEqual({ error: true, built: false, text: "Not built: PartBuddy could not measure where the hinge line lies against Base and Flap (SolidCraft's trial gave no answer), so it could not check that the knuckles hold and leave no thin skin; nothing was built. Call again" });
    // The rods behind the rooms gave no answer.
    const behind = await call((step) => ('clearance' in step.params && (step.params.bodies as string[])[0] !== 'PartBuddy probe' ? {} : trial(step)));
    expect(behind).toMatchObject({ error: true, built: false, text: expect.stringContaining("Not built: PartBuddy could not measure the walls behind the knuckles' rooms") as string });
    // 2.9 mm from a 6 mm barrel's line: 0.1 mm of hold (audit W8 measured a knuckle tied on by 1.6 mm of height).
    const sliver = await call((step) => trial(step, { distance: 2.9 }));
    expect(sliver).toEqual({ error: true, built: false, text: 'Not built: the hinge line lies 2.9 mm from Base, so the barrel overlaps it by 0.1 mm, under 0.5 mm: its knuckles would hang on a sliver. Put the hinge line within 2.5 mm of both bodies (the barrel is 6 mm, so it must overlap each by at least 0.5 mm). PartBuddy cuts each knuckle\'s room in the other body itself.' });
    expect((await call((step) => trial(step, { distance: 2.5 }))).error).toBe(false);
    // A 1.8 mm wall 2.4 mm from the line, no `wall` given (audit W7: 0.8 mm left, the print check found it at 0.802): the rod
    // behind the room stands 0.1 mm off the wall's back.
    const skin = await call((step) => trial(step, { distance: 2.4, skin: { moving: 0.1 } }));
    expect(skin).toEqual({ error: true, built: false, text: "Not built: the rooms of the knuckles would leave a skin of 0.8 mm of Flap's wall behind them, under two lines of the 0.4 mm nozzle (0.9 mm). Move the line 0.1 mm back from that wall, or 0.8 mm towards it so the rooms open through it, or make the wall 0.1 mm thicker. Nothing was built." });
    expect((await call((step) => trial(step, { distance: 2.4, skin: { moving: 0.1 } }), { wall: 5 })).text).toContain('a skin of 0.8 mm');
    // The wall ends right behind the room, or the room opens through it: no skin to speak of.
    expect((await call((step) => trial(step, { skin: { fixed: 0, moving: 0.9 } }))).error).toBe(false);
    // Audit W9: the line 0.5 mm inside the base's wall. The rod on the line overlaps it; the rod behind its rooms goes the
    // other way from the flap, and finds the base's back 0.3 mm short of it: a skin of 0.6 mm (the print check found 0.603).
    const sent: { command: string; params: Record<string, unknown> }[] = [];
    const inside = await call((step) => {
      sent.push(step);
      if (step.command === 'inspect.clearance' && (step.params.bodies as string[])[0] === 'PartBuddy probe') return { overlaps: [{ a: 'PartBuddy probe', b: 'Base', volume_mm3: 0.2 }], near: [{ a: 'PartBuddy probe', b: 'Flap', distance_mm: 2.45, from: [42.05, 15, 3], to: [44.5, 15, 3] }] };
      return trial(step, { skin: { fixed: 0.3 } });
    });
    expect(inside.text).toContain("Not built: the rooms of the knuckles would leave a skin of 0.6 mm of Base's wall behind them");
    const rods = sent.filter((step) => step.command === 'inspect.clearance').at(-1);
    expect(rods?.params.bodies).toEqual(['PartBuddy probe fixed', 'PartBuddy probe moving']);
    expect((await call((step) => (step.command === 'inspect.clearance' && (step.params.bodies as string[])[0] === 'PartBuddy probe' ? { overlaps: [{ a: 'PartBuddy probe', b: 'Base' }], near: [{ a: 'PartBuddy probe', b: 'Flap', distance_mm: 2.45, from: [42.05, 15, 3], to: [44.5, 15, 3] }] } : trial(step)))).text).toContain("The knuckles' rooms go 3.4 mm and more into Base (the line runs inside it) and 0.9 mm into Flap");
  });

  // Audit H-07, N-mechanik-7, MV-05: a standing hinge was built with its knuckle ends flat over the gap and nothing said.
  it('says what a standing hinge leaves hanging, and that a thin pin standing is weak', async () => {
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, call) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: 2 }) }] });
        const commands = call.commands as { command: string; params: Record<string, unknown> }[];
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'component.list' ? { components: [{ id: 3, parent: 0, bodies: ['Base'], occurrences: [{ id: 4, name: 'Base:1' }] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ id: 6, name: 'Flap:1' }] }] } : (trial(step) ?? {}))) }) }] });
      },
    };
    const standing = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 3, 0], to: [42, 3, 30] });
    expect(String(standing.content[0]?.text)).toContain(' Standing, the lower end of each knuckle is flat and hangs over the gap to the knuckle below it, which the print check reports as overhang: the slicer bridges it from the walls, and where it sags into the gap the knuckles stick together. Print a test piece first, or lay the hinge with its line level, where no end hangs. A pin under 5 mm printed standing breaks along its layers sooner than one lying.');
    const thick = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 3, 0], to: [42, 3, 30], diameter: 10 });
    expect(String(thick.content[0]?.text)).not.toContain('A pin under');
    const slant = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 13] });
    expect(slant).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('Not built: the hinge line must be level') as string }] });
  });

  it('builds onto a body that is a component with that component active, so the knuckles move with it', () => {
    // The flap is a component already (a second mechanism, or the assistant made components first); the base is not.
    const listing = { active: 0, components: [{ id: 0, parent: null, bodies: ['Base'] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ name: 'Flap:1' }] }] };
    const steps = activated(hingeSteps(spec), listing);
    const target = (step: { command: string; params: Record<string, unknown> }) => (step.command === 'component.activate' ? `activate ${String(step.params.component)}` : ((step.params.targets as string[] | undefined)?.[0] ?? step.command));
    // The roof's sketch is drawn with the flap active, as the bore before it and the cut after it.
    expect(steps.map(target)).toEqual(['activate 5', 'Flap', 'activate 0', 'Base', 'activate 5', 'Flap', 'activate 0', 'Base', 'activate 5', 'Flap', 'activate 0', 'Base', 'activate 5', 'Flap', 'sketch.create', 'sketch.line', 'Flap', 'activate 0', 'Base', 'sketch.create', 'sketch.line', 'Base']);
    // Nothing is a component: the steps as they are.
    expect(activated(hingeSteps(spec), { components: [{ id: 0, parent: null, bodies: ['Base', 'Flap'] }] })).toEqual(hingeSteps(spec));
    // A guide's sketch belongs to the component of the extrusion that uses it, and the design level is active again at the end.
    const guide = activated(slideSteps({ fixed: 'Base', moving: 'Flap', from: [0, 15, 4], to: [60, 15, 4], up: [0, 0, 1], width: 6, height: 3, gap: 0.4, name: 'Guide' }), listing);
    expect(guide.map((step) => step.command)).toEqual(['component.activate', 'sketch.create', 'sketch.line', 'solid.extrude', 'component.activate', 'sketch.create', 'sketch.line', 'solid.extrude']);
  });

  it('asks for the joints at 0 before it builds', async () => {
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: 3 }) }] });
        const commands = args.commands as { command: string }[];
        const results = commands.map((step) => (step.command === 'joint.list' ? { joints: [{ name: 'Lid hinge', values: [{ unit: 'deg', value: 90 }] }] } : {}));
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3] });
    expect(built).toMatchObject({ isError: true, content: [{ text: 'Not built: the joint(s) "Lid hinge" stand away from 0; drive them back with joint.drive first, so the bodies are where they were designed' }] });
  });

  it('keeps the joint when SolidCraft cannot run the sweep, and says so', async () => {
    let components = false;
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: 0 }) }] });
        const commands = args.commands as { command: string }[];
        // As SolidCraft 0.40.0-rc.3 answers when parts lie against each other along the way.
        if (commands.some((step) => step.command === 'joint.sweep')) {
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: [], failed: { command: 'joint.sweep', error: 'motion exceeds contact sweep collision budget; simplify the contact set or use smaller increments' } }) }] });
        }
        const results = commands.map((step) => {
          if (step.command === 'component.from_bodies') components = true;
          if (step.command === 'component.list') return { components: components ? [{ id: 3, parent: 0, bodies: ['Base'], occurrences: [{ name: 'Base:1' }] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ name: 'Flap:1' }] }] : [] };
          return step.command === 'document.inspect' ? { bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: 8 } : (trial(step as { command: string; params: Record<string, unknown> }) ?? {});
        });
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3] });
    expect(built.isError).toBeUndefined();
    expect(built.content[0]).toMatchObject({ text: expect.stringContaining('SolidCraft could not run it through its range (motion exceeds contact sweep collision budget') as string });
    expect(built.content[0]).toMatchObject({ text: expect.stringContaining('no limits are set') as string });
  });

  it('is one line in the work log, by its kind', () => {
    expect(describeToolCall('partbuddy_mechanism', { kind: 'hinge', name: 'Lid hinge' })).toEqual([{ key: 'hinge', values: { name: 'Lid hinge' } }]);
    expect(describeToolCall('partbuddy_mechanism', { kind: 'slide' })).toEqual([{ key: 'guide', values: { name: 'Guide' } }]);
  });

  it('is a tool the policy lets through', () => {
    expect(decide('partbuddy_mechanism', { kind: 'hinge' })).toEqual({ allow: true });
  });
});

/** The tool's description, as the model reads it. */
const withMechanismDescription = async (): Promise<string> => {
  const tools = await withMechanismTool({ instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.resolve({ content: [] }) }, () => 0.4).listTools();
  return String(tools[0]?.description);
};

describe('the dovetail guide (ADR 0027, G3)', () => {
  const guide: SlideSpec = { fixed: 'Base', moving: 'Carriage', from: [0, 15, 4], to: [60, 15, 4], up: [0, 0, 1], width: 6, height: 3, gap: 0.4, name: 'Guide' };

  it('cuts the groove a gap wider all round, then builds the rail, both sketched square to the line and extruded along it', () => {
    const steps = slideSteps(guide);
    expect(steps.map((step) => step.command)).toEqual(['sketch.create', 'sketch.line', 'solid.extrude', 'sketch.create', 'sketch.line', 'solid.extrude']);
    // Sketch x across the rail, y up: the extrusion runs from "from" towards "to".
    expect(steps[0]?.params.plane).toEqual({ origin: [0, 15, 4], x_dir: [0, 1, 0], y_dir: [0, 0, 1] });
    expect(steps[2]?.params).toMatchObject({ distance: '60 mm', operation: 'cut', targets: ['Carriage'] });
    expect(steps[5]?.params).toMatchObject({ distance: '60 mm', operation: 'join', targets: ['Base'] });
    // The rail: 6 mm at its foot, 3 mm high, 45° flanks.
    expect(steps[4]?.params.points).toEqual([[-3, 0], [3, 0], [6, 3], [-6, 3]]);
    // The groove: the flanks 0.4 mm away measured square to them, its roof 0.4 mm above the rail.
    expect(steps[1]?.params.points).toEqual([[-3.566, -0.4], [3.566, -0.4], [3.566, 0], [6.966, 3.4], [-6.966, 3.4], [-3.566, 0]]);
  });

  // Audit 2026-11-12, T5: that roof is a level ceiling 13.9 mm wide (102 mm at the largest rail), a gap over the rail's
  // head, and the tool called the guide "printed in one piece without support".
  it('puts a roof at 45° with a 5 mm ridge over the groove where the moving body is high enough, and says how the parts print', async () => {
    expect(slideRoof(guide)).toEqual({ ceiling: 13.931, ridge: 5, top: 7.866 });
    expect(slideRoof({ width: 60, height: 20, gap: 0.4 })).toMatchObject({ ceiling: 101.931, top: 68.866 });
    // From both edges of the old ceiling (±6.966 at 3.4) up at 45° to the ridge: 4.466 mm in, 4.466 mm up.
    const roofed = slideSteps({ ...guide, roof: true });
    expect(roofed[1]?.params.points).toEqual([[-3.566, -0.4], [3.566, -0.4], [3.566, 0], [6.966, 3.4], [2.5, 7.866], [-2.5, 7.866], [-6.966, 3.4], [-3.566, 0]]);
    // The rail is the same.
    expect(roofed.slice(3)).toEqual(slideSteps(guide).slice(3));
    // The tool measures the moving body first: its top lies `top` over the base's face at z = 4.
    const answer = async (top: number, args: Record<string, unknown> = {}, { solid = top, wide = 0, hole = 0, broken = false, refused = false, overhang = 45, split = false } = {}) => {
      const sent: { command: string; params: Record<string, unknown> }[] = [];
      const probes: number[][] = [];
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (name, call) => {
          if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Carriage' }], undo: 2 }) }] });
          const commands = call.commands as { command: string; params: Record<string, unknown> }[];
          sent.push(...commands);
          // The trial rods lie in the carriage where it is solid: up to `solid` over the base's face, along its 20 mm of the line (0.628 mm³ each).
          const rods = commands.filter((step) => step.command === 'solid.cylinder' && String(step.params.body_name).startsWith('PartBuddy probe '));
          // Not checked in here: what throws in the trial is taken as a trial that failed.
          probes.push(...rods.map((rod) => [...(rod.params.base as number[]).map((value) => Math.round(value * 1000) / 1000), rod.params.height as number]));
          if (rods.length > 0 && broken) return Promise.resolve({ content: [{ type: 'text', text: 'no answer' }], isError: true });
          // Above `solid` the carriage goes on as a rib `wide` over the line, up to its top; `hole` mm of each rod lie in a gap.
          const inBody = (base: number[]) => (base[2] ?? 0) + 0.1 <= 4 + solid || (Math.abs((base[1] ?? 0) - 15) <= wide / 2 && (base[2] ?? 0) + 0.1 <= 4 + top);
          const results = commands.map((step) => (step.command === 'inspect.clearance' ? { overlaps: rods.flatMap((rod) => (inBody(rod.params.base as number[]) ? [{ a: rod.params.body_name, b: 'Carriage', volume_mm3: 0.628 * (1 - hole / 20) }] : [])) } : step.command === 'solid.extrude' && step.params.operation === 'cut' && split ? { created_bodies: ['Carriage (1)'], warning: null } : step.command === 'document.inspect' ? { timeline: [{ id: 1 }, { id: 2 }], undo: 2 } : step.command === 'inspect.measure' ? { bodies: [{ name: 'Carriage', bbox: { min: [20, 0, 4.4], max: [40, 30, 4 + top] } }] } : step.command === 'component.list' ? { components: [{ id: 3, parent: 0, bodies: ['Base'], occurrences: [{ id: 4, name: 'Base:1' }] }, { id: 5, parent: 0, bodies: ['Carriage'], occurrences: [{ id: 6, name: 'Carriage:1' }] }] } : {}));
          // SolidCraft refuses the third rod: the batch ends there, with the two results before it and no comparison.
          if (rods.length > 0 && refused) return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: results.slice(0, 2), failed: { command: 'solid.cylinder', error: 'refused', index: 2 } }) }], isError: true });
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
        },
      };
      const built = await withMechanismTool(upstream, () => 0.4, undefined, () => overhang).callTool('partbuddy_mechanism', { kind: 'slide', fixed: 'Base', moving: 'Carriage', from: [0, 15, 4], to: [60, 15, 4], ...args });
      return { text: String(built.content[0]?.text), groove: sent.find((step) => step.command === 'sketch.line')?.params.points as number[][], sent: sent.map((step) => step.command), probes };
    };
    // 7.866 mm of roof and two lines over its ridge: 8.8 mm.
    const high = await answer(8.8);
    expect(high.groove).toHaveLength(8);
    // The rods lie along the carriage's 20 mm of the line: over the ridge's middle and edges (±2.5 mm) with their tops two lines
    // over it, and over the middle of each flank (±4.733 mm, where the roof is 5.633 mm high), not in the groove beside the ridge.
    expect(high.probes).toEqual([[20, 15, 12.666, 20], [20, 17.5, 12.666, 20], [20, 12.5, 12.666, 20], [20, 19.733, 10.806, 20], [20, 10.267, 10.806, 20]]);
    expect(high.text).toContain("The two print apart, each with up pointing up, and Carriage is then pushed onto the rail from an end. Neither needs support: the rail's flanks and the roof over the groove lean 45°, and the roof's ridge is a bridge of 5 mm.");
    // The body is measured before the first step is built.
    expect(high.sent.indexOf('inspect.measure')).toBeLessThan(high.sent.indexOf('sketch.create'));
    // The two print apart (audit G1, counter-check): no mark that would stand them on one bed.
    expect(high.sent).toContain('joint.as_built');
    expect(high.sent).not.toContain('component.metadata.set');
    // Lower than that the ceiling stays flat, and the answer says what that means instead of "without support".
    const low = await answer(8.5);
    expect(low.groove).toHaveLength(6);
    expect(low.text).not.toContain('Neither needs support');
    expect(low.text).toContain("The groove's ceiling is flat and 13.9 mm wide, more than prints as a bridge (10 mm): a roof at 45° over it needs Carriage to be solid up to 8.8 mm over the face the rail is on, all along the groove, and it is not. Print Carriage turned over instead, lying on its top with the groove open upwards (set that face as its print face), or make it that high there and build this again.");
    // Review of PR #358: a plate 6 mm thick with a knob on it is 16.4 mm high by its box, and the roof (ridge at 7.9 mm) cut it in
    // two along the rail under "Neither needs support". The rods find the plate, not the box.
    const knob = await answer(16.4, {}, { solid: 6 });
    expect(knob.groove).toHaveLength(6);
    expect(knob.text).not.toContain('Neither needs support');
    // Review 2 of PR #358: a rib 6.4 mm wide on that plate holds the three rods over the ridge, and nothing lies over the flanks:
    // with the flank rods in the groove beside the ridge the roof was built and cut the plate along both sides of the rib.
    const rib = await answer(9, {}, { solid: 6, wide: 6.4 });
    expect(rib.groove).toHaveLength(6);
    expect(rib.text).toContain('and it is not. Print Carriage turned over');
    // A cross groove 1.5 mm wide in the carriage (under the old tenth of its length): the roof would break out into it.
    const gap = await answer(12, {}, { hole: 1.5 });
    expect(gap.groove).toHaveLength(6);
    // Review 3 of PR #358: so do the ends of a round or chamfered body, which is full over the groove: the answer does not call it "not solid".
    expect(gap.text).toContain('all along the groove, and it is along most of it only (material is missing at that height along up to 1.5 mm of it: at ends that are round, chamfered or turned, or in a gap across the groove). Print Carriage turned over');
    // Review 3 of PR #358: a rod SolidCraft refuses ends the batch before the comparison, which read as rods outside the body ("it is not").
    expect((await answer(12, {}, { refused: true })).text).toContain("whether it is could not be tried (SolidCraft's trial failed)");
    // A trial that fails says nothing about the body, and a line askew to the axes is tried by the body's box: the answer says which.
    const failed = await answer(12, {}, { broken: true });
    expect(failed.groove).toHaveLength(6);
    expect(failed.text).toContain("all along the groove, and whether it is could not be tried (SolidCraft's trial failed). Print Carriage turned over");
    expect(failed.text).toContain('or make sure it is that high there and build this again.');
    const askew = await answer(12, { from: [0, 0, 4], to: [60, 30, 4] }, { hole: 4 });
    expect(askew.groove).toHaveLength(6);
    expect(askew.text).toContain("and the trial did not find it so (the line runs askew to the axes, where the trial goes by the body's box and can reach past the body). Print");
    // Whatever cuts a body apart, SolidCraft says so only in created_bodies: that fails the call and takes it back.
    const cut = await answer(12, {}, { split: true });
    expect(cut.text).toBe('Not built: the step "Guide ·" cut "Carriage" apart ("Carriage (1)" came of it): the body is too thin or too small where the mechanism goes. Everything was taken back.');
    // A small rail under a low body: its flat ceiling of 6.9 mm is a bridge that prints, and the answer says that, not "turn it over".
    const small = await answer(2.9, { width: 2, height: 1.5 });
    expect(small.groove).toHaveLength(6);
    expect(small.text).toContain("The groove's ceiling is flat and 6.9 mm wide, which prints as a bridge (up to 10 mm), and the rail's flanks lean 45°: neither needs support.");
    // A material that prints 40° (PETG): flanks and roof lean 45°, so nothing is promised for it.
    const petg = await answer(12, {}, { overhang: 40 });
    expect(petg.groove).toHaveLength(8);
    expect(petg.text).not.toContain('Neither needs support');
    expect(petg.text).toContain("The rail's flanks and the roof over the groove lean 45°, more than the 40° the material in use prints without support: they need support there, or a material that prints 45°.");
    // The dovetail to plug together is the same groove: the same roof, the same words.
    const plug = await answer(12, { kind: 'plug', shape: 'dovetail' });
    expect(plug.groove).toHaveLength(8);
    expect(plug.text).toContain('nothing stops it. The two print apart, each with up pointing up');
    expect(await withMechanismDescription()).not.toContain('printed in one piece without support');
  });

  it('says what is wrong before anything is built, and fills in the defaults', () => {
    expect(slideProblem(guide)).toBeNull();
    expect(slideProblem({ ...guide, up: [1, 0, 0] })).toContain('up must be square to the line');
    expect(slideProblem({ ...guide, to: [3, 15, 4] })).toBe('from and to must be at least 5 mm apart');
    expect(slideOf({ kind: 'slide', fixed: 'Base', moving: 'Carriage', from: [0, 15, 4], to: [60, 15, 4] }, 0.6)).toMatchObject({ up: [0, 0, 1], width: 6, height: 3, gap: 0.6, name: 'Guide' });
  });

  it('lets the moving body travel as far as it stays on the rail', () => {
    // inspect.measure as SolidCraft 0.40.0-rc.3 answers: the carriage lies over x 20 to 40 of a rail from 0 to 60.
    const measure = { bodies: [{ name: 'Carriage', bbox: { min: [20, 0, 4.4], max: [40, 30, 10.4] } }] };
    expect(railTravel(measure, [0, 15, 4], [60, 15, 4])).toEqual([-20, 20]);
    // Seen from the other end of a shorter rail the same body, turned round.
    expect(railTravel(measure, [60, 15, 4], [10, 15, 4])).toEqual([-20, 10]);
    // A body longer than the rail has nowhere to go.
    expect(railTravel({ bodies: [{ bbox: { min: [-5, 0, 4.4], max: [70, 30, 10.4] } }] }, [0, 15, 4], [60, 15, 4])).toEqual([0, 0]);
    expect(railTravel({}, [0, 15, 4], [60, 15, 4])).toBeNull();
  });
});

describe('the snap closure of a lid (G3)', () => {
  // A lid sitting on its box: the room inside both is 56 × 36 mm, the rim at 20 mm, the lip goes down.
  const lid: LipSpec = { fixed: 'Box', moving: 'Lid', min: [2, 2], max: [58, 38], rim: 20, up: -1, radius: 0, wall: 2, side: 'y-', name: 'Closure' };

  it('builds a lip ring on a foot inside the lid, a bead on it, its rille in the box and a notch, nothing outside', () => {
    const steps = lipSteps(lid);
    expect(steps.map((step) => [step.command, step.params.name ?? ''])).toEqual([
      ['sketch.create', 'Closure ·'],
      ['sketch.rectangle.two_point', ''],
      ['sketch.rectangle.two_point', ''],
      ['solid.extrude', 'Closure ·'],
      ['sketch.create', 'Closure'],
      ['sketch.rectangle.two_point', ''],
      ['sketch.rectangle.two_point', ''],
      ['solid.extrude', 'Closure'],
      ['solid.chamfer', 'Closure ◢'],
      ['solid.chamfer', 'Closure ◥'],
      ['solid.cylinder', 'Closure ◠'],
      ['solid.box', 'Closure ●'],
      ['solid.chamfer', 'Closure ◆'],
      ['solid.cylinder', 'Closure ○'],
    ]);
    // The notch is cut before the bead is built: its cylinder (16 mm wide, from the wall's plane outwards, 2.5 mm into the lid
    // above the rim) also covers the bead's height below the rim, and would take the 0.25 mm of bead past that plane with it.
    expect(steps[10]?.params).toMatchObject({ diameter: '16 mm', base: ['(2 mm + 58 mm) / 2', '2 mm - 2 mm', '20 mm - 5.5 mm'], axis: 'Y', operation: 'cut', targets: ['Lid'] });
    const [notch, bead] = [steps.findIndex((step) => step.params.name === 'Closure ◠'), steps.findIndex((step) => step.params.name === 'Closure ●')];
    expect(notch).toBeLessThan(bead);
    // The foot lies above the rim in the lid, 0.2 mm into its wall; the lip hangs 4 mm below the rim, 0.25 mm clear, 1.4 mm thick
    // (three lines of a 0.4 mm nozzle and 0.05 mm).
    expect(steps[0]?.params.offset).toBe('20 mm');
    expect(steps[1]?.params).toEqual({ p0: ['2 mm - 0.2 mm', '2 mm - 0.2 mm'], p1: ['58 mm + 0.2 mm', '38 mm + 0.2 mm'] });
    expect(steps[4]?.params.offset).toBe('20 mm - 4 mm');
    expect(steps[5]?.params).toEqual({ p0: ['2 mm + 0.25 mm', '2 mm + 0.25 mm'], p1: ['58 mm - 0.25 mm', '38 mm - 0.25 mm'] });
    expect(steps[6]?.params).toEqual({ p0: ['2 mm + 1.65 mm', '2 mm + 1.65 mm'], p1: ['58 mm - 1.65 mm', '38 mm - 1.65 mm'] });
    // A lead-in of 0.8 mm on the outside of the lip's tip, on all four edges of a sharp ring (review of PR #370: a narrow lid's
    // tip swung through the box's rim on the way shut).
    expect(steps[9]?.params).toEqual({ edges: [[30, 2.25, 16], [30, 37.75, 16], [2.25, 20, 16], [57.75, 20, 16]], distance: '0.8 mm', body: 'Lid', name: 'Closure ◥' });
    // Only the rille is cut from the box; everything else belongs to the lid.
    expect(steps.filter((step) => JSON.stringify(step.params.targets ?? step.params.body ?? '').includes('Box')).map((step) => step.params.name)).toEqual(['Closure ○']);
    // The bead stands 0.25 mm past the wall's face (0.5 mm proud of the lip), 14 mm long in the wall's middle; its rille sits where it lands.
    expect(steps[11]?.params).toMatchObject({ length: '14 mm', width: '0.5 mm', height: '1 mm', corner: ['(2 mm + 58 mm) / 2 - 7 mm', '2 mm - 0.25 mm', '20 mm - 3 mm'] });
    expect(steps[13]?.params).toMatchObject({ diameter: '1.4 mm', axis: 'X', base: ['(2 mm + 58 mm) / 2 - 7.5 mm', '2 mm + 0.25 mm', '20 mm - 2.5 mm'] });
    // A flat plate as the lid gets the lip alone on its face: no foot that would come out of its top, no notch in a wall it does not have.
    expect(lipSteps({ ...lid, flat: true }).map((step) => step.params.name ?? '').filter(Boolean)).toEqual(['Closure', 'Closure', 'Closure ◥', 'Closure ●', 'Closure ◆', 'Closure ○']);
    expect(lipOf({ fixed: 'Box', moving: 'Lid', from: [2, 2, 20], to: [58, 38, 20], side: 'y-', flat: true })).toMatchObject({ flat: true });
    // Rounded rooms get rounded rings, each radius less its inset, never under 0.5 mm: also a small radius, where a sharp ring
    // ran its slope into the room's round corner and SolidCraft refused the chamfer (review of PR #370, radius 1); the lip's
    // outside keeps at least 1 mm, round which the 0.8 mm lead-in rolls.
    expect(lipSteps({ ...lid, radius: 4 })[5]?.params).toMatchObject({ radius: '3.75 mm' });
    expect([1, 2, 5, 6].map((i) => lipSteps({ ...lid, radius: 1 })[i]?.params.radius)).toEqual(['1.2 mm', '0.5 mm', '1 mm', '0.5 mm']);
    expect(lipSteps({ ...lid, radius: 1 })[1]?.command).toBe('sketch.rectangle.rounded');
    expect(lipSteps({ ...lid, radius: { at: 1, expr: 'r' } })[2]?.params.radius).toBe('max((r) - 1.65 mm, 0.5 mm)');
  });

  it('puts the rille where the bead lands when the lid is built open and closes on a hinge, and follows a template\'s parameters', () => {
    const open = lipSteps({ ...lid, up: 1, side: 'y+', rim: { at: 16, expr: 'height' }, hinge: { along: 'x', across: 0.5, z: { at: 16, expr: 'height' } } });
    expect(open.find((step) => step.params.name === 'Closure ○')?.params.base).toEqual(['(2 mm + 58 mm) / 2 - 7.5 mm', '2 * 0.5 mm - (38 mm - 0.25 mm)', '2 * (height) - ((height) + 2.5 mm)']);
    expect(open[0]?.params.offset).toBe('(height) - 3 mm');
  });

  it('leaves the lip off the wall at the hinge, where the knuckles turn (audit T3, N-nach-1)', () => {
    // The lid lies open beside the box, its hinge line 0.5 mm out from y = 0; the room starts at y 2.4 + 1.
    const unhinged: LipSpec = { ...lid, min: [2.4, 3.4], max: [57.6, 38.6], up: 1, side: 'y+', rim: 16, radius: 2.6, wall: 2.4 };
    const open: LipSpec = { ...unhinged, hinge: { along: 'x', across: 0.5, z: 16 } };
    const steps = lipSteps(open);
    const names = steps.map((step) => step.params.name ?? '');
    // Taken off after both slopes were set on the whole ring, so their edges stay the ones they were picked as.
    const cut = names.indexOf('Closure ▭');
    expect(cut).toBe(names.indexOf('Closure ◥') + 1);
    // The lid's room (its own outline) where it lies within the band from the hinge's wall to past the corners' arcs (y 3.4
    // to 3.4 + 2.6 + 0.5), from the foot's underside to over the lip: no wall is cut, and the side lips end square.
    expect(steps.slice(cut, cut + 4).map((step) => step.params)).toEqual([
      { plane: 'XY', offset: '16 mm - 3 mm', project_edges: false, name: 'Closure ▭' },
      { p0: ['2.4 mm', '3.4 mm'], p1: ['57.6 mm', '38.6 mm'], radius: '2.6 mm' },
      { p0: ['2.4 mm - 1 mm', '3.4 mm - 1 mm'], p1: ['57.6 mm + 1 mm', '3.4 mm + 3.1 mm'] },
      { distance: '3 mm + 4.1 mm', operation: 'cut', targets: ['Lid'], profiles: [{ point: [30, 4.25] }], exact_regions: true, name: 'Closure ▭' },
    ]);
    // Without a hinge every wall keeps its lip.
    expect(lipSteps(unhinged).some((step) => step.params.name === 'Closure ▭')).toBe(false);
    expect(lipProblem({ ...open, side: 'y-' })).toBe('with a hinge the catch goes on the wall opposite it: side y+');
    expect(lipProblem({ ...open, side: 'x+' })).toBe('with a hinge the catch goes on the wall opposite it: side y+');
    expect(lipProblem(open)).toBeNull();
  });

  it('slopes the foot on all four edges of a sharp ring, and stops it short of a shallow floor (audit T15, N-mechanik-14, N-nach-2)', () => {
    const chamfer = (spec: LipSpec) => lipSteps(spec).find((step) => step.params.name === 'Closure ◢')?.params.edges;
    // Sharp: one point per wall, in the middle of each inner edge of the foot's underside (above the rim, the lid hangs down).
    expect(chamfer(lid)).toEqual([[30, 3.65, 23], [30, 36.35, 23], [3.65, 20, 23], [56.35, 20, 23]]);
    // Rounded: the four are one chain from any point of it.
    expect(chamfer({ ...lid, radius: 4 })).toEqual([[30, 3.65, 23]]);
    // A template's floor: the foot stops 0.6 mm short of it, however low the lid is made.
    const low = lipSteps({ ...lid, up: 1, side: 'y+', rim: { at: 16, expr: 'height' }, floor: { at: 2.4, expr: 'wall' } });
    expect(low[0]?.params.offset).toBe('(height) - (min(3 mm, (height) - (wall) - 0.6 mm))');
    expect(low[3]?.params.distance).toBe('min(3 mm, (height) - (wall) - 0.6 mm)');
  });

  it('sizes the lip in whole lines of the nozzle, at least two, with 0.05 mm over them (audit T13, MV-19)', () => {
    expect([0.25, 0.4, 0.6, 0.8].map((nozzle) => lipThick(nozzle))).toEqual([1.455, 1.4, 1.4, 1.85]);
    expect(lipSteps({ ...lid, nozzle: 0.8 })[6]?.params).toEqual({ p0: ['2 mm + 2.1 mm', '2 mm + 2.1 mm'], p1: ['58 mm - 2.1 mm', '38 mm - 2.1 mm'] });
    expect(lipOf({ fixed: 'Box', moving: 'Lid', from: [2, 2, 20], to: [58, 38, 20], up: [0, 0, -1], side: 'y-' }, 0.6)).toMatchObject({ nozzle: 0.6 });
  });

  it('tries the box where the lid closes before it builds anything (audit W17, T14, H-10)', async () => {
    // The lid open beside the box, as the template has it: rods turned half a turn about the hinge line land in the box.
    const unhinged: LipSpec = { ...lid, min: [2, 43], max: [58, 79], up: 1, side: 'y+', rim: 20, radius: 2, wall: 2 };
    const open: LipSpec = { ...unhinged, hinge: { along: 'x', across: 40.5, z: 20 } };
    const rods: { name: string; base: number[]; height: number }[] = [];
    // The share of each rod that lies in the box, by its name.
    const trial = (inside: (name: string) => number, spec: LipSpec = open) => {
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (_name, args) => {
          const commands = args.commands as { command: string; params: { body_name: string; base: number[]; height: number; bodies?: string[] } }[];
          const made = commands.filter((step) => step.command === 'solid.cylinder').map((step) => ({ name: step.params.body_name, base: step.params.base, height: step.params.height }));
          rods.splice(0, rods.length, ...made);
          // Each comparison answers for the rods it names, as SolidCraft does (at most 25 overlaps each).
          const overlaps = (names: string[]) => made.filter((rod) => names.includes(rod.name)).map((rod) => ({ a: rod.name, b: rod.name.includes('under') ? 'Lid' : 'Box', volume_mm3: ((Math.PI * 0.04) / 4) * rod.height * inside(rod.name) }));
          const results = commands.filter((step) => step.command !== 'sketch.inspect').map((step) => (step.command === 'inspect.clearance' ? { overlaps: overlaps(step.params.bodies ?? []) } : {}));
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
        },
      };
      return closureTrial(upstream, spec, 0.4, undefined);
    };
    const fits = (name: string) => (/room|tip|under/.test(name) ? 0 : 1);
    expect(await trial(fits)).toEqual({ problem: null, back: [] });
    // No rod at the hinge's wall (y-), which keeps no lip; the one behind the rille lies 1.25 mm into the box's wall
    // (0.45 mm of rille and two lines, less the rod's half), at the rille's height, along the bead.
    // A rod just past the lip's tip on each wall, and one in the lid under the foot (in the lid, so this box never holds it).
    expect(rods.map((rod) => rod.name.replace('PartBuddy probe ', ''))).toEqual(['room x-', 'tip x-', 'wall x-', 'room x+', 'tip x+', 'wall x+', 'room y+', 'tip y+', 'wall y+', 'behind y+', 'under y+']);
    // From 0.1 mm behind the lid's wall plane (y 79, turned to y 2), as far as the bead may stand back and still catch 0.15 mm.
    expect(rods.find((rod) => rod.name.endsWith('wall y+'))?.base[1]).toBeCloseTo(2 * 40.5 - 79.2);
    expect((await trial((name) => (name.endsWith('tip y+') ? 0.5 : fits(name)))).problem).toContain("closed, the lip's tip would stand in Box at the lid's y+ wall");
    expect((await trial((name) => (name.endsWith('under y+') ? 1 : fits(name)))).problem).toContain('Lid is not hollow 3.3 mm below its rim inside its y+ wall');
    const behind = rods.find((rod) => rod.name.endsWith('behind y+'));
    expect(behind?.base.map((value) => Math.round(value * 1000) / 1000)).toEqual([22.5, 2 * 40.5 - (79 + 1.25), 2 * 20 - 22.5]);
    expect(behind?.height).toBeCloseTo(15);
    expect((await trial((name) => (name.endsWith('room y+') ? 0.3 : fits(name)))).problem).toContain("closed, the lip would run into Box's wall at the lid's y+ wall");
    expect((await trial((name) => (name.endsWith('wall y+') ? 0 : fits(name)))).problem).toContain("Box's wall with the catch (y+) does not stand where the lid's wall does");
    expect((await trial((name) => (name.endsWith('behind y+') ? 0.6 : fits(name)))).problem).toContain('is under 1.35 mm thick behind the middle of the lid');
    // A side wall the box stands back from is said, not refused.
    expect(await trial((name) => (name.endsWith('wall x-') ? 0 : fits(name)))).toEqual({ problem: null, back: ['x-'] });
    // Without the hinge line, a lid lying open side up is looked for where it lies, and the answer says what is missing.
    expect((await trial(() => 0, unhinged)).problem).toContain('give the hinge line it closes about (hinge_from, hinge_to)');
  });

  it('says what is wrong before anything is built', () => {
    expect(lipProblem(lid)).toBeNull();
    expect(lipProblem({ ...lid, moving: 'Box' })).toBe('fixed and moving must be two bodies');
    expect(lipProblem({ ...lid, side: 'x-', max: [58, 20] })).toContain('Put the catch on a longer wall');
    expect(lipProblem({ ...lid, wall: 1 })).toContain('wall must be 1.6–10 mm');
    expect(lipProblem({ ...lid, radius: 17.5 })).toBe('radius must be at most 17 mm: every wall of the room needs a straight stretch of at least 2 mm between its corners');
    expect(lipProblem({ ...lid, radius: 17 })).toBeNull();
    const args = { kind: 'closure', fixed: 'Box', moving: 'Lid', from: [58, 2, 20], to: [2, 38, 20], up: [0, 0, -1], side: 'y-' };
    expect(lipOf(args)).toMatchObject({ min: [2, 2], max: [58, 38], rim: 20, up: -1, wall: 2, radius: 0, name: 'Closure' });
    expect(lipOf({ ...args, to: [2, 38, 25] })).toBe("from and to must both lie at the height of the lid's rim");
    expect(lipOf({ ...args, up: [1, 0, 0] })).toContain('up must be +Z');
    expect(lipOf({ ...args, side: 'front' })).toContain('side must be x-, x+, y- or y+');
    // With a hinge the catch goes opposite it.
    expect(lipOf({ ...args, side: 'y+', hinge_from: [0, 0, 20], hinge_to: [60, 0, 20] })).toMatchObject({ hinge: { along: 'x', across: 0, z: 20 } });
    expect(lipOf({ ...args, hinge_from: [0, 0, 20], hinge_to: [60, 0, 20] })).toBe('with a hinge the catch goes on the wall opposite it: side y+');
    expect(lipOf({ ...args, hinge_from: [0, 0, 20], hinge_to: [60, 10, 20] })).toBe('the hinge line must run level, along X or along Y');
  });

  it('is one line of the work log, and the tool builds it without a joint', async () => {
    expect(describeToolCall('partbuddy_mechanism', { kind: 'closure', name: 'Lid closure' })).toEqual([{ key: 'closure', values: { name: 'Lid closure' } }]);
    const batches: string[] = [];
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Box' }, { name: 'Lid' }] }) }] });
        const commands = args.commands as { command: string }[];
        batches.push(commands.map((step) => step.command).join(' '));
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : {})) }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'closure', fixed: 'Box', moving: 'Lid', from: [2, 2, 20], to: [58, 38, 20], up: [0, 0, -1], side: 'y-' });
    expect(built.isError).toBeUndefined();
    expect(built.content[0]).toMatchObject({ text: expect.stringContaining('Built the closure "Closure" between Box (the box) and Lid (the lid): a lip 1.4 mm thick and 4 mm high inside the lid, 0.25 mm clear') as string });
    // The trial of the box gave no answer here: the answer says what to keep instead.
    expect(built.content[0]).toMatchObject({ text: expect.stringContaining("PartBuddy could not try Box's wall: keep it straight where the lip goes in, and at least 1.35 mm thick behind the rille.") as string });
    expect(batches).toHaveLength(5);
    // Audit R39: the notch goes through the lid's rim, so the guidance does not say that no wall is cut through.
    expect(MECHANISM_GUIDANCE).not.toContain('no wall cut through');
    expect(MECHANISM_GUIDANCE).toContain("only a notch for a fingernail in the lid's rim");
    expect(batches.join(' ')).not.toContain('joint.as_built');
  });
});

describe('the screw joint (standards)', () => {
  // A plate 6 mm thick on a block: the screws go in from above at z 26 and pass into the block at z 20.
  const joint: ScrewSpec = { fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, 20], more: [[50, 30, 26]], size: 'M3', head: 'cap', thread: 'insert', screws: true, name: 'Screw' };

  it('drills the clearance hole with its counterbore only through the plate, seats the insert on the same line, and puts the screws in last', () => {
    const steps = screwSteps(joint);
    expect(steps.map((step) => [step.command, step.params.name ?? ''])).toEqual([
      ['solid.hole', 'Screw 1'],
      ['solid.hole', 'Screw 1 ○'],
      ['solid.hole', 'Screw 2'],
      ['solid.hole', 'Screw 2 ○'],
      ['parts.insert', ''],
      ['parts.insert', ''],
    ]);
    // Audit W21: the clearance hole from our own table (ISO 273, normal), not SolidCraft's unseen one.
    expect(steps[0]?.params).toEqual({ position: [10, 10, 26], diameter: '3.4 mm', type: 'counterbore', cb_diameter: '6.7 mm', cb_depth: '3.4 mm', direction: [0, 0, -1], depth: '6 mm', targets: ['Plate'], name: 'Screw 1' });
    // The seat is a millimetre deeper than the 5.7 mm insert.
    expect(steps[1]?.params).toEqual({ position: [10, 10, 20], direction: [0, 0, -1], diameter: '4 mm', depth: '6.7 mm', targets: ['Block'], name: 'Screw 1 ○' });
    expect(steps[3]?.params.position).toEqual([50, 30, 20]);
    // M3×8: 2.6 mm of plate under the head and 5.4 mm of the 5.7 mm insert. It sits on the counterbore's floor, head up.
    expect(screwFit(joint)).toEqual({ length: 8, sink: 0 });
    expect(steps[4]?.params).toEqual({ family: 'socket_head_cap_screw', size: 'M3', length: 8, point: [10, 10, 22.6], direction: [0, 0, 1] });
    // A countersunk screw is measured from its top, which lies flush; a thread from M5 is modelled.
    const sunk = screwSteps({ ...joint, head: 'countersunk', size: 'M4', more: [] });
    expect(sunk[0]?.params).toMatchObject({ type: 'countersink', cs_diameter: '9.56 mm', cs_angle: '90 deg' });
    expect(sunk[2]?.params).toMatchObject({ family: 'countersunk_socket_screw', length: 12, point: [10, 10, 26] });
    expect(screwSteps({ ...joint, size: 'M6', thread: 'tapped', head: 'none', more: [] })[1]?.params).toMatchObject({ thread: 'M6', modeled: true, depth: '16 mm' });
    expect(screwSteps({ ...joint, screws: false })).toHaveLength(4);
  });

  it('takes the lengths of each size from its standard, and sinks the head where none ends in the insert (audit T17, MV-08, W20)', () => {
    // MV-08: ISO 4762 per size, with 55 and 65; countersunk ones by DIN 7991, from 8 mm and M3 only to 30.
    expect(screwLengths({ size: 'M2', head: 'cap' })).toEqual([3, 4, 5, 6, 8, 10, 12, 16, 20]);
    expect(screwLengths({ size: 'M6', head: 'none' })).toContain(55);
    expect(screwLengths({ size: 'M10', head: 'cap' })).toEqual([16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100]);
    expect(screwLengths({ size: 'M3', head: 'countersunk' })).toEqual([8, 10, 12, 16, 20, 25, 30]);
    expect(screwLengths({ size: 'M10', head: 'countersunk' })[0]).toBe(12);
    // T17: M3 cap with an insert through 16 mm reaches 16.4 to 18.3 mm, and no length lies there: the head sinks 0.4 mm
    // deeper and an M3×16 holds 3.8 mm of the insert, as two thirds of it ask. W20: so at 12 mm.
    const thick = { ...joint, to: [10, 10, 10] as [number, number, number], more: [] };
    expect(screwWindow(thick)).toEqual({ least: 16.4, most: 18.3, through: 12.6 });
    expect(screwFit(thick)).toEqual({ length: 16, sink: 0.4 });
    expect(screwFit({ ...joint, to: [10, 10, 14] })).toEqual({ length: 12, sink: 0.4 });
    const sunk = screwSteps(thick);
    expect(sunk[0]?.params).toMatchObject({ type: 'counterbore', cb_depth: '3.8 mm' });
    expect(sunk[2]?.params).toMatchObject({ length: 16, point: [10, 10, 22.2] });
    // A countersink that must sink starts on the floor of a cylinder as wide as its mouth: M4 through 16 mm reaches 21.4 to
    // 24.1 mm, so an M4×20 with the head 1.4 mm deeper.
    const deep = screwSteps({ ...thick, head: 'countersunk', size: 'M4' });
    expect(deep.map((step) => [step.command, step.params.name ?? ''])).toEqual([['solid.cylinder', 'Screw 1 ◎'], ['solid.hole', 'Screw 1'], ['solid.hole', 'Screw 1 ○'], ['parts.insert', '']]);
    expect(deep[0]?.params).toMatchObject({ diameter: '9.56 mm', height: '1.4 mm', base: [10, 10, 26], axis: [0, 0, -1], operation: 'cut', targets: ['Plate'] });
    expect(deep[1]?.params).toMatchObject({ position: [10, 10, 24.6], type: 'countersink', cs_diameter: '9.56 mm', depth: '14.6 mm' });
    expect(deep[3]?.params).toMatchObject({ length: 20, point: [10, 10, 24.6] });
    // Its room is measured as wide as its mouth from 0.5 mm down, and 1.4 mm deeper.
    expect(screwStock({ ...thick, head: 'countersunk', size: 'M4' }).moving[0]).toMatchObject({ diameter: 9.56, depth: 3.43 });
    expect(screwStock({ ...joint, head: 'countersunk', size: 'M4', more: [] }).moving[0]).toMatchObject({ diameter: 8.56, depth: 2.03 });
    // MV-28: a printed thread holds from two diameters on: M6 through 14 mm takes 26 to 29 mm, where no length is, and a head
    // lying on the face cannot sink; the rule before (two thirds of 2.5 d) took an M6×25.
    expect(screwWindow({ ...joint, size: 'M6', thread: 'tapped', head: 'none', to: [10, 10, 12] })).toMatchObject({ least: 26, most: 29 });
    expect(screwFit({ ...joint, size: 'M6', thread: 'tapped', head: 'none', to: [10, 10, 12] })).toBeNull();
    expect(screwFit({ ...joint, size: 'M6', thread: 'tapped', head: 'none', to: [10, 10, 16] })).toEqual({ length: 25, sink: 0 });
    // Review of BC-07, S3: a head sinks one diameter at most. M3 through 22.6 mm sinks 3 mm for an M3×20; through 22.65 it
    // would sink 3.05, and no screw goes in. M2 through 60 mm would have sunk 40.27 mm.
    expect(sinkMost('M3')).toBe(3);
    expect(screwFit({ ...joint, to: [10, 10, 3.4] })).toEqual({ length: 20, sink: 3 });
    expect(screwFit({ ...joint, to: [10, 10, 3.35] })).toBeNull();
    expect(screwSink({ ...joint, to: [10, 10, 3.35] })).toEqual({ length: 20, sink: 3.05 });
    expect(screwFit({ ...joint, size: 'M2', to: [10, 10, -34] })).toBeNull();
    // Where sinking is short of the plastic under the head: M6 tapped through 7 mm would sink 0.6 mm and leave none.
    expect(screwSink({ ...joint, size: 'M6', thread: 'tapped', to: [10, 10, 19] })).toEqual({ length: 12, sink: 0.6 });
    expect(screwFit({ ...joint, size: 'M6', thread: 'tapped', to: [10, 10, 19] })).toBeNull();
  });

  it('sinks a countersink as deep as its cone is cut, and keeps two lines of the nozzle under the head (audit T7, MV-07, W19, N-bloecke-7, N-mechanik-18, T61)', () => {
    // The cone from the head and its allowance down to the clearance hole: M3 1.96 mm (0.6 · d said 1.8), M5 3.15 (3.0).
    const flat = { ...joint, head: 'countersunk' as const, more: [] };
    const plate = (thick: number) => [10, 10, 26 - thick] as [number, number, number];
    expect(screwProblem({ ...flat, to: plate(3.16) })).toBeNull();
    expect(screwProblem({ ...flat, to: plate(3.15) })).toBe('the moving body is 3.15 mm thick there, which leaves 1.19 mm under the countersink; make it at least 3.16 mm thick, or use head none');
    expect(screwProblem({ ...flat, to: plate(3) })).toContain('leaves 1.04 mm under the countersink');
    // N-bloecke-7: M5 at 4.2 mm said it left 1.2 mm and asked for 4.2; exactly at the bound it is built, and the message agrees.
    expect(screwProblem({ ...flat, size: 'M5', to: plate(4.35) })).toBeNull();
    expect(screwProblem({ ...flat, size: 'M5', to: plate(4.34) })).toBe('the moving body is 4.34 mm thick there, which leaves 1.19 mm under the countersink; make it at least 4.35 mm thick, or use head none');
    expect(screwProblem({ ...flat, size: 'M5', to: plate(4.2) })).toBe('the moving body is 4.2 mm thick there, which leaves 1.05 mm under the countersink; make it at least 4.35 mm thick, or use head none');
    // N-mechanik-18: 1.2 mm, and two lines from a 0.6 mm nozzle on (1.35 mm), 1.8 on 0.8.
    expect([0.2, 0.25, 0.4, 0.6, 0.8].map((nozzle) => underHead(nozzle))).toEqual([1.2, 1.2, 1.2, 1.35, 1.8]);
    expect(underHead()).toBe(1.2);
    expect(screwProblem({ ...joint, to: plate(4.6) })).toBeNull();
    expect(screwProblem({ ...joint, to: plate(4.6), nozzle: 0.6 })).toContain('leaves 1.2 mm under the counterbore; make it at least 4.75 mm thick');
    expect(screwProblem({ ...joint, to: plate(4.75), nozzle: 0.6 })).toBeNull();
    expect(screwOf({ kind: 'screw', fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, 21.4] }, 0.6)).toContain('make it at least 4.75 mm thick');
    // A head lying on the face has nothing under it to keep.
    expect(screwProblem({ ...joint, head: 'none', to: plate(1) })).toBeNull();
  });

  it('says what is wrong before anything is built', () => {
    expect(screwProblem(joint)).toBeNull();
    expect(screwProblem({ ...joint, size: 'M8' })).toContain('there is no heat-set insert for M8');
    expect(screwProblem({ ...joint, thread: 'tapped' })).toContain('a printed M3 thread strips');
    expect(screwProblem({ ...joint, to: [10, 10, 23] })).toContain('make it at least 4.6 mm thick, or use head none');
    expect(screwProblem({ ...joint, head: 'countersunk', size: 'M2' })).toBe('countersunk screws start at M3');
    const args = { kind: 'screw', fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, 20] };
    expect(screwOf(args)).toMatchObject({ size: 'M3', head: 'cap', thread: 'insert', more: [], screws: true, name: 'Screw' });
    expect(screwOf({ ...args, size: 'M7' })).toContain('size must be one of M2');
    expect(screwOf({ ...args, more: [[1, 2]] })).toBe('more must be a list of points, each three numbers');
    expect(describeToolCall('partbuddy_mechanism', { kind: 'screw', name: 'Lid screws' })).toEqual([{ key: 'screwJoint', values: { name: 'Lid screws' } }]);
  });

  it('is built by the tool with one call, which says what to buy', async () => {
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Block' }, { name: 'Plate' }] }) }] });
        const commands = args.commands as { command: string }[];
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : {})) }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'screw', fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, 20], more: [[50, 30, 26]], name: 'Plate screws' });
    expect(built.isError).toBeUndefined();
    const text = String(built.content[0]?.text);
    expect(text).toContain('Built 2 screw joints "Plate screws" that hold Plate on Block: in Plate a clearance hole of 3.4 mm for M3 (ISO 273, normal: 0.4 mm over the screw, more than a printed hole shrinks) with a counterbore for the head, in Block the seat of a heat-set insert (4 mm wide, 6.7 mm deep).');
    expect(text).toContain('To buy: 2 × M3×8 socket head cap screws (ISO 4762) and 2 M3 heat-set inserts 5.7 mm long; the screws are in the design as standard parts.');
    expect(text).not.toContain("ISO's 60° flanks");
    const tools = withMechanismTool(upstream, () => 0.4);
    // T17: a deeper counterbore, said; W20: where none fits, the nearest lengths and what they lack.
    const sunk = String((await tools.callTool('partbuddy_mechanism', { kind: 'screw', fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, 10] })).content[0]?.text);
    expect(sunk).toContain('with a counterbore for the head, sunk 0.4 mm deeper than the head needs so that a standard length ends in the insert,');
    expect(sunk).toContain('To buy: 1 × M3×16 socket head cap screws');
    const none = String((await tools.callTool('partbuddy_mechanism', { kind: 'screw', fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, 12], size: 'M6', thread: 'tapped', head: 'none' })).content[0]?.text);
    expect(none).toContain('a modelled M6 thread. No standard M6 screw length (10 to 60 mm) ends inside the thread at this thickness: M6×25 holds only 11 mm of the thread, where 12 are needed; M6×30 reaches 1 mm past the thread, so no screws were put in: change the thickness or the size.');
    // N-mechanik-20: the modelled thread's flanks lean 60°, which the print check does not see.
    expect(none).toContain("The thread has ISO's 60° flanks: printed with its axis upright, their undersides lean 60°, more than prints clean, so run an M6 tap through it after printing, or use an insert where the part allows.");
    // S3: M2 through 60 mm would have sunk its head 40.27 mm; it is said instead.
    const deep = String((await tools.callTool('partbuddy_mechanism', { kind: 'screw', fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, -34], size: 'M2' })).content[0]?.text);
    expect(deep).toContain('No standard M2 screw length (3 to 20 mm) ends inside the insert at this thickness: M2×20 holds only 0 mm of the insert, where 2.67 are needed, and its head would have to sink 40.27 mm deeper, more than the 2 mm (one diameter) a head may, so no screws were put in: change the thickness or the size.');
  });

  describe('is built only where the plastic is: 2 mm round each insert, and the room for each head inside the moving body (audit R54)', () => {
    /**
     * Base 40 × 40 × 10 with Cover 40 × 40 × 5 on it, as boxes. A probe cylinder along Z finds plastic over its height
     * within a box, all of it where its disc lies in the box from above, a tenth less where the disc reaches over an edge.
     * `pilot`: a hole of that diameter, 5 mm deep, drilled into Base at (20, 20) already.
     */
    function boxes({ pilot = 0 } = {}) {
      const sent: string[] = [];
      const box: Record<string, [number, number, number, number, number, number]> = { Base: [0, 0, 0, 40, 40, 10], Cover: [0, 0, 10, 40, 40, 15] };
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (name, args) => {
          if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Cover' }] }) }] });
          const commands = args.commands as { command: string; params: Record<string, unknown> }[];
          sent.push(commands.map((step) => step.command).join(' '));
          let probe = { x: 0, y: 0, r: 0, low: 0, high: 0 };
          const results = commands.map((step) => {
            if (step.command === 'solid.cylinder') {
              const [base, height, way] = [step.params.base as number[], parseFloat(String(step.params.height)), (step.params.axis as number[])[2] ?? 0];
              const z = base[2] ?? 0;
              probe = { x: base[0] ?? 0, y: base[1] ?? 0, r: parseFloat(String(step.params.diameter)) / 2, low: Math.min(z, z + way * height), high: Math.max(z, z + way * height) };
            }
            if (step.command === 'inspect.interference') {
              const [x0, y0, z0, x1, y1, z1] = box[(step.params.bodies as string[])[0] ?? ''] ?? [0, 0, 0, 0, 0, 0];
              const inside = probe.x - probe.r >= x0 && probe.x + probe.r <= x1 && probe.y - probe.r >= y0 && probe.y + probe.r <= y1;
              const drilled = (step.params.bodies as string[])[0] === 'Base' && Math.hypot(probe.x - 20, probe.y - 20) < 1e-6 ? Math.PI * Math.min(pilot / 2, probe.r) ** 2 * Math.max(0, Math.min(10, probe.high) - Math.max(5, probe.low)) : 0;
              const volume = Math.PI * probe.r ** 2 * Math.max(0, Math.min(z1, probe.high) - Math.max(z0, probe.low)) * (inside ? 1 : 0.9) - drilled;
              return { interferences: [{ volume_mm3: volume }] };
            }
            return step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : step.command === 'document.inspect' ? { undo: 1, timeline: [], sketches: [] } : {};
          });
          const trial = args.rollback === true;
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(trial ? { results: results.slice(0, -1), failed: { command: 'sketch.inspect' } } : { results }) }], ...(trial ? { isError: true } : {}) });
        },
      };
      return { tools: withMechanismTool(upstream, () => 0.4), sent };
    }
    const joint = { kind: 'screw', fixed: 'Base', moving: 'Cover', from: [20, 20, 15], to: [20, 20, 10], screws: false };

    it('measures it before building and says so', async () => {
      const { tools, sent } = boxes();
      const built = await tools.callTool('partbuddy_mechanism', joint);
      expect(String(built.content[0]?.text)).toContain("Each insert's seat needs 2 mm of plastic round it and 0.6 mm under it, and the counterbore for each head lies inside Cover. PartBuddy measured that plastic, from 0.5 mm under the faces on: it is there.");
      expect(sent.some((batch) => batch.includes('solid.hole'))).toBe(true);
    });

    it('refuses a screw 2.5 mm from the edge, whose counterbore breaks out of the cover and whose seat has 0.5 mm of wall, and builds nothing', async () => {
      const { tools, sent } = boxes();
      const edge = await tools.callTool('partbuddy_mechanism', { ...joint, from: [2.5, 20, 15], to: [2.5, 20, 10] });
      expect(edge.isError).toBe(true);
      expect(String(edge.content[0]?.text)).toContain('at [2.5, 20, 15] Cover has 3.01 mm of plastic where 3.4 mm are needed (the mean over a ring from 3.4 to 6.7 mm wide; the far side, an edge, a face that falls away to one side or another cut takes the rest); the counterbore for the head is 6.7 mm wide and must lie wholly inside Cover: move the screw at least 3.35 mm away from its edges and other cuts, or use head none.');
      expect(sent.some((batch) => batch.includes('solid.hole'))).toBe(false);
      // A head lying on the face: the seat is measured, and its wall is short.
      const flat = await tools.callTool('partbuddy_mechanism', { ...joint, head: 'none', from: [2.5, 20, 15], to: [2.5, 20, 10] });
      expect(String(flat.content[0]?.text)).toMatch(/at \[2\.5, 20, 10\] Base has [\d.]+ mm of plastic where [\d.]+ mm are needed \(the mean over a ring from 4\.02 to 8 mm wide.*the seat of an M3 insert needs 2 mm of plastic round it and 0\.6 mm under it/);
      expect(sent.some((batch) => batch.includes('solid.hole'))).toBe(false);
    });

    it('counts a hole drilled where the seat goes as missing plastic: nothing is drilled yet when it measures (review of PR 365)', async () => {
      const { tools, sent } = boxes({ pilot: 3 });
      const piloted = await tools.callTool('partbuddy_mechanism', joint);
      expect(String(piloted.content[0]?.text)).toMatch(/at \[20, 20, 10\] Base has [\d.]+ mm of plastic where 7\.3 mm are needed \(the mean over a width of 4\.02 mm, under the hole/);
      expect(sent.some((batch) => batch.includes('solid.hole'))).toBe(false);
      expect(screwStock(screwOf(joint) as ScrewSpec).fixed[0]).toMatchObject({ hole: 0, diameter: 8, core: 4.02, depth: 6.8 });
    });

    /**
     * Base 40 × 40 × 10 and on it a Cover 15 mm high in its middle whose top falls away by `k` · q², q from (20, 20) on a
     * ball or across a rod along Y: the plastic in a probe and its centre summed over a polar grid, as SolidCraft gives
     * them exactly (`inspect.interference`, volume and centre).
     */
    function domed(k: number, rod: boolean) {
      const sent: string[] = [];
      const top = (x: number, y: number) => 25 - k * ((x - 20) ** 2 + (rod ? 0 : (y - 20) ** 2));
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (name, args) => {
          if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Cover' }] }) }] });
          const commands = args.commands as { command: string; params: Record<string, unknown> }[];
          sent.push(commands.map((step) => step.command).join(' '));
          let probe = { x: 0, y: 0, r: 0, low: 0, high: 0 };
          const results = commands.map((step) => {
            if (step.command === 'solid.cylinder') {
              const [base, height] = [step.params.base as number[], parseFloat(String(step.params.height))];
              probe = { x: base[0] ?? 0, y: base[1] ?? 0, r: parseFloat(String(step.params.diameter)) / 2, low: (base[2] ?? 0) - height, high: base[2] ?? 0 };
            }
            if (step.command === 'inspect.interference') {
              const cover = (step.params.bodies as string[])[0] === 'Cover';
              let [volume, mx, my, mz] = [0, 0, 0, 0];
              const [n, m] = [40, 72];
              for (let i = 0; i < n; i += 1) {
                for (let j = 0; j < m; j += 1) {
                  const [q, a] = [((i + 0.5) * probe.r) / n, ((j + 0.5) * 2 * Math.PI) / m];
                  const [x, y] = [probe.x + q * Math.cos(a), probe.y + q * Math.sin(a)];
                  const [floor, roof] = cover ? [10, top(x, y)] : [0, 10];
                  const [from, to] = [Math.max(floor, probe.low), Math.min(roof, probe.high)];
                  if (x < 0 || x > 40 || y < 0 || y > 40 || to <= from) continue;
                  const dv = (to - from) * q * (probe.r / n) * ((2 * Math.PI) / m);
                  [volume, mx, my, mz] = [volume + dv, mx + dv * x, my + dv * y, mz + (dv * (from + to)) / 2];
                }
              }
              return { interferences: [{ volume_mm3: volume, center: volume > 0 ? [mx / volume, my / volume, mz / volume] : [0, 0, 0] }] };
            }
            return step.command === 'component.list' ? { components: [] } : step.command === 'document.inspect' ? { undo: 1, timeline: [], sketches: [] } : {};
          });
          const trial = args.rollback === true;
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(trial ? { results: results.slice(0, -1), failed: { command: 'sketch.inspect' } } : { results }) }], ...(trial ? { isError: true } : {}) });
        },
      };
      return { tools: withMechanismTool(upstream, () => 0.4), sent };
    }

    it('lets the room for a head into a curved lid as a seat into a curved face, and says how much the curve took; an edge it refuses (review of PR 365)', async () => {
      // A ball of radius 8 and a rod of radius 5 at the top: the counterbore's rim lies up to 0.7 and 1.1 mm under the top.
      for (const [k, rod] of [[1 / 16, false], [1 / 10, true]] as const) {
        const { tools, sent } = domed(k, rod);
        const built = await tools.callTool('partbuddy_mechanism', { ...joint, from: [20, 20, 25] });
        expect(built.isError, String(k)).toBeUndefined();
        expect(String(built.content[0]?.text), String(k)).toMatch(/it is there\. Round the hole the face falls away all round, as a curved face does: PartBuddy allowed up to [\d.]+ mm³ of wall/);
        expect(sent.some((batch) => batch.includes('solid.hole')), String(k)).toBe(true);
      }
      // A rod of radius 60 along Y and the screw 2.5 mm from the lid's edge: the room breaks out to one side.
      const { tools, sent } = domed(1 / 120, true);
      const edge = await tools.callTool('partbuddy_mechanism', { ...joint, from: [2.5, 20, 25 - (17.5 * 17.5) / 120] });
      // No standard length ends in the insert along this line, so the counterbore sinks 1.88 mm deeper, and is measured so.
      expect(String(edge.content[0]?.text)).toMatch(/^Not built: at \[2\.5, 20, [\d.]+\] Cover has [\d.]+ mm of plastic where 5\.28 mm are needed \(the mean over a ring from 3\.4 to 6\.7 mm wide/);
      // Review of BC-07, S3: the refusal names how deep the room for the head has become.
      expect(String(edge.content[0]?.text)).toContain('the counterbore for the head is 6.7 mm wide and 5.28 mm deep, sunk 1.88 mm deeper so that a standard length fits, and must lie wholly inside Cover');
      expect(sent.some((batch) => batch.includes('solid.hole'))).toBe(false);
    });
  });
});

describe('the screw lid (standards)', () => {
  // A jar 60 mm wide whose rim is at 50 mm, centred at (10, 20).
  const lid: LidSpec = { fixed: 'Jar', moving: 'Lid', centre: [10, 20, 50], diameter: 60, starts: 1, gap: 0.3, name: 'Thread' };

  it('sizes the thread by the neck: pitch and depth from the diameter, 1.75 turns, three quarters of a turn per start at least', () => {
    expect(lidThread({ diameter: 20, starts: 1 })).toMatchObject({ pitch: 3, depth: 1.1, lead: 3, turns: 1.75, length: 5.25 });
    // Flat crest and root with flanks at 45°: the crest is half a pitch less the depth, the foot half a pitch more.
    expect(lidThread({ diameter: 60, starts: 1 })).toEqual({ pitch: 4, depth: 1.2, lead: 4, turns: 1.75, length: 7, crest: 0.8, foot: 3.2 });
    expect(lidThread({ diameter: 100, starts: 2 })).toMatchObject({ pitch: 5, depth: 1.5, lead: 10, turns: 0.875 });
    expect(lidThread({ diameter: 40, starts: 3 })).toMatchObject({ lead: 12, turns: 0.75, length: 9 });
    // Plain neck, thread, half a pitch for the lid's thread and its mouth: what the lid covers of the neck.
    expect(lidSkirt({ diameter: 60, starts: 1 })).toBe(14.2);
  });

  it('coils the thread onto the neck, makes the lid with the same thread half a pitch lower and the gap further out, and lays the lid on its top', () => {
    const steps = lidSteps(lid);
    expect(steps.map((step) => [step.command, step.params.name ?? ''])).toEqual([
      ['sketch.create', 'Thread 1'],
      ['sketch.line', ''],
      ['solid.coil', 'Thread 1'],
      ['solid.cylinder', 'Lid'],
      ['solid.cone', 'Thread ◢'],
      ['solid.cylinder', 'Thread ○'],
      ['sketch.create', 'Thread · 1'],
      ['sketch.line', ''],
      ['solid.coil', 'Thread · 1'],
      ['solid.cylinder', 'Thread ◆'],
      ['solid.pattern.circular', ''],
      ['body.print_face', ''],
    ]);
    // The neck's thread: from 30 mm of radius to 31.2 mm, its middle 9.6 mm below the rim at the start, 7 mm of coil.
    expect(steps[0]?.params.plane).toEqual({ origin: [10, 20, 40.4], x_dir: [1, 0, 0], y_dir: [0, 0, 1] });
    expect(steps[1]?.params.points).toEqual([[29.8, -1.8], [31.2, -0.4], [31.2, 0.4], [29.8, 1.8]]);
    expect(steps[2]?.params).toMatchObject({ pitch: '4 mm', height: '7 mm', base: [10, 20, 40.4], operation: 'join', targets: ['Jar'] });
    // The lid: its bore 0.3 mm clear of the neck's crests, its thread 2 mm lower and reaching to 0.3 mm from the neck.
    expect(steps[3]?.params).toMatchObject({ diameter: '67.8 mm', base: [10, 20, 35.8], operation: 'new', body_name: 'Lid' });
    expect(steps[5]?.params).toMatchObject({ diameter: '63 mm', height: '14.2 mm', operation: 'cut', targets: ['Lid'] });
    expect(steps[6]?.params.plane).toMatchObject({ origin: [10, 20, 38.4] });
    expect(steps[7]?.params.points).toEqual([[31.7, -1.8], [30.3, -0.4], [30.3, 0.4], [31.7, 1.8]]);
    expect(steps[10]?.params).toMatchObject({ features: ['Thread ◆'], count: 30 });
    expect(steps[11]?.params).toEqual({ body: 'Lid', point: [10, 20, 52.4] });
    // Two starts: each thread twice, the second half a turn on.
    const two = lidSteps({ ...lid, starts: 2 });
    expect(two.filter((step) => step.command === 'solid.coil').map((step) => step.params.name)).toEqual(['Thread 1', 'Thread 2', 'Thread · 1', 'Thread · 2']);
    expect(two[3]?.params.plane).toMatchObject({ x_dir: [-1, 0, 0] });
    // A narrow neck: the section stops short of the next turn, and reaches in as far radially, so the flanks keep 45° (audit
    // T6: 1.3 mm across over 1.25 mm along leant 46.1°).
    const narrow = lidSteps({ ...lid, diameter: 20 });
    expect(narrow[1]?.params.points).toEqual([[9.85, -1.45], [11.1, -0.2], [11.1, 0.2], [9.85, 1.45]]);
    expect(narrow[7]?.params.points).toEqual([[11.55, -1.45], [10.3, -0.2], [10.3, 0.2], [11.55, 1.45]]);
    for (const step of [narrow[1], narrow[7], steps[1], steps[7], lidSteps({ ...lid, diameter: 100 })[1]]) {
      const [[x0, y0], [x1, y1]] = step?.params.points as [[number, number], [number, number]];
      expect(Math.abs(x1 - x0)).toBeCloseTo(Math.abs(y1 - y0), 9);
    }
  });

  it('says what is wrong before anything is built, and takes its defaults from the nozzle', () => {
    expect(lidProblem(lid)).toBeNull();
    expect(lidProblem({ ...lid, moving: 'Jar' })).toContain('moving is the name of the lid to make');
    expect(lidProblem({ ...lid, diameter: 10 })).toContain('diameter must be 16–200 mm');
    expect(lidProblem({ ...lid, starts: 4 })).toBe('starts must be 1, 2 or 3');
    const args = { kind: 'lid', fixed: 'Jar', moving: 'Lid', from: [10, 20, 50], diameter: 60 };
    expect(lidOf(args, 0.4)).toMatchObject({ centre: [10, 20, 50], starts: 1, gap: 0.3, name: 'Thread' });
    expect(lidOf(args, 0.6)).toMatchObject({ gap: 0.45 });
    expect(lidOf({ ...args, diameter: undefined }, 0.4)).toContain('are needed');
    expect(describeToolCall('partbuddy_mechanism', { kind: 'lid', moving: 'Jar lid' })).toEqual([{ key: 'screwLid', values: { name: 'Jar lid' } }]);
  });

  /**
   * A jar as SolidCraft answers the neck's trial probes: an upright tube round (cx, cy) from z 0 to `high`, `outer` and
   * `inner` its radii, its rim's outer edge chamfered by `chamfer` and its inner edge rounded by `round` (taken as 45°
   * too), and a `collar` ring round it. A probe's plastic is summed over its disc: rods on a fine grid, the probes on the
   * axis ring by ring, with the same rings for both, as SolidCraft's exact volumes would agree.
   */
  function jar({ outer = 30, inner = 27.6, high = 50, cx = 10, cy = 20, chamfer = 0, round = 0, collar }: { outer?: number; inner?: number; high?: number; cx?: number; cy?: number; chamfer?: number; round?: number; collar?: { from: number; to: number; low: number; high: number } } = {}): { tools: ReturnType<typeof withMechanismTool>; sent: string[] } {
    const sent: string[] = [];
    // The plastic over (x, y) between z0 and z1.
    const column = (d: number, z0: number, z1: number) => {
      const top = high - Math.max(0, d - (outer - chamfer)) - Math.max(0, inner + round - d);
      const tube = d >= inner && d <= outer ? Math.max(0, Math.min(z1, top) - Math.max(z0, 0)) : 0;
      const ring = collar && d >= collar.from && d <= collar.to ? Math.max(0, Math.min(z1, collar.high) - Math.max(z0, collar.low)) : 0;
      return tube + ring;
    };
    const probe = (params: Record<string, unknown>) => {
      const [x, y, z] = params.base as number[];
      const [r, z0] = [Number(params.diameter) / 2, z ?? 0];
      const z1 = z0 + Number(params.height);
      if (Math.hypot((x ?? 0) - cx, (y ?? 0) - cy) < 1e-9) {
        let volume = 0;
        for (let q = 0.0005; q < r; q += 0.001) volume += 2 * Math.PI * q * 0.001 * column(q, z0, z1);
        return volume;
      }
      let volume = 0;
      const n = 20;
      for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
        const [u, v] = [((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1];
        if (u * u + v * v > 1) continue;
        volume += ((2 * r) / n) ** 2 * column(Math.hypot((x ?? 0) + u * r - cx, (y ?? 0) + v * r - cy), z0, z1);
      }
      return volume * ((Math.PI / 4) / (Array.from({ length: n * n }, (_, k) => [((Math.floor(k / n) + 0.5) / n) * 2 - 1, (((k % n) + 0.5) / n) * 2 - 1]).filter(([u, v]) => (u ?? 0) ** 2 + (v ?? 0) ** 2 <= 1).length / (n * n)));
    };
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Jar' }] }) }] });
        const commands = args.commands as { command: string; params: Record<string, unknown> }[];
        sent.push(commands.map((step) => step.command).join(' '));
        const probes = commands.filter((step) => step.command === 'solid.cylinder' && step.params.operation === 'new').map((step) => step.params);
        const results = commands.map((step) => {
          if (step.command !== 'inspect.clearance') return step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : step.command === 'document.inspect' ? { undo: 1, timeline: [], sketches: [] } : {};
          const named = (step.params.bodies as string[] | undefined) ?? [];
          // SolidCraft 0.40.1 answers at most 25 overlaps per comparison and drops the rest unsaid (review of BC-07).
          return { overlaps: probes.filter((params) => named.includes(String(params.body_name))).map((params) => ({ a: params.body_name, b: 'Jar', volume_mm3: probe(params) })).slice(0, 25) };
        });
        const trial = args.rollback === true;
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(trial ? { results: results.slice(0, -1), failed: { command: 'sketch.inspect' } } : { results }) }], ...(trial ? { isError: true } : {}) });
      },
    };
    return { tools: withMechanismTool(upstream, () => 0.4), sent };
  }
  const neck = { kind: 'lid', fixed: 'Jar', moving: 'Lid', from: [10, 20, 50], diameter: 60 };
  const said = async (made: ReturnType<typeof jar>, args: Record<string, unknown> = neck) => String((await made.tools.callTool('partbuddy_mechanism', args)).content[0]?.text);

  it('measures the neck before it builds: diameter, centre, length, wall, rim and the lid\'s room (audit W22, N-mechanik-9)', async () => {
    const good = jar();
    expect(await said(good)).toContain('PartBuddy measured the neck: a plain cylinder of 60 mm there, centred on from, with a wall of at least 2 mm.');
    expect(good.sent.some((batch) => batch.includes('solid.coil'))).toBe(true);
    // N-mechanik-9: a jar 8 mm high, where the lid covers 14.2 mm, took the thread below its floor.
    const short = jar({ high: 8 });
    expect(await said(short, { ...neck, from: [10, 20, 8] })).toBe("Not built: the neck of Jar is not a cylinder of 60 mm round [10, 20] from 14.2 to 1 mm below the rim at z 8: just inside that diameter 8 of 8 points round it have no plastic all the way (the least 7 of 13.2 mm). The neck is narrower, off centre, shorter than the lid's skirt or not upright, or its rim lies lower than from; give from as the centre of the rim at its height and diameter as the neck's outer diameter, or make the neck plain and 14.2 mm long");
    expect(short.sent.some((batch) => batch.includes('solid.coil'))).toBe(false);
    // N-mechanik-9: a neck of 44 given as 40 stood in the lid; one of 38 left the thread in the air; 0.1 mm off centre too.
    expect(await said(jar({ outer: 22, inner: 19.6 }), { ...neck, diameter: 40 })).toContain('just outside that diameter 8 of 8 points round it meet plastic of Jar');
    expect(await said(jar({ outer: 19, inner: 16.6 }), { ...neck, diameter: 40 })).toContain('just inside that diameter 8 of 8 points round it have no plastic');
    expect(await said(jar({ cx: 10.1 }))).toMatch(/^Not built: the neck of Jar is not a cylinder of 60 mm .* just inside that diameter [1-7] of 8 points/);
    expect(await said(jar({ cx: 10.05 }))).toContain('PartBuddy measured the neck');
    // The wall: 2 mm builds, 1.9 mm does not.
    expect(await said(jar({ inner: 28 }))).toContain('PartBuddy measured the neck');
    expect(await said(jar({ inner: 28.1 }))).toContain('Not built: the neck of Jar is under 2 mm thick round [10, 20] from 14.2 to 1 mm below the rim at z 50 at 8 of 8 points round it');
    // Review of BC-07: a chamfer or a round on the rim's edges is no other neck, up to the plain band at its top; deeper it is.
    expect(await said(jar({ chamfer: 0.5, round: 0.5 }))).toContain('PartBuddy measured the neck');
    expect(await said(jar({ chamfer: 0.95, round: 0.95, inner: 28 }))).toContain('PartBuddy measured the neck');
    expect(await said(jar({ chamfer: 2 }))).toContain('just inside that diameter 8 of 8 points round it have no plastic');
    // A rim lower than from by 0.2 mm: the middle of the wall is short at the top.
    expect(await said(jar(), { ...neck, from: [10, 20, 50.2] })).toBe('Not built: the rim of Jar lies lower than z 50.2 at 8 of 8 points round it (the least 0.8 of the top 1 mm are plastic); give from as the centre of the rim at its height');
    // A rim higher than from, and a collar or a handle where the lid comes (review of BC-07, K4): the lid's room is not free.
    expect(await said(jar(), { ...neck, from: [10, 20, 49] })).toMatch(/^Not built: Jar has [\d.]+ mm³ of plastic beside its neck where the lid comes, within 67\.8 mm from 14\.2 mm below the rim to 2\.4 mm above it: a collar, a handle or a shoulder stands there, or the rim lies higher than from/);
    expect(await said(jar({ collar: { from: 31, to: 33, low: 40, high: 42 } }))).toMatch(/^Not built: Jar has [\d.]+ mm³ of plastic beside its neck where the lid comes/);
    expect(await said(jar({ collar: { from: 31, to: 33, low: 20, high: 35.7 } }))).toContain('PartBuddy measured the neck');
  });

  it('says so when the neck could not be measured (review of BC-07, K3)', async () => {
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Jar' }] }) }] });
        const commands = args.commands as { command: string }[];
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : {})) }) }] });
      },
    };
    const text = String((await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', neck)).content[0]?.text);
    expect(text).toContain('PartBuddy could not measure the neck this time: keep it a plain cylinder of 60 mm there, with a wall of at least 2 mm.');
  });

  it('is built by the tool with one call that makes the lid, and refuses a name that is taken', async () => {
    const upstream = (bodies: string[]): UpstreamTools => ({
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: bodies.map((body) => ({ name: body })) }) }] });
        const commands = args.commands as { command: string }[];
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : {})) }) }] });
      },
    });
    const args = { kind: 'lid', fixed: 'Jar', moving: 'Lid', from: [10, 20, 50], diameter: 60 };
    const built = await withMechanismTool(upstream(['Jar']), () => 0.4).callTool('partbuddy_mechanism', args);
    expect(built.isError).toBeUndefined();
    const text = String(built.content[0]?.text);
    expect(text).toContain('Built the screw lid "Lid" for Jar: a thread with 45° flanks on the neck, pitch 4 mm, 1.2 mm deep, 1 start, and the same inside the lid, 0.3 mm clear; it closes in 1.75 turns and stops with its inner top on the rim.');
    expect(text).toContain('The lid is 67.8 mm wide and covers the top 14.2 mm of the neck');
    const taken = await withMechanismTool(upstream(['Jar', 'Lid']), () => 0.4).callTool('partbuddy_mechanism', args);
    expect(taken).toMatchObject({ isError: true, content: [{ text: 'Not built: a body "Lid" exists already; give the lid another name, or delete that body first' }] });
  });
});

describe('snap hooks with their windows (standards)', () => {
  // A base with a cover over it: the cover's wall stands from y = 20 to y = 22, the hooks stand on the base's top at z = 4.
  const args = { kind: 'snap', fixed: 'Base', moving: 'Cover', from: [20, 20, 4], to: [20, 22, 4], more: [[32, 20, 4]] };

  it('cuts each window through the wall first and stands each hook a gap off it, the catch over the window\'s edge', () => {
    const spec = snapOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    expect(spec).toMatchObject({ up: [0, 0, 1], toward: [0, 2, 0], wall: 2, name: 'Snap hook' });
    const steps = snapSteps(spec);
    expect(steps.map((step) => step.command)).toEqual(['sketch.create', 'sketch.line', 'solid.extrude', 'sketch.create', 'sketch.line', 'solid.extrude', 'plastic.snap_fit', 'plastic.snap_fit']);
    // The window's lower edge lies 0.2 mm under the catch (12 − 1.5 above the face); x × y points into the wall.
    expect(steps[0]?.params.plane).toEqual({ origin: [20, 20, 14.3], x_dir: [-1, 0, 0], y_dir: [0, 0, 1] });
    expect(steps[1]?.params).toEqual({ points: [[-2.8, 0], [2.8, 0], [2.8, 2.2], [-2.8, 2.2]], closed: true });
    expect(steps[2]?.params).toMatchObject({ distance: '2 mm', operation: 'cut', targets: ['Cover'], name: 'Snap hook 1 □' });
    expect(steps[3]?.params.plane).toMatchObject({ origin: [32, 20, 14.3] });
    expect(steps[6]?.params).toEqual({ position: [20, 19.8, 4], direction: [0, 0, 1], hook: [0, 1, 0], length: '12 mm', thickness: '1.5 mm', width: '5 mm', catch_depth: '0.8 mm', catch_length: '1.5 mm', body: 'Base' });
    expect(steps[7]?.params).toMatchObject({ position: [32, 19.8, 4] });
    expect(SNAP).toEqual({ length: 12, thickness: 1.5, width: 5, catch: 0.8, catchLength: 1.5, gap: 0.2, side: 0.3, seat: 0.2, air: 0.5 });
  });

  it('refuses what cannot catch, and builds the hook with its own body\'s component active', () => {
    expect(snapOf({ ...args, to: [20, 20, 9] })).toContain('to must lie beside from');
    expect(snapOf({ ...args, wall: 1 })).toBe('wall must be 1.6–10 mm');
    expect(snapOf({ ...args, moving: 'Base' })).toBe('fixed and moving must be two bodies');
    const spec = snapOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    expect(snapProblem(spec)).toBeNull();
    // A to that also runs up the hook only names the wall's side.
    expect(snapSteps({ ...spec, toward: [0, 1, 5] })[6]?.params).toMatchObject({ hook: [0, 1, 0] });
    const listing = { components: [{ id: 0, parent: null, bodies: [] }, { id: 3, parent: 0, bodies: ['Base'], occurrences: [{ name: 'Base:1' }] }, { id: 4, parent: 0, bodies: ['Cover'], occurrences: [{ name: 'Cover:1' }] }] };
    expect(activated(snapSteps({ ...spec, more: [] }), listing).map((step) => (step.command === 'component.activate' ? `activate ${String(step.params.component)}` : step.command))).toEqual(['activate 4', 'sketch.create', 'sketch.line', 'solid.extrude', 'activate 3', 'plastic.snap_fit', 'activate 0']);
    expect(decide('partbuddy_mechanism', { kind: 'snap' })).toEqual({ allow: true });
    expect(describeToolCall('partbuddy_mechanism', { kind: 'snap', name: 'Cover clips' })).toEqual([{ key: 'snapHooks', values: { name: 'Cover clips' } }]);
  });
});

describe('a plugged connection (standards)', () => {
  // Two halves of a block meet at x = 30; the pegs grow out of the left half into the right one.
  const args = { kind: 'plug', fixed: 'Left', moving: 'Right', from: [30, 10, 10], to: [35, 10, 10], more: [[30, 20, 10]] };
  const upstream = (calls: string[][]): UpstreamTools => ({
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: (name, input) => {
      if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Left' }, { name: 'Right' }] }) }] });
      const commands = input.commands as { command: string }[];
      calls.push(commands.map((step) => step.command));
      return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : step.command === 'inspect.measure' ? { bodies: [{ bbox: { min: [0, 0, 4.2], max: [40, 30, 16] } }] } : {})) }) }] });
    },
  });

  it('cuts each pocket with its chamfered mouth, then grows the peg out of its body with a chamfered tip', () => {
    const spec = pegOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    expect(spec).toMatchObject({ diameter: 5, gap: 0.2, name: 'Peg' });
    const steps = pegSteps(spec);
    expect(steps.map((step) => [step.command, step.params.operation, (step.params.targets as string[])[0], step.params.name])).toEqual([
      ['solid.cylinder', 'cut', 'Right', 'Peg 1 ○'],
      ['solid.cone', 'cut', 'Right', 'Peg 1 ◣'],
      ['solid.cylinder', 'join', 'Left', 'Peg 1'],
      ['solid.cone', 'join', 'Left', 'Peg 1 ◢'],
      ['solid.cylinder', 'cut', 'Right', 'Peg 2 ○'],
      ['solid.cone', 'cut', 'Right', 'Peg 2 ◣'],
      ['solid.cylinder', 'join', 'Left', 'Peg 2'],
      ['solid.cone', 'join', 'Left', 'Peg 2 ◢'],
    ]);
    // The pocket: 0.2 mm of room per side and 1 mm deeper than the peg is long (7.5 mm); its mouth opens by 0.5 mm.
    expect(steps[0]?.params).toMatchObject({ diameter: '5.4 mm', height: '8.5 mm', base: [30, 10, 10], axis: [1, 0, 0] });
    expect(steps[1]?.params).toMatchObject({ diameter: '6.4 mm', top_diameter: '5.4 mm', height: '0.5 mm', base: [30, 10, 10] });
    // The peg is rooted 0.5 mm in its body and ends in a tip chamfered by 0.5 mm.
    expect(steps[2]?.params).toMatchObject({ diameter: '5 mm', height: '7.5 mm', base: [29.5, 10, 10] });
    expect(steps[3]?.params).toMatchObject({ diameter: '5 mm', top_diameter: '4 mm', height: '0.5 mm', base: [37, 10, 10] });
    expect(steps[6]?.params).toMatchObject({ base: [29.5, 20, 10] });
    expect(pegLength(8)).toBe(12);
    expect(PEG).toEqual({ ratio: 1.5, deeper: 1, chamfer: 0.5, root: 0.5, least: 5, wall: 2 });
    // Under the pocket what the print check takes for a floor or a wall (measured 2026-11-13: 0.6 mm was a thin floor).
    expect([0.25, 0.4, 0.6, 0.8].map((nozzle) => pegFloor(nozzle))).toEqual([0.8, 0.9, 1.35, 1.8]);
    // T59: from and to the same point has no way to point.
    expect(pegProblem({ ...spec, to: spec.from })).toBe('from and to must be two points: to lies further into the moving body');
    // W24: the plastic each pocket needs, 2 mm round it and 0.9 mm under it, from 0.5 mm under the face on.
    expect(pegStock(spec)).toEqual([
      { at: [30, 10, 10], base: [30.5, 10, 10], axis: [1, 0, 0], diameter: 9.4, depth: 8.9, from: 0.5, hole: 0 },
      { at: [30, 20, 10], base: [30.5, 20, 10], axis: [1, 0, 0], diameter: 9.4, depth: 8.9, from: 0.5, hole: 0 },
    ]);
  });

  it('refuses what cannot be plugged and warns of a single or a thin peg', async () => {
    expect(pegOf({ ...args, diameter: 2 })).toBe('diameter must be 3–20 mm');
    expect(pegOf({ ...args, gap: 0.8 })).toBe('gap must be 0.05–0.5 mm');
    expect(pegOf({ ...args, moving: 'Left' })).toBe('fixed and moving must be two bodies');
    const tools = withMechanismTool(upstream([]), () => 0.4);
    const two = String((await tools.callTool('partbuddy_mechanism', args)).content[0]?.text);
    expect(two).toContain('Built 2 pegs "Peg" on Left with their pockets in Right: 5 mm thick and 7.5 mm long, 0.2 mm clear per side, the pocket 1 mm deeper for air and glue, tip and mouth chamfered. It makes no joint.');
    expect(two).not.toContain('lets the parts turn');
    const one = String((await tools.callTool('partbuddy_mechanism', { ...args, more: undefined, diameter: 4, gap: 0.1 })).content[0]?.text);
    expect(one).toContain('One round peg lets the parts turn about it');
    expect(one).toContain('A peg under 5 mm printed standing is weak.');
    expect(await tools.callTool('partbuddy_mechanism', { ...args, shape: 'star' })).toMatchObject({ isError: true, content: [{ text: 'Not built: shape must be peg or dovetail' }] });
    expect(describeToolCall('partbuddy_mechanism', { kind: 'plug' })).toEqual([{ key: 'plug', values: { name: 'Peg' } }]);
    expect(describeToolCall('partbuddy_mechanism', { kind: 'plug', shape: 'dovetail' })).toEqual([{ key: 'plug', values: { name: 'Dovetail' } }]);
  });

  it('measures the plastic round and under each pocket before it cuts (audit W24, N-mechanik-12)', async () => {
    // Left from z 0 to 10, Right on it from z 10 to `top`: the peg points up from [20, 20, 10].
    const plate = (top: number) => {
      const sent: string[] = [];
      const box: Record<string, [number, number]> = { Left: [0, 10], Right: [10, top] };
      let probe = { r: 0, low: 0, high: 0 };
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (name, input) => {
          if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Left' }, { name: 'Right' }] }) }] });
          const commands = input.commands as { command: string; params: Record<string, unknown> }[];
          sent.push(commands.map((step) => step.command).join(' '));
          const results = commands.map((step) => {
            if (step.command === 'solid.cylinder' && step.params.operation === 'new') {
              const z = (step.params.base as number[])[2] ?? 0;
              probe = { r: parseFloat(String(step.params.diameter)) / 2, low: z, high: z + parseFloat(String(step.params.height)) };
            }
            if (step.command === 'inspect.interference' && (step.params.bodies as string[]).length === 2 && String((step.params.bodies as string[])[1]).startsWith('PartBuddy probe')) {
              const [z0, z1] = box[(step.params.bodies as string[])[0] ?? ''] ?? [0, 0];
              return { interferences: [{ volume_mm3: Math.PI * probe.r ** 2 * Math.max(0, Math.min(z1, probe.high) - Math.max(z0, probe.low)) }] };
            }
            return step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : step.command === 'document.inspect' ? { undo: 1, timeline: [], sketches: [] } : {};
          });
          const trial = input.rollback === true;
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(trial ? { results: results.slice(0, -1), failed: { command: 'sketch.inspect' } } : { results }) }], ...(trial ? { isError: true } : {}) });
        },
      };
      return { tools: withMechanismTool(upstream, () => 0.4), sent };
    };
    const peg = { kind: 'plug', fixed: 'Left', moving: 'Right', from: [20, 20, 10], to: [20, 20, 20] };
    // N-mechanik-12: a top of 6 mm took a pocket of 8.5 mm through it; the pocket and its floor need 9.4 mm.
    const thin = plate(16);
    const refused = await thin.tools.callTool('partbuddy_mechanism', peg);
    expect(refused.isError).toBe(true);
    expect(String(refused.content[0]?.text)).toBe('Not built: at [20, 20, 10] Right has 6 mm of plastic where 9.4 mm are needed (the mean over a width of 9.4 mm; the far side, an edge or another cut takes the rest); each pocket needs 2 mm of plastic round it and 0.9 mm under it, 9.4 mm from the face in all. Make Right thicker there, move the peg away from its edges, or use a smaller diameter (a peg is 1.5 diameters long).');
    expect(thin.sent.some((batch) => batch.includes('solid.cone'))).toBe(false);
    expect(String((await plate(19.39).tools.callTool('partbuddy_mechanism', peg)).content[0]?.text)).toContain('Not built: at [20, 20, 10] Right has 9.39 mm of plastic where 9.4 mm are needed');
    const thick = plate(19.4);
    const built = String((await thick.tools.callTool('partbuddy_mechanism', peg)).content[0]?.text);
    expect(built).toContain('PartBuddy measured Right: each pocket has 2 mm of plastic round it and 0.9 mm under it.');
    expect(built).not.toContain('round each pocket\'s axis');
    expect(thick.sent.some((batch) => batch.includes('solid.cone'))).toBe(true);
  });

  it('builds a dovetail as the guide\'s rail and groove with a close fit, and makes no joint', async () => {
    const calls: string[][] = [];
    const built = await withMechanismTool(upstream(calls), () => 0.4).callTool('partbuddy_mechanism', { kind: 'plug', shape: 'dovetail', fixed: 'Left', moving: 'Right', from: [0, 15, 4], to: [40, 15, 4] });
    expect(String(built.content[0]?.text)).toContain('Built the dovetail "Dovetail" between Left (carries the rail) and Right (has the groove): 6 mm wide at its foot and 3 mm high with 45° flanks, 0.2 mm clear all round. It makes no joint');
    expect(calls.flat()).not.toContain('joint.as_built');
    expect(calls.flat().filter((command) => command === 'solid.extrude')).toHaveLength(2);
    // W25: pressed together with 0.1 mm, as the description offers; a guide that slides keeps 0.2 at the least.
    const pressed = await withMechanismTool(upstream([]), () => 0.4).callTool('partbuddy_mechanism', { kind: 'plug', shape: 'dovetail', fixed: 'Left', moving: 'Right', from: [0, 15, 4], to: [40, 15, 4], gap: 0.1 });
    expect(String(pressed.content[0]?.text)).toContain('0.1 mm clear all round');
    expect(String((await withMechanismTool(upstream([]), () => 0.4).callTool('partbuddy_mechanism', { kind: 'plug', shape: 'dovetail', fixed: 'Left', moving: 'Right', from: [0, 15, 4], to: [40, 15, 4], gap: 0.09 })).content[0]?.text)).toBe('Not built: gap must be 0.1–1 mm');
    expect(slideOf({ fixed: 'Left', moving: 'Right', from: [0, 15, 4], to: [40, 15, 4], gap: 0.1 }, 0.4)).toBe('gap must be 0.2–1 mm');
  });
});

describe('a snap latch outside a box (standards)', () => {
  // A box 20 mm high with its lid on it; their front walls lie in the plane y = 0, which faces −Y.
  const args = { kind: 'latch', fixed: 'Box', moving: 'Lid', from: [20, 0, 20], to: [20, -5, 20] };

  it('grows the bead out of the box and the arm with its hook out of the lid, 45° faces a seat apart', () => {
    const spec = latchOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    expect(spec).toMatchObject({ up: [0, 0, 1], out: [0, -5, 0], width: 10, name: 'Latch' });
    const steps = latchSteps(spec);
    expect(steps.map((step) => [step.command, step.params.name ?? '', (step.params.targets as string[] | undefined)?.[0] ?? ''])).toEqual([
      ['sketch.create', 'Latch ◁', ''],
      ['sketch.line', '', ''],
      ['solid.extrude', 'Latch ◁', 'Box'],
      ['sketch.create', 'Latch', ''],
      ['sketch.line', '', ''],
      ['solid.extrude', 'Latch', 'Lid'],
    ]);
    // Sketch x runs out of the wall and y up; the profiles run along the wall from one edge of the latch to the other.
    expect(steps[0]?.params.plane).toEqual({ origin: [26, 0, 20], x_dir: [0, -1, 0], y_dir: [0, 0, 1] });
    expect(steps[2]?.params).toMatchObject({ distance: '12 mm', operation: 'join' });
    // The bead: a ridge 1.2 mm high with 45° faces, its crest 10.2 mm under the joint, rooted 0.5 mm in the wall.
    expect(steps[1]?.params.points).toEqual([[-0.5, -9], [0, -9], [1.2, -10.2], [0, -11.4], [-0.5, -11.4]]);
    expect(steps[3]?.params.plane).toMatchObject({ origin: [25, 0, 20] });
    expect(steps[5]?.params).toMatchObject({ distance: '10 mm', operation: 'join' });
    // The arm: a 45° slope out of the lid's wall, 1.6 mm thick and 1.5 mm off the wall, the hook's crest 0.4 mm off it
    // and 0.8 mm under the bead's, so its upper face lies on the bead's lower one without play, then 2 mm of tab.
    expect(steps[4]?.params.points).toEqual([[-0.5, 8.1], [0, 8.1], [3.1, 5], [3.1, -14.1], [1.5, -14.1], [1.5, -12.1], [0.4, -11], [1.5, -9.9], [1.5, 1], [-0.5, 1]]);
    expect(latchReach()).toEqual({ above: 8.1, below: 14.1 });
    // The strain at the root as the hook passes the bead: 1.5 · thickness · overlap / lever².
    expect((150 * LATCH.thick * (LATCH.bead - LATCH.clear)) / LATCH.lever ** 2).toBeCloseTo(1.33, 2);
  });

  it('refuses what is no wall, and is allowed and named in the work log', () => {
    expect(latchOf({ ...args, to: [20, 0, 25] })).toContain('to must lie straight out of the wall');
    expect(latchOf({ ...args, width: 3 })).toBe('width must be 5–40 mm');
    expect(latchOf({ ...args, moving: 'Box' })).toBe('fixed and moving must be two bodies');
    // On a side wall, and with a point that also lies higher: only the way out of the wall counts.
    const side = latchOf({ ...args, from: [40, 15, 20], to: [45, 15, 23] });
    if (typeof side === 'string') throw new Error(side);
    expect(latchSteps(side)[0]?.params.plane).toEqual({ origin: [40, 21, 20], x_dir: [1, 0, 0], y_dir: [0, 0, 1] });
    expect(decide('partbuddy_mechanism', { kind: 'latch' })).toEqual({ allow: true });
    expect(describeToolCall('partbuddy_mechanism', { kind: 'latch', name: 'Front latch' })).toEqual([{ key: 'latch', values: { name: 'Front latch' } }]);
  });
});
